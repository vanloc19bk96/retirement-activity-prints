"""The occupation behind a job-themed Studio page.

Four games can be written for one line of work: the Occupation Trivia Pack,
Work Lingo Match, Office Awards and Career By the Numbers. Sellers build
sub-niche books ("for Retired Firefighters", "for Retired Electricians"), and a
book's title only holds up if a few of its games are about that job. So every
one of them takes the same thing: a profile of the job.

A profile is the job's label, who the page is for, the areas a set ranges
across, the job's own care rules and the words its copy may never print. The
presets are hand-written in ``app/data/studio/occupations/prompt.json``. Any
other job the seller types is planned here, and nothing about it is trusted on
the seller's word or the model's:

* **The name, in code.** Letters, digits and a little punctuation, a few words,
  no company or brand ("Walmart greeter" is a job at a company, not a job), and
  nothing on the refused list -- checked before anything is paid for.
* **A suitability call.** One AI call decides whether a warm, KDP-safe page can
  be written for this job at all -- a real line of work, not a person, a
  company or a joke, and not one whose everyday knowledge is violence, sex,
  drugs, alcohol, gambling, politics or religion -- and, when it can, writes
  the profile. A refusal comes back to the seller as a plain reason.
* **The profile, in code again.** Every field is cleaned, bounded and checked
  against the refused and brand lists; a job with too few usable areas is not
  planned rather than planned thin.

Profiles are cached per worker by the folded name, refusals included, and one
lock per name means a book that asks for six pages of "Firefighter" at once
plans the job once. Each game still runs its own gates and blind check on
everything it writes: a profile only decides what a set is about.
"""

from __future__ import annotations

import asyncio
import logging
import re
import unicodedata
from collections import OrderedDict
from dataclasses import dataclass
from functools import cached_property, lru_cache
from typing import Any, List, Mapping

from pydantic import BaseModel

from app.services.prompt_data import (
    int_value,
    load_config,
    section,
    string_list,
    word_pattern,
)
from app.services.studio_gemini import call_gemini_json, parse_json_object

logger = logging.getLogger(__name__)

CONFIG = "occupations"
PLAN_ERROR = "Could not plan questions for this occupation. Please try again."

_WHITESPACE_RE = re.compile(r"\s+")
_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 '&/.\-]*$")
_LETTER_RE = re.compile(r"[A-Za-z]")
_AREA_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ,'’\-–().:;&/]*$")
_PROSE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ,'’\-–().:;&/!?\"“”]*$")
_TERM_RE = re.compile(r"^[a-z][a-z '\-]*[a-z]$")
_NEVER_RE = re.compile(r"(?!x)x")


class OccupationProfileModelOutput(BaseModel):
    """Gemini response_schema for planning a typed occupation."""

    suitable: bool
    reason: str
    label: str
    who: str
    areas: List[str]
    care: str
    blocked_terms: List[str]


class OccupationNotSuitableError(Exception):
    """The typed occupation cannot be used; the message is the seller-facing reason."""


class OccupationPlanError(Exception):
    """The occupation could not be planned this time (model failure, thin profile)."""


@dataclass(frozen=True)
class OccupationProfile:
    """Everything a job-themed game needs to know about one line of work.

    ``key`` is what the client keys its memory and labels by: a preset's id, or
    the typed name folded to lower case. ``custom`` is true for typed jobs.
    """

    key: str
    label: str
    who: str
    areas: tuple[str, ...]
    care: str
    blocked_terms: tuple[str, ...]
    custom: bool = False

    @cached_property
    def blocked_re(self) -> re.Pattern[str]:
        return word_pattern(self.blocked_terms) if self.blocked_terms else _NEVER_RE


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(CONFIG)


def _limit(key: str) -> int:
    return int_value(section(_config(), "limits"), key)


@lru_cache(maxsize=1)
def _refused_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "refusedTerms"))


@lru_cache(maxsize=1)
def _brand_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "brandTerms"))


# ---------------------------------------------------------------- presets


def preset_keys() -> tuple[str, ...]:
    return tuple(section(_config(), "presets").keys())


@lru_cache(maxsize=None)
def preset_profile(key: str) -> OccupationProfile:
    raw = section(section(_config(), "presets"), key)
    return OccupationProfile(
        key=key,
        label=str(raw["label"]),
        who=str(raw["who"]),
        areas=string_list(raw, "areas"),
        care=str(raw["care"]),
        blocked_terms=string_list(raw, "blockedTerms"),
    )


# ---------------------------------------------------------------- the typed name


def clean_occupation(raw: Any) -> str:
    """The typed name as it should read: NFKC, straight apostrophes, single spaces."""
    text = unicodedata.normalize("NFKC", str(raw or "")).replace("’", "'").replace("‘", "'")
    return _WHITESPACE_RE.sub(" ", text).strip()


def fold_occupation(raw: Any) -> str:
    """The key a typed job is remembered by. Mirrors ``foldOccupation`` on the client."""
    return clean_occupation(raw).lower()


