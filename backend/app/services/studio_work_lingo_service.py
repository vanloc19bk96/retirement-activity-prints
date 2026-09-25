"""Generate Work Lingo Match pairs via Gemini.

A pair is a workplace phrase and its plain-English meaning. The page prints the
phrases numbered and the meanings shuffled apart and lettered; the reader
writes each meaning's letter beside its phrase:

    1. Circle back              C. Return to the topic later

This is printed and sold on KDP, and a matching puzzle with two answers that fit
one phrase -- or a phrase nobody has ever said -- is the whole product failing,
so nothing reaches the page on the writer's word alone:

* **Shape first.** A phrase is one to six words of plain letters, starting with
  a capital, never an acronym. A meaning is a short plain phrase of three to
  ten words that never repeats a word of its own phrase ("Think outside the
  box" -> "Come up with fresh, unusual ideas", never "Think in new ways").
  Labels, numbering, quotation marks and anything over the page's budgets are
  dropped, not repaired.
* **A blind check that solves the puzzle.** A second call is shown every phrase
  and every meaning, the meanings shuffled apart, and has to match each phrase
  back to its meaning without being told which is which. It then rates the
  pair: a real expression, an accurate workplace meaning, the only meaning on
  the list that fits, familiar enough for the level, and suitable. A pair
  survives only when the match comes back right and every rating is true, and a
  meaning picked for two phrases fails both. If the check cannot run, nothing
  is returned.
* **Checked as one set.** Every pair a response returns passed the same check
  call, alongside every other pair it is returned with. When a second round
  tops the pool up, the check runs again over the whole pool, never only over
  the newcomers, so a page built from any subset of a response is a fair
  puzzle.
* **One phrase family per pool.** Phrases are compared on their content words,
  with function words, pronouns, light verbs ("take", "put") and particles
  dropped and endings folded. Two phrases sharing a word ("back burner" /
  "circle back") never share a pool, two meanings sharing most of their words
  never do, and a meaning that echoes another pair's phrase is dropped. A
  phrase whose words match or contain one already printed ("Back burner" /
  "Put it on the back burner") is a repeat, checked against the client's book
  and this worker's memory.
* **Nothing sensitive.** Phrases with offensive or insensitive origins, age,
  health, death and violence, crude words, religion, politics, alcohol and
  brand names are dropped.

Variety is structural. Each requested pair gets its own brief -- a workplace
area and an era, sampled by seed from twenty areas and four eras -- so a reply
ranges across the office rather than ten ways to say "let's talk later".
"""

from __future__ import annotations

import logging
import random
import re
import time
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Iterable, Mapping, Sequence

from app.core.config import settings
from app.schemas.studio_work_lingo import (
    WorkLingoCheckOutput,
    WorkLingoModelOutput,
    WorkLingoPair,
    WorkLingoRequest,
    WorkLingoResponse,
)
from app.services.prompt_data import (
    int_value,
    load_config,
    locale_line,
    section,
    string_list,
    word_pattern,
)
from app.services.studio_gemini import (
    RateLimiter,
    StudioGenerationError,
    StudioRateLimitError,
    call_gemini_json,
    parse_json_object,
)
from app.services.studio_variety import (
    VarietyScope,
    bucket_key,
    recent,
    remember,
    with_variety,
)

logger = logging.getLogger(__name__)

GAME = "work-lingo-match"
FINAL_ERROR = "Could not write workplace phrases good enough to print. Please try again."
CHECK_ERROR = "Could not check these workplace phrases. Please try again."
# Remembered labels a new phrase is checked against. Bounded, so the check stays
# a few thousand token comparisons however long a seller keeps going.
MEMORY_FILTER_LIMIT = 200
AVOID_LABEL_CHARS = 60
LEVELS = ("gentle", "classic", "challenging")

