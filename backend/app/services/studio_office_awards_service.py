"""Generate Office Awards: Retirement Edition titles via Gemini.

A retirement-party page: a list of light workplace award categories --
"Keeper of the Spare Phone Charger", "Calmest Voice on a Busy Shift" -- and
for each one a coworker writes the name of the colleague who deserves it.

The service writes award titles only. Nobody is named, no coworker list is
sent or stored, and the retiree's name never leaves the browser.

Everything here is printed and sold on KDP, so a title only survives whole:

* **One short, clear award.** Two to nine words in title case, no sentence
  punctuation, no quotation marks, never addressing "you" and never gendered
  ("Office Queen"), with an idea left once award padding ("Most Likely to",
  "Best", "Award") is set aside.
* **Warm, never mean.** Nothing about appearance, weight, age, health, mental
  health, money, religion, politics, romance, family, poor performance,
  firing, mistakes or personal habits; no "worst", "laziest" or "most
  annoying"; no alcohol, quotations, brands, celebrities or borrowed award
  names.
* **No repeats in meaning.** A title is folded to its idea -- padding
  dropped, synonyms folded (coffee, tea, the kettle and "consumed" are one
  drink; the break room, staff room and tea room one room) -- and compared
  with the Bucket List's meaning-level test, the model's own ``concept`` name
  included. So "Most Coffee Consumed" and "Biggest Coffee Drinker" are one
  award. Checked within the reply, against what the client says the book
  already prints and against this worker's memory -- all bounded, never a
  comparison with every set ever made.

Variety is structural. Every title gets its own brief -- a theme, one of its
details, a tone (playful or warm) and a title shape (Most Likely to..., a
superlative, an honorary title, a named award, a habit) -- sampled by seed
from two dozen themes and about two hundred details. A set plans different
themes, about two in five of them warm, capped per group (one drinks award,
one timekeeping award, a meetings award or two), always opening its plan
with one farewell award about the retiree, plus spares for the gates on both
sides. The client picks, balances and orders the printed set.
"""

from __future__ import annotations

import asyncio
import logging
import math
import random
import re
import time
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, Iterable, List, Mapping, Sequence, Tuple

from app.core.config import settings
from app.schemas.studio_office_awards import (
    OfficeAwardsItem,
    OfficeAwardsModelOutput,
    OfficeAwardsRequest,
    OfficeAwardsResponse,
)
from app.services.prompt_data import (
    int_value,
    load_config,
    locale_line,
    section,
    string_list,
    word_pattern,
)
from app.services.studio_bucket_list_service import IdeaKey, keys_repeat, stem
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

GAME = "office-awards"
FINAL_ERROR = "Could not write fresh office awards this time. Please try again."
TONES: Tuple[str, ...] = ("playful", "warm")
# Remembered titles a new one is checked against. Bounded, so the check stays
# a few thousand set comparisons however long a seller keeps going.
MEMORY_FILTER_LIMIT = 200
# Titles named in a retry prompt as already written.
RETRY_AVOID_LIMIT = 80

# Mirrors AGE_STEREOTYPE_PATTERNS in
# frontend/src/utils/studio/retirement-word-search/content-quality.ts.
_STEREOTYPE_RE = re.compile(
    r"\bfrail\b|\bforgetful\b|\bsenile\b|\bold[\s-]?timer\b|\bdecline\b|"
    r"\bfeeble\b|\buseless\b",
    re.IGNORECASE,
)
_NUMBER_RE = re.compile(r"^\s*(\(?\d{1,2}\s*[.):]\s+|[-*•]\s+)")
# Letters (any script), digits, spaces, apostrophes, hyphens, commas and an
# ampersand: no quotation marks, no sentence punctuation, no slash, no emoji.
_ALLOWED_RE = re.compile(r"^[^\W_][\w ,'’\-&]*$")
_EDGE_TRIM_CHARS = "\"'“”‘’ "
_WORD_RE = re.compile(r"[^\W_]+")
# Short words a title keeps lower case unless they open or close it.
MINOR_WORDS = frozenset(
    "a an and as at but by for from in into nor of on onto or per the to via vs with".split()
)


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


def _limit(key: str) -> int:
    return int_value(_limits(), key)


def _words(key: str) -> frozenset[str]:
    return frozenset(word.lower() for word in string_list(_config(), key))


def _with_stems(words: Iterable[str]) -> frozenset[str]:
    words = frozenset(words)
    return words | frozenset(stem(word) for word in words)