def occupation_name_problem(raw: Any) -> str | None:
    """Why a typed name cannot be planned, in the seller's terms, or None."""
    name = clean_occupation(raw)
    if not name:
        return "Type an occupation."
    if len(name) > _limit("maxNameChars"):
        return f"Keep the occupation under {_limit('maxNameChars')} characters."
    if len(name.split(" ")) > _limit("maxNameWords"):
        return f"Keep the occupation to {_limit('maxNameWords')} words or fewer."
    if not _NAME_RE.match(name) or len(_LETTER_RE.findall(name)) < _limit("minNameLetters"):
        return "Use letters and spaces for the occupation, like “Firefighter” or “Bus driver”."
    if _brand_re().search(name):
        return "Name the job rather than a company or brand, like “Delivery driver”."
    if _refused_re().search(name):
        return "This occupation can’t be used in a KDP activity book. Please choose another."
    return None


def preset_for_name(raw: Any) -> str | None:
    """The preset a typed name means ("teacher", "Police"), so a preset is never re-planned."""
    folded = fold_occupation(raw)
    for key in preset_keys():
        if folded in (key, preset_profile(key).label.lower()):
            return key
    return None


# ---------------------------------------------------------------- the plan


def _build_prompt(name: str) -> str:
    count = _limit("areaCount")
    return f"""A seller of large-print retirement activity books typed this occupation for a
book's job-themed pages: "{name}".

The pages are printed and sold on Amazon KDP, read by people who retired from
this job and given as warm retirement gifts: trivia about the job's tools,
terms and history, its workplace phrases, light coworker awards and fun
career estimates. First decide whether such pages can be written for it.

"suitable" is true only if ALL of these hold:
- It is a real, recognisable line of work that people retire from -- not a
  person's name, a company, brand or product, a fictional or joke job, a hobby,
  or text that is not a job at all.
- Its everyday knowledge can fill warm, respectful pages without violence or
  weapons as the subject, sex, drugs, alcohol, gambling, politics or religion,
  and without mocking anyone. (Police, military and nursing work are fine:
  their history, kit, routines and traditions are the subject, never combat,
  injury or medical advice.)
- It is broad enough for at least {count} different corners of the job.
"reason": if not suitable, one short sentence to the seller saying why, kind
and plain ("This is a company rather than a job."); if suitable, "".

If suitable, describe the job (otherwise leave the fields empty):
- "label": the job in Title Case, singular, at most {_limit('maxLabelChars')} characters
  ("Firefighter", "Bus Driver").
- "who": the people the pages are for, plural and lower case, at most
  {_limit('maxWhoChars')} characters ("firefighters and fire service crews").
- "areas": exactly {count} different corners of this job's own world, each a short
  noun phrase of at most {_limit('maxAreaChars')} characters: its tools and equipment,
  vehicles or machines, workplaces, uniforms and kit, everyday terms and jargon,
  routines and shifts, training, traditions and customs, the people worked
  alongside, how the work changed through the decades, and its history. Each
  must belong to THIS job, never work in general. No brands, no living people.
- "care": one or two sentences of rules for writing about this job kindly and
  safely: what to keep clear of (tragedies, accidents, injuries, controversies,
  advice that could be followed as instructions, current rules or laws) and how
  to stay fair to workers from different countries and decades.
- "blocked_terms": up to {_limit('maxBlockedTerms')} lower-case words or short phrases this
  job's pages must never print because they lead to its dark side.

Return JSON only:
{{ "suitable": true, "reason": "", "label": "Firefighter",
  "who": "firefighters and fire service crews",
  "areas": ["fire engines, ladders and hose", "..."],
  "care": "Never describe fires that took lives or injuries; ...",
  "blocked_terms": ["burn victim", "..."] }}
"""


def _clean_line(raw: Any, *, max_chars: int, pattern: re.Pattern[str]) -> str | None:
    text = clean_occupation(raw).strip(" .;")
    if not text or len(text) > max_chars or not pattern.match(text):
        return None
    if _refused_re().search(text) or _brand_re().search(text):
        return None
    return text


def _clean_areas(raw: Any) -> tuple[str, ...]:
    out: list[str] = []
    seen: set[str] = set()
    for value in raw if isinstance(raw, list) else []:
        area = _clean_line(value, max_chars=_limit("maxAreaChars"), pattern=_AREA_RE)
        if area is None or len(area) < _limit("minAreaChars"):
            continue
        folded = area.lower()
        if folded in seen:
            continue
        seen.add(folded)
        out.append(area)
    return tuple(out[: _limit("areaCount")])


def _clean_terms(raw: Any) -> tuple[str, ...]:
    out: list[str] = []
    for value in raw if isinstance(raw, list) else []:
        term = clean_occupation(value).lower()
        if (
            term
            and len(term) <= _limit("maxBlockedTermChars")
            and _TERM_RE.match(term)
            and term not in out
        ):
            out.append(term)
    return tuple(out[: _limit("maxBlockedTerms")])


def _reason(raw: Any) -> str:
    text = clean_occupation(raw)
    if not text or len(text) > _limit("maxReasonChars") or not _PROSE_RE.match(text):
        return "This occupation can’t be used for these pages. Please choose another."
    return text if text.endswith((".", "!", "?")) else f"{text}."