_FINANCE_RE = re.compile(
    r"\bguaranteed\s+(return|income|profit)|\binvest\s+now\b|\bget[\s-]?rich\b|"
    r"\bcrypto|\bbitcoin\b|\bday[\s-]?trad|\bpenny\s+stock",
    re.IGNORECASE,
)
_PHRASE_RE = re.compile(r"^[A-Za-z][A-Za-z ,'’\-]*[A-Za-z]$")
_MEANING_RE = re.compile(r"^[A-Za-z][A-Za-z0-9 ,'’\-]*[A-Za-z0-9]$")
_NUMBER_RE = re.compile(r"^\s*(\(?(\d{1,2}|[A-Za-z])[.):]\s+|[-*•]\s+)")
_PHRASE_LABEL_RE = re.compile(r"^\s*(phrase|jargon|expression|term)\s*[:\-–]\s*", re.IGNORECASE)
_MEANING_LABEL_RE = re.compile(r"^\s*(meaning|means|definition)\s*[:\-–]\s*", re.IGNORECASE)
_EDGE_TRIM_CHARS = "\"'“”‘’ "
_TOKEN_RE = re.compile(r"[a-z0-9]+")


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


@lru_cache(maxsize=1)
def _blocked_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "blockedTerms"))


@lru_cache(maxsize=1)
def _brand_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "brandTerms"))


@lru_cache(maxsize=1)
def _qualifiers() -> frozenset[str]:
    return frozenset(w.lower() for w in string_list(_config(), "qualifierWords"))