@lru_cache(maxsize=1)
def _qualifiers() -> frozenset[str]:
    return _with_stems(_words("qualifierWords"))


@lru_cache(maxsize=1)
def _generic() -> frozenset[str]:
    return _with_stems(_words("genericWords"))


@lru_cache(maxsize=1)
def _synonyms() -> Mapping[str, str]:
    return {str(k).lower(): str(v).lower() for k, v in section(_config(), "synonyms").items()}


@lru_cache(maxsize=1)
def _phrases() -> Tuple[Tuple[re.Pattern[str], str], ...]:
    pairs = sorted(section(_config(), "phrases").items(), key=lambda kv: -len(kv[0]))
    return tuple(
        (re.compile(rf"\b{re.escape(str(phrase).lower())}\b"), str(repl).lower())
        for phrase, repl in pairs
    )


@lru_cache(maxsize=1)
def _blocked_re() -> re.Pattern[str]:
    brands = string_list(load_config("bucket-list"), "brandTerms")
    return word_pattern([*string_list(_config(), "blockedTerms"), *brands])


@lru_cache(maxsize=1)
def _examples() -> frozenset[str]:
    return frozenset(example.lower() for example in string_list(_config(), "exampleAwards"))


_rate_limiter = RateLimiter(
    label="Office Awards",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class OfficeAwardsRateLimitError(StudioRateLimitError):
    """User exceeded the short-window Office Awards quota."""


class OfficeAwardsGenerationError(StudioGenerationError):
    """Model output could not be turned into usable awards."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise OfficeAwardsRateLimitError(str(exc)) from exc


def _scope(req: OfficeAwardsRequest, user_id: str, seed: int) -> VarietyScope:
    """One memory per workplace: that is what decides which awards risk repeating."""
    return VarietyScope(game=GAME, user_id=user_id, bucket=bucket_key(req.workplace), seed=seed)


def _budget(req: OfficeAwardsRequest) -> int:
    return min(_limit("maxAwardChars"), req.max_award_chars)


# ---------------------------------------------------------------- themes


@dataclass(frozen=True)
class Theme:
    key: str
    label: str
    group: str
    weight: int
    facets: Mapping[str, Tuple[str, ...]]

    def has(self, tone: str) -> bool:
        return bool(self.facets.get(tone))

    @property
    def tones(self) -> Tuple[str, ...]:
        return tuple(tone for tone in TONES if self.has(tone))


@dataclass(frozen=True)
class Slot:
    """One award to write: its theme, tone, the detail to honour and the title shape."""

    theme: Theme
    tone: str
    facet: int
    shape: str

    @property
    def facet_text(self) -> str:
        facets = self.theme.facets[self.tone]
        return facets[self.facet % len(facets)]


@lru_cache(maxsize=1)
def themes() -> Tuple[Theme, ...]:
    out: List[Theme] = []
    for key, raw in section(_config(), "themes").items():
        out.append(
            Theme(
                key=str(key),
                label=str(raw["label"]),
                group=str(raw["group"]),
                weight=int(raw["weight"]),
                facets={tone: tuple(str(f) for f in raw.get(tone, [])) for tone in TONES},
            )
        )
    return tuple(out)


@lru_cache(maxsize=1)
def _theme_index() -> Mapping[str, Theme]:
    return {theme.key: theme for theme in themes()}


def anchor_theme() -> str:
    return str(_config()["anchorTheme"])


def shapes() -> Tuple[str, ...]:
    return tuple(section(_config(), "shapes").keys())


def shape_text(shape: str) -> str:
    return str(section(_config(), "shapes")[shape])


def group_cap(group: str, awards: int) -> int:
    """A group's share of a set: its full-set maximum, scaled to the set's size."""
    full = int_value(section(section(_config(), "groups"), group), "max")
    return max(1, math.ceil(full * awards / _limit("capBase")))


def warm_target(awards: int) -> int:
    return round(awards * _limit("warmPercent") / 100)


def _weighted(rng: random.Random, pool: Sequence[Theme]) -> Theme:
    return rng.choices(list(pool), weights=[theme.weight for theme in pool], k=1)[0]


def plan_themes(awards: int, seed: int) -> List[Tuple[Theme, str]]:
    """The set's themes and tones, then the spares'.

    About two in five awards are warm, the rest playful, shuffled by seed.
    The farewell theme opens the plan; every other award takes a theme the
    set has not used yet where one is open, drawn by weight, never past its
    group's share -- so a set cannot be three coffee jokes and four meeting
    ones. Spares come from themes the set does not use yet, tones alternating.
    """
    rng = random.Random(seed)
    pool = list(themes())
    tones = ["warm"] * warm_target(awards) + ["playful"] * (awards - warm_target(awards))
    rng.shuffle(tones)
    used: Counter[str] = Counter()
    groups: Counter[str] = Counter()
    plan: List[Tuple[Theme, str]] = []

    def take(theme: Theme, tone: str) -> None:
        plan.append((theme, tone))
        used[theme.key] += 1
        groups[theme.group] += 1

    anchor = _theme_index().get(anchor_theme())
    if anchor is not None and tones and anchor.has(tones[0]):
        take(anchor, tones.pop(0))
    for tone in tones:
        def open_(cap: int) -> List[Theme]:
            return [
                t for t in pool
                if t.has(tone) and used[t.key] < cap and groups[t.group] < group_cap(t.group, awards)
            ]

        candidates = open_(1) or open_(2)
        if candidates:
            take(_weighted(rng, candidates), tone)

    for i in range(_limit("spares")):
        tone = TONES[(i + seed) % 2]
        candidates = [t for t in pool if t.has(tone) and used[t.key] == 0] or [
            t for t in pool if t.has(tone) and used[t.key] < 2
        ]
        if candidates:
            take(_weighted(rng, candidates), tone)
    return plan


def _assign(order: Sequence[Tuple[Theme, str]], rng: random.Random, facet_start: int = 0) -> List[Slot]:
    """Give each planned award a detail (a different one per repeat) and a title shape.

    Details are shuffled per theme and tone; each award takes the shape the
    set has used least so far, ties broken by seed -- so a set spreads over
    the shapes rather than printing "Most Likely to..." twenty times.
    """
    facet_order: Dict[Tuple[str, str], List[int]] = {}
    used: Counter[str] = Counter()
    seen: Counter[Tuple[str, str]] = Counter()
    slots: List[Slot] = []
    for theme, tone in order:
        key = (theme.key, tone)
        if key not in facet_order:
            indices = list(range(len(theme.facets[tone])))
            rng.shuffle(indices)
            facet_order[key] = indices
        n = seen[key]
        seen[key] += 1
        indices = facet_order[key]
        facet = indices[(n + facet_start) % len(indices)]
        choices = list(shapes())
        rng.shuffle(choices)
        shape = min(choices, key=lambda s: used[s])
        used[shape] += 1
        slots.append(Slot(theme=theme, tone=tone, facet=facet, shape=shape))
    return slots


def plan_slots(req: OfficeAwardsRequest) -> List[Slot]:
    """The awards this call writes, in brief order.

    A top-up names its own themes (those the client's set does not use yet),
    how many awards it wants and, when the set is short of one, the tone;
    otherwise the full set plus spares.
    """
    rng = random.Random(req.seed * 5 + 3)
    if req.themes:
        index = _theme_index()
        named: List[Theme] = []
        for key in req.themes:
            theme = index.get(key)
            if theme is not None and theme not in named:
                named.append(theme)
        if not named:
            return []
        count = min(_limit("maxAsk"), req.count or len(named))
        order: List[Tuple[Theme, str]] = []
        for i in range(count):
            theme = named[i % len(named)]
            wanted = req.tone if req.tone and theme.has(req.tone) else None
            order.append((theme, wanted or theme.tones[(i + req.seed) % len(theme.tones)]))
        # A top-up follows a first call that used the leading details.
        return _assign(order, rng, facet_start=1 + req.seed % 3)
    awards = min(req.awards, _limit("maxAwards"))
    return _assign(plan_themes(awards, req.seed), rng)


# ---------------------------------------------------------------- text keys


def _fold(text: str) -> str:
    folded = text.lower().replace("’", "'")
    for pattern, replacement in _phrases():
        folded = pattern.sub(replacement, folded)
    return folded.replace("'s ", " ").replace("'", "")


def _canon(word: str) -> str:
    return stem(_synonyms().get(word) or _synonyms().get(stem(word)) or word)


def award_tokens(text: str) -> frozenset[str]:
    """The idea an award honours: padding and generic words gone, synonyms folded."""
    out: set[str] = set()
    for word in _WORD_RE.findall(_fold(text)):
        if word in _qualifiers() or word in _generic():
            continue
        canon = _canon(word)
        if canon in _qualifiers() or canon in _generic():
            continue
        out.add(canon)
    return frozenset(out)


@lru_cache(maxsize=1)
def _subject_sets() -> Mapping[str, frozenset[str]]:
    return {
        str(group): frozenset(_canon(str(word).lower()) for word in words)
        for group, words in section(_config(), "subjectWords").items()
    }


def award_subjects(text: str) -> frozenset[str]:
    """Groups an award is really about, whatever its brief said: coffee is a drinks award."""
    words = {_canon(word) for word in _WORD_RE.findall(_fold(text))}
    return frozenset(group for group, triggers in _subject_sets().items() if words & triggers)


def award_key(text: str, concept: str = "") -> IdeaKey:
    return IdeaKey(
        text=re.sub(r"\s+", " ", text).strip().lower(),
        tokens=award_tokens(text),
        concept=award_tokens(concept) if concept else frozenset(),
    )


def awards_repeat(first: str, second: str) -> bool:
    """True when a coworker would call two awards the same award."""
    return keys_repeat(award_key(first), award_key(second))


# ---------------------------------------------------------------- gates


def is_unsafe(text: str) -> bool:
    plain = text.replace("’", "'").replace("'", "")
    return bool(_STEREOTYPE_RE.search(plain) or _blocked_re().search(plain))


def _clean(raw: Any) -> str:
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    return text.strip(_EDGE_TRIM_CHARS)


def _case_part(part: str, edge: bool) -> str:
    letters = [ch for ch in part if ch.isalpha()]
    if len(letters) >= 2 and all(ch.isupper() for ch in letters):
        return part  # an initialism: IT, ASAP
    if not edge and part.lower() in MINOR_WORDS:
        return part.lower()
    return part[:1].upper() + part[1:]


def title_case(text: str) -> str:
    """Title case as a printed award reads: "Most Likely to Rescue the Photocopier".

    Short joining words stay lower case unless they open or close the title;
    each part of a hyphenated word is cased on its own ("Never-Without-a-Pen").
    Casing only: no word is added, dropped or changed.
    """
    words = text.split(" ")
    out: List[str] = []
    for i, word in enumerate(words):
        parts = word.split("-")
        out.append(
            "-".join(
                _case_part(part, (i == 0 and j == 0) or (i == len(words) - 1 and j == len(parts) - 1))
                for j, part in enumerate(parts)
            )
        )
    return " ".join(out)


def normalize_award(raw: Any, *, budget: int) -> str | None:
    """One award title as printed -- "Keeper of the Spare Phone Charger" -- or None.

    Two to nine words with no sentence punctuation, never shouting, never
    addressing "you", never gendered, kind, and with an idea left once award
    padding is set aside. Straight apostrophes become curly and the casing is
    set to title case; nothing else is ever changed.
    """
    text = _NUMBER_RE.sub("", _clean(raw)).strip(_EDGE_TRIM_CHARS)
    if not text or "_" in text or not _ALLOWED_RE.match(text) or not text[-1].isalnum():
        return None
    letters = [ch for ch in text if ch.isalpha()]
    if not letters or sum(ch.isupper() for ch in letters) > len(letters) * 0.6:
        return None
    if not _limit("minAwardWords") <= len(text.split(" ")) <= _limit("maxAwardWords"):
        return None
    text = title_case(text.replace("'", "’"))
    if not _limit("minAwardChars") <= len(text) <= budget:
        return None
    # Folded first, so "Thank-You Notes" is thanks, not the reader.
    words = set(_WORD_RE.findall(_fold(text)))
    if words & _words("readerWords") or words & _words("genderedWords"):
        return None
    if is_unsafe(text):
        return None
    # Only padding left: "Best Coworker Ever" honours nothing in particular.
    if not award_tokens(text):
        return None
    if text.lower() in _examples():
        return None
    return text


def normalize_concept(raw: Any) -> str:
    return _clean(raw).lower()[: _limit("maxConceptChars")].strip()


def normalize_item(raw: Any, *, slot: Slot, budget: int) -> OfficeAwardsItem | None:
    """One complete award -- or None. Never a repaired one."""
    if not isinstance(raw, dict):
        return None
    award = normalize_award(raw.get("award"), budget=budget)
    concept = normalize_concept(raw.get("concept"))
    # Straight from the model, an award carries the idea it honours; one it
    # could not name is usually too vague to hand to anybody.
    if award is None or not concept:
        return None
    return OfficeAwardsItem(
        award=award,
        theme=slot.theme.key,
        tone=slot.tone,
        shape=slot.shape,
        concept=concept,
    )


# ---------------------------------------------------------------- prompt


def briefs(asks: Sequence[Tuple[int, Slot]]) -> Tuple[List[str], Dict[int, int]]:
    """One numbered brief per award, and which slot each number fills."""
    lines: List[str] = []
    owners: Dict[int, int] = {}
    for number, (index, slot) in enumerate(asks, start=1):
        owners[number] = index
        lines.append(
            f"{number}. [{slot.theme.label}] {slot.facet_text} -- tone: {slot.tone} -- "
            f"shape: {shape_text(slot.shape)}"
        )
    return lines, owners


def _build_prompt(
    asks: Sequence[Tuple[int, Slot]],
    *,
    workplace: str,
    budget: int,
    locale: str,
) -> str:
    lines, _ = briefs(asks)
    want = len(lines)
    brief_block = "\n".join(lines)
    workplace_line = str(section(section(_config(), "workplaces"), workplace)["line"])
    tone_lines = "\n".join(f"- {text}" for text in section(_config(), "tones").values())
    min_words = _limit("minAwardWords")
    max_words = _limit("maxAwardWords")
    language = locale_line(section(_config(), "locale"), locale)
    examples = "\n".join(f'- "{example}"' for example in string_list(_config(), "exampleAwards"))

    return f"""Write award titles for "Office Awards", a page in a retirement activity
book used at a retirement party or passed round the team as a farewell gift.
For each award, a coworker writes the name of the colleague who best deserves
it. It should feel social, funny and warm, like a toast among people who like
working together -- never a roast, a review or a complaint.

{workplace_line}

You know nobody on the team, and you never need to. Every award must be one
any team could hand out: a habit, strength or everyday moment that makes
people say "that's obviously ..." and write a name straight away.

Write exactly {want} awards, one per brief, in this order. Each brief names a
theme, the detail to honour, a tone and the shape of the title:
{brief_block}

Tones:
{tone_lines}

How to build each award -- in this order:
1. "concept": the one habit, strength or moment the award honours, in 2 to 4
   plain words, specific enough that two different awards never share it
   ("spare pen supply", "printer rescue", "welcoming new starters"; never just
   "coffee", "teamwork" or "kindness").
2. "award": the award title itself.

Strong titles are short, specific and instantly recognisable (never copy these):
{examples}
Weak titles -- never write these kinds:
- Too vague to hand to anyone: "Best Coworker", "Most Valuable Team Member".
- The same idea twice in other words: "Most Coffee Consumed" beside "Biggest Coffee Drinker".
- Mean, sarcastic or shaming: "Worst Timekeeper", "Most Likely to Get Fired",
  "Biggest Complainer", "Least Productive", "Laziest Lunch Break".

Each award:
- Is a title in Title Case, {min_words} to {max_words} words and at most {budget} characters;
  three to six words is ideal. No full stop, question mark, exclamation mark,
  colon, quotation marks or emoji.
- Follows its brief's tone and shape; if the shape truly does not suit the
  detail, keep the detail and use the closest natural shape.
- Honours one clear idea the winner would be proud or amused to receive.
  Gentle, affectionate teasing is welcome; embarrassment, criticism and
  sarcasm are not.
- Never mentions appearance, clothes, weight, age, health, disability, mental
  health, money or pay, religion, politics, romance, family life, alcohol,
  poor performance, being fired, serious mistakes or personal habits such as
  sleeping, smells or bathroom breaks.
- Is gender neutral (no king, queen, lady, guy...), names nobody and never
  speaks to the reader as "you".
- For a brief about the retiree's farewell, refers to the retiree as "the
  Retiree" ("Most Likely to Inherit the Retiree's Stapler"); the winner is
  still a coworker.
- Original wording: not a known quote, song lyric, film line, catchphrase or
  slogan, not a famous award's name, and not a category copied from a party
  game, printable or book. No brand names or celebrities.
{language}

Return JSON only:
{{ "items": [ {{ "brief": 1, "concept": "printer rescue", "award": "Most Likely to Rescue the Photocopier" }} ] }}
"""


def _parse_payload(raw: str) -> List[Any]:
    data = parse_json_object(raw)
    items = data.get("items", data.get("awards"))
    if not isinstance(items, list) or not items:
        raise ValueError("invalid JSON: missing items")
    return items


def _brief_number(raw: Any) -> int | None:
    try:
        return int(str(raw).strip().rstrip("."))
    except (TypeError, ValueError):
        return None


async def _call_gemini(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        temperature=0.95,
        max_output_tokens=_limit("maxOutputTokens"),
        response_schema=OfficeAwardsModelOutput,
        label="office_awards",
    )


# ---------------------------------------------------------------- generate


def _retry_slot(slot: Slot, attempt: int) -> Slot:
    """The same theme, tone and shape on another detail, so a retry is not the same brief again."""
    return Slot(theme=slot.theme, tone=slot.tone, facet=slot.facet + attempt, shape=slot.shape)


def _slot_map(slots: Sequence[Slot], asks: Sequence[Tuple[int, Slot]]) -> List[Slot]:
    """The slots as this attempt asked for them, retried details included."""
    out = list(slots)
    for index, slot in asks:
        out[index] = slot
    return out


def _accept(
    items_raw: Iterable[Any],
    owners: Mapping[int, int],
    *,
    slots: Sequence[Slot],
    kept: Dict[int, OfficeAwardsItem],
    accepted: List[IdeaKey],
    printed: Sequence[IdeaKey],
    budget: int,
) -> None:
    """File each valid, fresh award under the slot its brief belongs to."""
    for raw in items_raw:
        if not isinstance(raw, dict):
            continue
        index = owners.get(_brief_number(raw.get("brief")) or 0)
        if index is None or index in kept:
            continue
        item = normalize_item(raw, slot=slots[index], budget=budget)
        if item is None:
            continue
        key = award_key(item.award, item.concept)
        if any(keys_repeat(key, other) for other in accepted):
            continue
        if any(keys_repeat(key, other) for other in printed):
            continue
        kept[index] = item
        accepted.append(key)


async def generate_office_awards(req: OfficeAwardsRequest, user_id: str) -> OfficeAwardsResponse:
    _check_rate_limit(user_id)

    slots = plan_slots(req)
    if not slots:
        raise OfficeAwardsGenerationError(FINAL_ERROR)
    budget = _budget(req)
    started = time.perf_counter()
    home = _scope(req, user_id, req.seed)
    # What this seller printed before: the client's list (spans workers and
    # restarts) plus this worker's own memory. An award that repeats either is
    # dropped here, not just discouraged in the prompt.
    printed = [award_key(label) for label in [*req.avoid, *recent(home, MEMORY_FILTER_LIMIT)]]
    kept: Dict[int, OfficeAwardsItem] = {}
    accepted: List[IdeaKey] = []
    calls = 0

    for attempt in range(_limit("maxAttempts")):
        missing = [i for i in range(len(slots)) if i not in kept]
        if not missing:
            break
        asks = [(i, _retry_slot(slots[i], attempt)) for i in missing]
        written = [kept[i].award for i in sorted(kept)]
        seed = req.seed + attempt * 97
        prompt = _build_prompt(asks, workplace=req.workplace, budget=budget, locale=req.locale)
        prompt = with_variety(
            prompt,
            home.at_seed(seed),
            client_avoid=[*written, *req.avoid],
            limit=RETRY_AVOID_LIMIT if written else None,
        )
        calls += 1
        try:
            reply = await _call_gemini(prompt)
            items_raw = _parse_payload(reply)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 -- one bad call must not sink the set
            logger.warning("studio_office_awards_call_failed attempt=%s error=%s", attempt + 1, exc)
            continue
        _accept(
            items_raw,
            briefs(asks)[1],
            slots=_slot_map(slots, asks),
            kept=kept,
            accepted=accepted,
            printed=printed,
            budget=budget,
        )

    if not accepted:
        raise OfficeAwardsGenerationError(FINAL_ERROR)

    awards = [kept[i] for i in sorted(kept)]
    remember(home, (item.award for item in awards))
    logger.info(
        "studio_office_awards_generated model=%s latency_ms=%s awards=%s wanted=%s calls=%s workplace=%s top_up=%s",
        settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        len(awards),
        len(slots),
        calls,
        req.workplace,
        bool(req.themes),
    )
    return OfficeAwardsResponse(awards=awards)


def build_prompt_for_tests(asks: Sequence[Tuple[int, Slot]], *, workplace: str = "any") -> str:
    return _build_prompt(asks, workplace=workplace, budget=48, locale="en")


def parse_payload_for_tests(raw: str) -> List[Any]:
    return _parse_payload(raw)