def profile_from_reply(name: str, data: Mapping[str, Any]) -> OccupationProfile:
    """Turn the planner's reply into a profile, or raise.

    Raises :class:`OccupationNotSuitableError` with the seller-facing reason
    when the planner refused the job, and :class:`OccupationPlanError` when the
    reply is too thin to build a varied set from.
    """
    if data.get("suitable") is not True:
        raise OccupationNotSuitableError(_reason(data.get("reason")))

    areas = _clean_areas(data.get("areas"))
    who = _clean_line(data.get("who"), max_chars=_limit("maxWhoChars"), pattern=_AREA_RE)
    care = _clean_line(data.get("care"), max_chars=_limit("maxCareChars"), pattern=_PROSE_RE)
    label = _clean_line(data.get("label"), max_chars=_limit("maxLabelChars"), pattern=_NAME_RE)
    if len(areas) < _limit("minAreas") or who is None or care is None:
        raise OccupationPlanError(PLAN_ERROR)
    return OccupationProfile(
        key=fold_occupation(name),
        label=label or name,
        who=who.lower(),
        areas=areas,
        care=care if care.endswith(".") else f"{care}.",
        blocked_terms=_clean_terms(data.get("blocked_terms")),
        custom=True,
    )


async def _call_planner(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        # A judgement and a plan, not creative writing: the same job should be
        # judged the same way every time it is typed.
        temperature=0.2,
        max_output_tokens=_limit("maxOutputTokens"),
        response_schema=OccupationProfileModelOutput,
        thinking_level="low",
        label="occupation_profile",
    )


# Planned profiles and refusals, newest last, keyed by the folded name.
_cache: "OrderedDict[str, OccupationProfile | OccupationNotSuitableError]" = OrderedDict()
_locks: dict[str, asyncio.Lock] = {}


def _cached(key: str) -> OccupationProfile | OccupationNotSuitableError | None:
    hit = _cache.get(key)
    if hit is not None:
        _cache.move_to_end(key)
    return hit


def _store(key: str, value: OccupationProfile | OccupationNotSuitableError) -> None:
    _cache[key] = value
    _cache.move_to_end(key)
    while len(_cache) > _limit("cacheSize"):
        evicted, _ = _cache.popitem(last=False)
        _locks.pop(evicted, None)


def _raise_or_return(hit: OccupationProfile | OccupationNotSuitableError) -> OccupationProfile:
    if isinstance(hit, OccupationNotSuitableError):
        raise OccupationNotSuitableError(str(hit))
    return hit


async def custom_profile(raw_name: Any) -> OccupationProfile:
    """Plan a typed occupation, or raise why it cannot be used.

    A name that is a preset returns the preset. A refusal is remembered like a
    profile, so a seller retrying the same job is told again without a call; a
    failed call is not, so the next try plans afresh.
    """
    problem = occupation_name_problem(raw_name)
    if problem:
        raise OccupationNotSuitableError(problem)
    preset = preset_for_name(raw_name)
    if preset:
        return preset_profile(preset)

    name = clean_occupation(raw_name)
    key = fold_occupation(name)
    hit = _cached(key)
    if hit is not None:
        return _raise_or_return(hit)

    lock = _locks.setdefault(key, asyncio.Lock())
    async with lock:
        hit = _cached(key)
        if hit is not None:
            return _raise_or_return(hit)
        try:
            data = parse_json_object(await _call_planner(_build_prompt(name)))
            profile = profile_from_reply(name, data)
        except OccupationNotSuitableError as exc:
            logger.info("studio_occupation_refused name=%s reason=%s", key, exc)
            _store(key, exc)
            raise
        except OccupationPlanError:
            logger.warning("studio_occupation_thin_plan name=%s", key)
            raise
        except Exception as exc:
            logger.warning("studio_occupation_plan_failed name=%s error=%s", key, exc)
            raise OccupationPlanError(PLAN_ERROR) from exc
        _store(key, profile)
        logger.info("studio_occupation_planned name=%s areas=%s", key, len(profile.areas))
        return profile


async def resolve_occupation(preset: str | None, custom: Any) -> OccupationProfile:
    """The profile a request names: the typed job when there is one, else the preset."""
    if clean_occupation(custom):
        return await custom_profile(custom)
    if preset and preset in preset_keys():
        return preset_profile(preset)
    raise OccupationNotSuitableError("Pick an occupation, or type your own.")


def custom_line(profile: OccupationProfile, *, subject: str) -> str:
    """A workplace line for the prompt of a game that names the kind of work.

    ``subject`` is who worked there in that game's words ("The team",
    "The retiree").
    """
    return (
        f"{subject} worked as {profile.who} ({profile.label}). Use that job's own "
        "workplace, tools, shifts and routines where they fit naturally, so a "
        f"retired {profile.label.lower()} recognises their own work in every line, "
        "but keep the set varied and never lean on jargon an outsider would not "
        f"follow. {profile.care}"
    )


def clear_cache_for_tests() -> None:
    _cache.clear()
    _locks.clear()


def build_prompt_for_tests(name: str) -> str:
    return _build_prompt(name)