_rate_limiter = RateLimiter(
    label="Work Lingo Match",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class WorkLingoRateLimitError(StudioRateLimitError):
    """User exceeded the short-window Work Lingo Match quota."""


class WorkLingoGenerationError(StudioGenerationError):
    """Model output could not be turned into verified phrase pairs."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise WorkLingoRateLimitError(str(exc)) from exc


def _scope(user_id: str, seed: int) -> VarietyScope:
    """One memory for every level: a phrase printed on a Gentle page must not return on a Classic one."""
    return VarietyScope(game=GAME, user_id=user_id, bucket=bucket_key("all"), seed=seed)


@dataclass(frozen=True)
class Budgets:
    phrase: int
    meaning: int


def budgets_for(req: WorkLingoRequest) -> Budgets:
    limits = _limits()
    return Budgets(
        phrase=min(int_value(limits, "maxPhraseChars"), req.max_phrase_chars),
        meaning=min(int_value(limits, "maxMeaningChars"), req.max_meaning_chars),
    )


# ---------------------------------------------------------------- text keys


def is_unsafe(text: str) -> bool:
    return bool(_FINANCE_RE.search(text) or _blocked_re().search(text) or _brand_re().search(text))


def _stem(token: str) -> str:
    """Fold plurals, regular verb endings and a final e. Deliberately crude.

    Only ever compared with another stem: "circling" and "circle" both become
    "circl", "bases" and "base" both "bas".
    """
    if len(token) > 4 and token.endswith("ies"):
        token = token[:-3] + "y"
    elif len(token) > 4 and token.endswith(("ches", "shes", "sses", "xes", "zes")):
        token = token[:-2]
    elif len(token) > 5 and token.endswith("ing"):
        token = token[:-3]
    elif len(token) > 4 and token.endswith("ed"):
        token = token[:-2]
    elif len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        token = token[:-1]
    if len(token) > 3 and token.endswith("e"):
        token = token[:-1]
    return token


def _raw_tokens(text: str) -> list[str]:
    folded = text.lower().replace("’", "'").replace("'s ", " ").replace("'", "")
    return _TOKEN_RE.findall(folded)


def content_tokens(text: str) -> frozenset[str]:
    """The words that carry a phrase or meaning: function words dropped, endings folded."""
    return frozenset(_stem(word) for word in _raw_tokens(text) if word not in _qualifiers())


def _jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    union = a | b
    return len(a & b) / len(union) if union else 1.0


def _folded(text: str) -> str:
    return " ".join(_raw_tokens(text))


def phrases_repeat(first: str, second: str) -> bool:
    """True when the two are one phrase: "Back burner" / "Put it on the back burner"."""
    a, b = content_tokens(first), content_tokens(second)
    if not a or not b:
        return _folded(first) == _folded(second)
    return a <= b or b <= a


def phrases_related(first: str, second: str) -> bool:
    """True when two phrases share a word and so may share a meaning.

    "Circle back" and "Back burner" both come down to "later"; "Loop someone
    in" and "Keep me in the loop" both to "keep informed". A page never holds
    two of one family, so neither can be matched to the other's meaning.
    """
    a, b = content_tokens(first), content_tokens(second)
    return phrases_repeat(first, second) or bool(a & b)


def meanings_clash(first: str, second: str) -> bool:
    """True when two meanings read alike enough for a reader to swap them."""
    a, b = content_tokens(first), content_tokens(second)
    if not a or not b:
        return _folded(first) == _folded(second)
    return _jaccard(a, b) >= 0.5 or len(a & b) >= 3


def echoes_phrase(meaning: str, phrase: str) -> bool:
    """True when a meaning repeats a word of a phrase -- its own, or a neighbour's as a false cue."""
    return bool(content_tokens(meaning) & content_tokens(phrase))


def pairs_conflict(pair: WorkLingoPair, other: WorkLingoPair) -> bool:
    return (
        phrases_related(pair.phrase, other.phrase)
        or meanings_clash(pair.meaning, other.meaning)
        or echoes_phrase(pair.meaning, other.phrase)
        or echoes_phrase(other.meaning, pair.phrase)
    )


def phrase_label(phrase: str) -> str:
    """What a printed phrase is remembered by: its words, lower-cased, inside the label cap."""
    return _folded(phrase)[:AVOID_LABEL_CHARS].strip() or phrase[:AVOID_LABEL_CHARS]


# ---------------------------------------------------------------- gates


def _clean(raw: Any) -> str:
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    return text.strip(_EDGE_TRIM_CHARS)


def _mostly_caps(text: str) -> bool:
    letters = [ch for ch in text if ch.isalpha()]
    return not letters or sum(ch.isupper() for ch in letters) > len(letters) * 0.4


def _strip_labels(raw: Any, label: re.Pattern[str]) -> str:
    text = _clean(raw)
    for pattern in (_NUMBER_RE, label):
        text = pattern.sub("", text).strip()
    text = text.strip(_EDGE_TRIM_CHARS)
    # One closing full stop is punctuation, not part of the phrase.
    if text.endswith(".") and not text.endswith(".."):
        text = text[:-1].rstrip()
    return text


def normalize_phrase(raw: Any, *, budget: int) -> str | None:
    """The phrase as printed: plain words, starting with a capital, never an acronym -- or None."""
    text = _strip_labels(raw, _PHRASE_LABEL_RE)
    if not text or not _PHRASE_RE.match(text):
        return None
    if not text[0].isupper() or _mostly_caps(text):
        return None
    limits = _limits()
    if len(text.split()) > int_value(limits, "maxPhraseWords"):
        return None
    if not int_value(limits, "minPhraseChars") <= len(text) <= budget:
        return None
    if not content_tokens(text) or is_unsafe(text):
        return None
    return text


def normalize_meaning(raw: Any, *, budget: int) -> str | None:
    """The meaning as printed: a short plain phrase with no closing full stop -- or None."""
    text = _strip_labels(raw, _MEANING_LABEL_RE)
    if not text or not _MEANING_RE.match(text):
        return None
    if not text[0].isupper() or _mostly_caps(text):
        return None
    limits = _limits()
    words = len(text.split())
    if not int_value(limits, "minMeaningWords") <= words <= int_value(limits, "maxMeaningWords"):
        return None
    if not int_value(limits, "minMeaningChars") <= len(text) <= budget:
        return None
    if is_unsafe(text):
        return None
    return text


def normalize_pair(raw: Any, *, budgets: Budgets) -> WorkLingoPair | None:
    """One complete, well-formed pair -- or None. Never a repaired one.

    Well-formed is not fair: this is every check that can be made without
    knowing the phrase. The blind check decides the rest.
    """
    if not isinstance(raw, dict):
        return None
    phrase = normalize_phrase(raw.get("phrase"), budget=budgets.phrase)
    if phrase is None:
        return None
    meaning = normalize_meaning(raw.get("meaning"), budget=budgets.meaning)
    if meaning is None or echoes_phrase(meaning, phrase):
        return None
    # Never verified here, whatever the input claims: only the checker marks a pair.
    return WorkLingoPair(phrase=phrase, meaning=meaning)


def filter_pairs(
    raw_items: Iterable[Any],
    *,
    budgets: Budgets,
    cap: int,
    avoid: Iterable[str] = (),
    kept: Sequence[WorkLingoPair] = (),
) -> list[WorkLingoPair]:
    """Keep the well-formed pairs a pool can hold without repeating the book.

    ``kept`` is what the pool already holds: nothing may conflict with it.
    ``avoid`` holds phrases already printed (full or compact).
    """
    avoided = [label for label in (str(a or "").strip() for a in avoid) if label]
    out: list[WorkLingoPair] = []
    for raw in raw_items:
        pair = normalize_pair(raw, budgets=budgets)
        if pair is None:
            continue
        if any(pairs_conflict(pair, other) for other in (*kept, *out)):
            continue
        if any(phrases_repeat(pair.phrase, label) for label in avoided):
            continue
        out.append(pair)
        if len(out) >= cap:
            break
    return out


# ---------------------------------------------------------------- the writer


def _parse_payload(raw: str) -> list[Any]:
    data = parse_json_object(raw)
    items = data.get("items", data.get("pairs"))
    if not isinstance(items, list) or not items:
        raise ValueError("invalid JSON: missing items")
    return items


def _level(req: WorkLingoRequest) -> Mapping[str, Any]:
    return section(section(_config(), "levels"), req.level)


def _briefs(want: int, seed: int) -> list[str]:
    """One distinct brief per pair: a workplace area and an era.

    Areas and eras are shuffled by seed independently, so the same area meets
    a different era on the next page, and no area repeats within a reply until
    every other one has been used.
    """
    rng = random.Random(seed)
    areas = list(string_list(_config(), "areas"))
    eras = list(string_list(_config(), "eras"))
    rng.shuffle(areas)
    rng.shuffle(eras)
    return [
        f"{index + 1}. area: {areas[index % len(areas)]}; era: {eras[index % len(eras)]}"
        for index in range(want)
    ]


def _build_prompt(req: WorkLingoRequest, *, seed: int | None = None) -> str:
    limits = _limits()
    want = min(int_value(limits, "maxWrite"), req.count + 4)
    prompt_seed = req.seed if seed is None else seed
    language = locale_line(section(_config(), "locale"), req.locale)
    budgets = budgets_for(req)
    briefs = "\n".join(_briefs(want, prompt_seed))
    example = section(_config(), "example")
    phrase_words = int_value(limits, "maxPhraseWords")
    meaning_words = int_value(limits, "maxMeaningWords")

    return f"""Create workplace-jargon pairs for "Work Lingo Match", a matching puzzle in a
large-print retirement activity book, read by retirees and older adults who
worked in all kinds of jobs. The page lists the workplace phrases and, shuffled
apart, their plain-English meanings. The reader matches each phrase to its
meaning -- a fond "how many of these do you remember from work?".

Level -- {_level(req)["writer"]}

Write exactly {want} pairs, one per brief, in this order:
{briefs}

How to build each pair -- in this order:
1. "area": the brief's area, copied.
2. "phrase": a real, established workplace expression, business idiom or
   office saying from that area and era, as people actually say it
   ("Touch base", "Move the needle", "Low-hanging fruit", "Keep me in the loop").
3. "meaning": what the phrase communicates at work, in plain English.

Phrases:
- Real and well established: never invent, blend or adapt a phrase to fill a
  brief. If the brief suggests nothing real, pick a real phrase from a nearby
  area.
- 1 to {phrase_words} words, at most {budgets.phrase} characters, starting with a capital
  letter. No acronyms or abbreviations (no ASAP, EOD, KPI), no brand names, no
  slogans, no quotations, no one company's internal terms.
- Recognisable across English-speaking workplaces, not one country's slang,
  one profession's jargon or brand-new startup and technology talk.
- A phrase with several common meanings: use its clearest workplace meaning,
  or pick another phrase.
- Every phrase in this reply is different, and no two share a word ("back
  burner" and "circle back" cannot both appear). Never two phrases that mean
  the same thing ("touch base" and "check in").

Meanings:
- What the phrase means at work, not its literal words: "Circle back" means
  "Return to the topic later", not "Walk around in a circle".
- 3 to {meaning_words} words, at most {budgets.meaning} characters. A short plain phrase,
  starting with a capital, with no full stop.
- Never repeat a word of its phrase, and never a word of another phrase in
  this reply.
- Specific enough that it fits its own phrase and no other in the reply: no two
  meanings may say similar things, and none so broad it could fit several
  phrases ("Do a good job", "Talk about something").
- Your own wording, never copied from a dictionary, website or book.

Tone: warm, nostalgic and respectful of working life. Never mock workers,
bosses, retirees or older people.

Never:
- Phrases with offensive, insensitive or stereotyped origins or wording, or any
  about age or being old, health, death, violence, weapons, sex, alcohol,
  gambling, politics or religion. Nothing crude.
- Brand names, trademarks, company slogans, advertising taglines, celebrities,
  song, film or TV lines.
{language}

Return JSON only:
{{ "items": [
  {{ "brief": 1, "area": "{example['area']}", "phrase": "{example['phrase']}",
    "meaning": "{example['meaning']}" }} ] }}
"""


async def _call_writer(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        temperature=0.9,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=WorkLingoModelOutput,
        label="work_lingo",
    )


# ---------------------------------------------------------------- the checker


def _letter(position: int) -> str:
    return chr(65 + position)


@dataclass(frozen=True)
class CheckPlan:
    """How the candidates were shown to the checker, so its reply maps back.

    ``meaning_order[pos]`` is the candidate whose meaning is shown at letter
    ``pos`` (A = 0).
    """

    prompt: str
    meaning_order: tuple[int, ...]


def build_check_plan(
    candidates: Sequence[WorkLingoPair], seed: int, level: str = "classic"
) -> CheckPlan:
    """A prompt that never says which meaning belongs to which phrase.

    Phrases keep their numbers; meanings are shuffled and lettered, so the
    checker solves the very puzzle the reader will. A meaning that does not
    follow from its phrase gets matched wrong, and one that fits two phrases is
    caught when it is picked twice.
    """
    rng = random.Random(seed ^ 0x3171A6)
    order = list(range(len(candidates)))
    rng.shuffle(order)
    phrases = "\n".join(f"{index + 1}. {pair.phrase}" for index, pair in enumerate(candidates))
    meanings = "\n".join(
        f"{_letter(pos)}. {candidates[k].meaning}" for pos, k in enumerate(order)
    )
    familiar = str(section(section(_config(), "levels"), level)["checker"])

    prompt = f"""You are a strict editor for a published, large-print puzzle book for retirees
and older adults. The puzzle: match each workplace phrase to its plain-English
meaning. An invented phrase, a wrong meaning, or a meaning that fits two
phrases makes the puzzle unfair and means refunds, so when in doubt, answer
false.

Below are numbered PHRASES and lettered MEANINGS. Each phrase was written with
exactly one of the meanings, but the meanings are shuffled: their order means
nothing.

Step 1 -- For each phrase, pick the letter of the meaning that fits it best,
as the phrase is used at work. Use "none" if no meaning truly fits.

Step 2 -- Judge that phrase together with the meaning you picked:
- "real": an established workplace expression or business idiom that people
  genuinely say -- not invented or blended, not an acronym, slogan, quotation
  or one company's internal term.
- "accurate": the meaning says what the phrase communicates at work in most
  English-speaking workplaces -- not its literal words, and not a sense only
  one country, profession or era would give it.
- "one_meaning": no other meaning on the list could reasonably be matched to
  this phrase, and this meaning could not reasonably be matched to any other
  phrase on the list.
- "familiar": {familiar}.
- "suitable": clean and respectful. No offensive, insensitive or stereotyped
  origin or wording; nothing about age or being old, health, death, violence,
  sex, alcohol, gambling, politics or religion; no brands or slogans.

PHRASES
{phrases}

MEANINGS
{meanings}

Return JSON only, one entry per phrase:
{{ "items": [ {{ "index": 1, "match": "C", "real": true, "accurate": true,
  "one_meaning": true, "familiar": true, "suitable": true }} ] }}
"""
    return CheckPlan(prompt=prompt, meaning_order=tuple(order))


def _matched(raw: Any, plan: CheckPlan) -> int | None:
    """The candidate whose meaning the checker picked, or None."""
    letter = str(raw or "").strip().upper().rstrip(".")
    if len(letter) != 1 or not "A" <= letter <= "Z":
        return None
    position = ord(letter) - 65
    if position >= len(plan.meaning_order):
        return None
    return plan.meaning_order[position]


def apply_check(
    candidates: Sequence[WorkLingoPair],
    plan: CheckPlan,
    raw_check: Mapping[str, Any],
) -> list[WorkLingoPair]:
    """The candidates the checker independently matched and passed, marked verified.

    A pair passes only when the meaning the checker picked for its phrase is
    its own, and it is real, accurate, one-meaning, familiar and suitable. A
    missing, duplicated or malformed entry fails the pair it belongs to, and a
    meaning the checker picked for two phrases fails both: if it fits either,
    it does not belong to one.
    """
    entries: dict[int, Mapping[str, Any]] = {}
    for entry in raw_check.get("items") or []:
        if not isinstance(entry, Mapping):
            continue
        try:
            index = int(entry.get("index"))
        except (TypeError, ValueError):
            continue
        entries.setdefault(index, entry)

    picks = Counter(
        pick
        for entry in entries.values()
        if (pick := _matched(entry.get("match"), plan)) is not None
    )
    flags = ("real", "accurate", "one_meaning", "familiar", "suitable")
    kept: list[WorkLingoPair] = []
    for index, pair in enumerate(candidates):
        entry = entries.get(index + 1)
        if entry is None:
            continue
        if _matched(entry.get("match"), plan) != index or picks[index] != 1:
            continue
        if not all(entry.get(flag) is True for flag in flags):
            continue
        kept.append(pair.model_copy(update={"verified": True}))
    return kept


async def _call_checker(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        # Deterministic judging, with room to reason: this call is what keeps
        # invented phrases and ambiguous meanings out of a printed book.
        temperature=0.0,
        max_output_tokens=int_value(_limits(), "checkMaxOutputTokens"),
        response_schema=WorkLingoCheckOutput,
        thinking_level="low",
        model=settings.STUDIO_FACT_CHECK_MODEL or None,
        label="work_lingo_check",
    )


async def verify_pairs(
    candidates: Sequence[WorkLingoPair], seed: int, level: str = "classic"
) -> list[WorkLingoPair]:
    """Run the blind check over the whole set. Raises when the check itself could not run."""
    if not candidates:
        return []
    plan = build_check_plan(candidates, seed, level)
    raw = await _call_checker(plan.prompt)
    return apply_check(candidates, plan, parse_json_object(raw))


# ---------------------------------------------------------------- the run


def _min_pairs(cap: int) -> int:
    """Below this the page may not fill, so another round is worth its cost.

    Every round is two paid calls, and the client asks for spares on top of
    its fullest page; two thirds of that is a full page for the common trim.
    """
    return max(1, (cap * 2 + 2) // 3)


async def generate_work_lingo(req: WorkLingoRequest, user_id: str) -> WorkLingoResponse:
    _check_rate_limit(user_id)

    budgets = budgets_for(req)
    cap = min(int_value(_limits(), "poolSize"), req.count)
    attempts = int_value(_limits(), "maxAttempts")
    last_error = FINAL_ERROR
    started = time.perf_counter()
    kept: list[WorkLingoPair] = []
    written = checked = 0
    # What this seller printed before: the client's list (spans workers and
    # restarts) plus this worker's own memory. A phrase that repeats either is
    # dropped here, not just discouraged in the prompt.
    printed = [*req.avoid, *recent(_scope(user_id, req.seed), MEMORY_FILTER_LIMIT)]

    for attempt in range(attempts):
        seed = req.seed + attempt * 97
        scope = _scope(user_id, seed)
        avoid = [*req.avoid, *(phrase_label(pair.phrase) for pair in kept)]
        prompt = with_variety(_build_prompt(req, seed=seed), scope, client_avoid=avoid)
        try:
            raw = await _call_writer(prompt)
            items_raw = _parse_payload(raw)
        except Exception as exc:
            logger.warning("studio_work_lingo_write_failed attempt=%s error=%s", attempt + 1, exc)
            last_error = "The AI did not return valid workplace phrases. Please try again."
            continue

        written += len(items_raw)
        fresh = filter_pairs(
            items_raw,
            budgets=budgets,
            cap=int_value(_limits(), "maxWrite"),
            avoid=printed,
            kept=kept,
        )
        if not fresh:
            last_error = FINAL_ERROR
            continue
        # The whole pool is checked together, the pairs already kept included:
        # only pairs that passed side by side may share a page.
        pool = [pair.model_copy(update={"verified": False}) for pair in (*kept, *fresh)]
        checked += len(pool)
        try:
            confirmed = await verify_pairs(pool, seed, req.level)
        except Exception as exc:
            logger.warning("studio_work_lingo_check_failed attempt=%s error=%s", attempt + 1, exc)
            last_error = CHECK_ERROR
            continue

        # Re-run the pool rules over what survived, then keep whichever jointly
        # checked set is larger: a re-check that loses earlier pairs must not
        # leave the seller with less than the first round gave.
        survivors = filter_pairs(
            (pair.model_dump() for pair in confirmed), budgets=budgets, cap=cap
        )
        if len(survivors) >= len(kept):
            kept = survivors
        if len(kept) >= _min_pairs(cap):
            break
        last_error = FINAL_ERROR

    if not kept:
        raise WorkLingoGenerationError(last_error)

    verified = [pair.model_copy(update={"verified": True}) for pair in kept]
    remember(_scope(user_id, req.seed), (phrase_label(pair.phrase) for pair in verified))
    logger.info(
        "studio_work_lingo_generated model=%s check_model=%s latency_ms=%s "
        "written=%s checked=%s verified=%s level=%s",
        settings.STUDIO_GEMINI_MODEL,
        settings.STUDIO_FACT_CHECK_MODEL or settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        written,
        checked,
        len(verified),
        req.level,
    )
    return WorkLingoResponse(pairs=verified)


def build_prompt_for_tests(req: WorkLingoRequest, *, seed: int | None = None) -> str:
    return _build_prompt(req, seed=seed)


def parse_payload_for_tests(raw: str) -> list[Any]:
    return _parse_payload(raw)
