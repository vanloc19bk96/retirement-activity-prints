"""Generate Career By the Numbers questions via Gemini.

A retirement-book page: a list of light career estimates -- "About how many
cups of tea or coffee powered your career?", "On a typical shift, how many
times were you asked where something was kept?" -- and for each one the
retiree writes a best guess on a line with the unit printed beside it.

The service writes questions and units only. It never writes an answer or a
number, never states anything about the retiree as fact, and nothing about
the retiree -- name, employer, dates -- is ever sent.

Everything here is printed and sold on KDP, so a question only survives whole:

* **One clear estimate.** One sentence, one question mark, "how many"
  exactly once, no digits (so no invented statistic can slip in), speaking to
  "you", naming its time frame (your career, a typical week, your busiest
  day) so nobody wonders whether to write a daily figure or a lifetime total.
* **A unit that belongs to it.** One or two words taken from the question
  itself ("cups", "phone calls", "times"), never "things" or "total", never
  money, weight or percent, and distances only in the unit the seller chose.
* **Light, never sore.** Nothing about pay, money, health, stress, age,
  memory, alcohol, religion, politics, romance, mistakes, complaints,
  arguments, being fired or quitting; nothing private; no quotations,
  brands or celebrities.
* **No repeats in meaning.** A question is folded to what it counts -- the
  time frame and estimate padding dropped, synonyms folded (coffee, tea,
  cups and mugs are one drink; meetings, huddles and briefings one meeting)
  -- and compared with the Bucket List's meaning-level test, the model's own
  ``concept`` name included. So "How many meetings did you attend?" and
  "Roughly how many meetings were you in over the years?" are one question.
  Checked within the reply, against what the client says the book already
  prints and against this worker's memory -- all bounded, never a comparison
  with every set ever made.

Variety is structural. Every question gets its own brief -- a theme, one of
its details, a tone (playful or nostalgic) and a question shape (a career
total, a typical day or week, a best guess, a tally, a busiest day) --
sampled by seed from 28 themes and about 190 details. A set plans different
themes, about two in five nostalgic, capped per group (one drinks question,
one meetings question, one commute question), always opening its plan with
one question about the road to retirement, plus spares for the gates on both
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
from app.schemas.studio_career_numbers import (
    CareerNumbersItem,
    CareerNumbersModelOutput,
    CareerNumbersRequest,
    CareerNumbersResponse,
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

GAME = "career-by-the-numbers"
FINAL_ERROR = "Could not write fresh career questions this time. Please try again."
TONES: Tuple[str, ...] = ("playful", "nostalgic")
DISTANCES: Tuple[str, ...] = ("miles", "km")
# Remembered questions a new one is checked against. Bounded, so the check
# stays a few thousand set comparisons however long a seller keeps going.
MEMORY_FILTER_LIMIT = 200
# Questions named in a retry prompt as already written.
RETRY_AVOID_LIMIT = 80
# The shared memory keeps labels this long; longer questions are cut on a word.
MEMORY_LABEL_CHARS = 60

# Mirrors AGE_STEREOTYPE_PATTERNS in
# frontend/src/utils/studio/retirement-word-search/content-quality.ts.
_STEREOTYPE_RE = re.compile(
    r"\bfrail\b|\bforgetful\b|\bsenile\b|\bold[\s-]?timer\b|\bdecline\b|"
    r"\bfeeble\b|\buseless\b",
    re.IGNORECASE,
)
_NUMBER_RE = re.compile(r"^\s*(\(?\d{1,2}\s*[.):]\s+|[-*•]\s+)")
# Letters (any script), spaces, apostrophes, hyphens and commas, then one
# closing question mark: no digits, quotation marks, colons or emoji.
_QUESTION_RE = re.compile(r"^[^\W\d_](?:[^\W\d_]|[ ,'’\-])*[^\W\d_]\?$")
_UNIT_RE = re.compile(r"^[^\W\d_]+(?:[-’][^\W\d_]+)*(?: [^\W\d_]+(?:[-’][^\W\d_]+)*)?$")
_HOW_MANY_RE = re.compile(r"\bhow many\b", re.IGNORECASE)
_HOW_MUCH_RE = re.compile(r"\bhow much\b", re.IGNORECASE)
# "Did you ever count how many...?" reads as a yes-or-no question.
_YES_NO_RE = re.compile(
    r"^(?:did|do|does|have|has|had|was|were|is|are|can|could|would|will|should)\b", re.IGNORECASE
)
_EDGE_TRIM_CHARS = "\"'“”‘’ "
_WORD_RE = re.compile(r"[^\W_]+")


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
def _scope_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "scopeTerms"))


@lru_cache(maxsize=1)
def _examples() -> frozenset[str]:
    return frozenset(example.lower() for example in string_list(_config(), "exampleQuestions"))


def _distance_words(distance: str) -> frozenset[str]:
    return _words("kilometresWords" if distance == "km" else "milesWords")


def _other_distance_words(distance: str) -> frozenset[str]:
    return _distance_words("miles" if distance == "km" else "km")


def distance_unit(distance: str) -> str:
    return str(section(section(_config(), "distances"), distance)["unit"])


_rate_limiter = RateLimiter(
    label="Career By the Numbers",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class CareerNumbersRateLimitError(StudioRateLimitError):
    """User exceeded the short-window Career By the Numbers quota."""


class CareerNumbersGenerationError(StudioGenerationError):
    """Model output could not be turned into usable questions."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise CareerNumbersRateLimitError(str(exc)) from exc


def _scope(req: CareerNumbersRequest, user_id: str, seed: int) -> VarietyScope:
    """One memory per workplace: that is what decides which questions risk repeating."""
    return VarietyScope(game=GAME, user_id=user_id, bucket=bucket_key(req.workplace), seed=seed)


def _question_budget(req: CareerNumbersRequest) -> int:
    return min(_limit("maxQuestionChars"), req.max_question_chars)


def _unit_budget(req: CareerNumbersRequest) -> int:
    return min(_limit("maxUnitChars"), req.max_unit_chars)


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
    """One question to write: its theme, tone, the thing to count and the question shape."""

    theme: Theme
    tone: str
    facet: int
    shape: str

    def facet_text(self, distance: str = "miles") -> str:
        facets = self.theme.facets[self.tone]
        return facets[self.facet % len(facets)].replace("{distance}", distance_unit(distance))


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


def group_cap(group: str, size: int) -> int:
    """A group's share of a set: its full-set maximum, scaled to the set's size."""
    full = int_value(section(section(_config(), "groups"), group), "max")
    return max(1, math.ceil(full * size / _limit("capBase")))


def nostalgic_target(size: int) -> int:
    return round(size * _limit("nostalgicPercent") / 100)


def _weighted(rng: random.Random, pool: Sequence[Theme]) -> Theme:
    return rng.choices(list(pool), weights=[theme.weight for theme in pool], k=1)[0]


def plan_themes(size: int, seed: int) -> List[Tuple[Theme, str]]:
    """The set's themes and tones, then the spares'.

    About two in five questions are nostalgic, the rest playful, shuffled by
    seed. The road-to-retirement theme opens the plan; every other question
    takes a theme the set has not used yet where one is open, drawn by
    weight, never past its group's share -- so a set cannot be three coffee
    questions and four meeting ones. Spares come from themes the set does not
    use yet, tones alternating.
    """
    rng = random.Random(seed)
    pool = list(themes())
    tones = ["nostalgic"] * nostalgic_target(size) + ["playful"] * (size - nostalgic_target(size))
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
                if t.has(tone) and used[t.key] < cap and groups[t.group] < group_cap(t.group, size)
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
    """Give each planned question a detail (a different one per repeat) and a shape.

    Details are shuffled per theme and tone; each question takes the shape
    the set has used least so far, ties broken by seed -- so a set spreads
    over career totals, typical days, guesses, tallies and busiest days
    rather than asking "About how many" twenty times.
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


def plan_slots(req: CareerNumbersRequest) -> List[Slot]:
    """The questions this call writes, in brief order.

    A top-up names its own themes (those the client's set does not use yet),
    how many questions it wants and, when the set is short of one, the tone;
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
    size = min(req.questions, _limit("maxItems"))
    return _assign(plan_themes(size, req.seed), rng)


# ---------------------------------------------------------------- text keys


def _plain(text: str) -> str:
    return text.lower().replace("’", "'").replace("'", "")


def _fold(text: str) -> str:
    folded = text.lower().replace("’", "'")
    for pattern, replacement in _phrases():
        folded = pattern.sub(replacement, folded)
    return folded.replace("'s ", " ").replace("'", "")


def _canon(word: str) -> str:
    return stem(_synonyms().get(word) or _synonyms().get(stem(word)) or word)


def question_tokens(text: str) -> frozenset[str]:
    """What a question counts: time frame, estimate padding and generic verbs gone, synonyms folded."""
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


def question_subjects(text: str) -> frozenset[str]:
    """Groups a question is really about, whatever its brief said: coffee is a drinks question."""
    words = {_canon(word) for word in _WORD_RE.findall(_fold(text))}
    return frozenset(group for group, triggers in _subject_sets().items() if words & triggers)


def question_key(text: str, concept: str = "") -> IdeaKey:
    return IdeaKey(
        text=re.sub(r"\s+", " ", text).strip().lower(),
        tokens=question_tokens(text),
        concept=question_tokens(concept) if concept else frozenset(),
    )


def questions_repeat(first: str, second: str) -> bool:
    """True when a retiree would call two questions the same count asked twice."""
    return keys_repeat(question_key(first), question_key(second))


# ---------------------------------------------------------------- gates


def is_unsafe(text: str) -> bool:
    plain = text.replace("’", "'").replace("'", "")
    return bool(_STEREOTYPE_RE.search(plain) or _blocked_re().search(plain))


def _clean(raw: Any) -> str:
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    return text.strip(_EDGE_TRIM_CHARS)


def _mentions(words: frozenset[str], vocabulary: frozenset[str]) -> bool:
    return bool(words & vocabulary)


def normalize_question(raw: Any, *, budget: int, distance: str = "miles") -> str | None:
    """One estimate question as printed -- or None.

    One sentence ending in its only question mark, "how many" exactly once,
    no digits, speaking to "you" and naming its time frame, gender neutral,
    kind, and with something left to count once the padding is set aside.
    Straight apostrophes become curly and a lower-case first letter is
    capitalised; nothing else is ever changed.
    """
    text = _NUMBER_RE.sub("", _clean(raw)).strip(_EDGE_TRIM_CHARS).replace("'", "’")
    if not text or not _QUESTION_RE.match(text):
        return None
    text = text[:1].upper() + text[1:]
    letters = [ch for ch in text if ch.isalpha()]
    if sum(ch.isupper() for ch in letters) > len(letters) * 0.3:
        return None
    if not _limit("minQuestionWords") <= len(text.split(" ")) <= _limit("maxQuestionWords"):
        return None
    if not _limit("minQuestionChars") <= len(text) <= budget:
        return None
    if len(_HOW_MANY_RE.findall(text)) != 1 or _HOW_MUCH_RE.search(text) or _YES_NO_RE.match(text):
        return None
    words = frozenset(_WORD_RE.findall(_plain(text)))
    if not _mentions(words, _words("readerWords")):
        return None
    if _mentions(words, _words("firstPersonWords")) or _mentions(words, _words("genderedWords")):
        return None
    if _mentions(words, _other_distance_words(distance)):
        return None
    if not _scope_re().search(_plain(text)):
        return None
    if is_unsafe(text):
        return None
    if not question_tokens(text):
        return None
    if text.lower() in _examples():
        return None
    return text


def _stems(text: str) -> frozenset[str]:
    """The words as written, endings folded: "call" is in "phone calls", "mugs" is not in "cups"."""
    return frozenset(stem(word) for word in _WORD_RE.findall(_plain(text)))


def normalize_unit(raw: Any, *, question: str, budget: int, distance: str = "miles") -> str | None:
    """The unit printed beside the writing line -- "cups", "phone calls" -- or None.

    One or two lower-case words, every one of them in the question, so the
    unit can only name what the question counts. Never a vague "things" or
    "total", never money, weight or percent, and a distance only in the unit
    the seller chose.
    """
    text = _clean(raw).rstrip(".").strip().lower().replace("'", "’")
    if not text or not _UNIT_RE.match(text):
        return None
    if len(text.split(" ")) > _limit("maxUnitWords") or not 2 <= len(text) <= budget:
        return None
    words = frozenset(_WORD_RE.findall(_plain(text)))
    if _mentions(words, _words("blockedUnits")) or _mentions(words, _other_distance_words(distance)):
        return None
    if is_unsafe(text):
        return None
    if not _stems(text) <= _stems(question):
        return None
    return text


def normalize_concept(raw: Any) -> str:
    return _clean(raw).lower()[: _limit("maxConceptChars")].strip()


def normalize_item(
    raw: Any,
    *,
    slot: Slot,
    budget: int,
    unit_budget: int,
    distance: str = "miles",
) -> CareerNumbersItem | None:
    """One complete question with its unit -- or None. Never a repaired one."""
    if not isinstance(raw, dict):
        return None
    question = normalize_question(raw.get("question"), budget=budget, distance=distance)
    if question is None:
        return None
    unit = normalize_unit(raw.get("unit"), question=question, budget=unit_budget, distance=distance)
    concept = normalize_concept(raw.get("concept"))
    # Straight from the model, a question carries the thing it counts; one it
    # could not name is usually too vague to guess at.
    if unit is None or not concept:
        return None
    return CareerNumbersItem(
        question=question,
        unit=unit,
        theme=slot.theme.key,
        tone=slot.tone,
        shape=slot.shape,
        concept=concept,
    )


# ---------------------------------------------------------------- prompt


def briefs(asks: Sequence[Tuple[int, Slot]], distance: str = "miles") -> Tuple[List[str], Dict[int, int]]:
    """One numbered brief per question, and which slot each number fills."""
    lines: List[str] = []
    owners: Dict[int, int] = {}
    for number, (index, slot) in enumerate(asks, start=1):
        owners[number] = index
        lines.append(
            f"{number}. [{slot.theme.label}] count: {slot.facet_text(distance)} -- tone: {slot.tone} -- "
            f"shape: {shape_text(slot.shape)}"
        )
    return lines, owners


def _build_prompt(
    asks: Sequence[Tuple[int, Slot]],
    *,
    workplace: str,
    distance: str,
    budget: int,
    unit_budget: int,
    locale: str,
) -> str:
    lines, _ = briefs(asks, distance)
    want = len(lines)
    brief_block = "\n".join(lines)
    workplace_line = str(section(section(_config(), "workplaces"), workplace)["line"])
    distance_line = str(section(section(_config(), "distances"), distance)["line"])
    unit_word = distance_unit(distance)
    tone_lines = "\n".join(f"- {text}" for text in section(_config(), "tones").values())
    min_words = _limit("minQuestionWords")
    max_words = _limit("maxQuestionWords")
    language = locale_line(section(_config(), "locale"), locale)
    examples = "\n".join(f'- "{example}"' for example in string_list(_config(), "exampleQuestions"))

    return f"""Write questions for "Career By the Numbers", a page in a retirement activity
book or retirement gift book. The retiree reads each question, makes a fun
best guess about their own working life and writes the number on a line with
the unit printed beside it ("About ________ cups"). It should feel like
looking back on a career in numbers -- playful, nostalgic and warm -- never
like accounting homework, a timesheet or a performance review.

{workplace_line}
{distance_line}

You know nothing about the retiree and never need to. You write questions
only: never an answer, never a number, never a claim about what the retiree
did. Estimates are the whole point, so every question must be easy to guess
at without records, a calculator or anything private.

Write exactly {want} questions, one per brief, in this order. Each brief names
a theme, the thing to count, a tone and the shape of the question:
{brief_block}

Tones:
{tone_lines}

How to build each question -- in this order:
1. "concept": the one thing being counted, in 2 to 4 plain words, specific
   enough that two different questions never share it ("cups of coffee",
   "meetings attended", "pens lost"; never just "work" or "time").
2. "question": the question itself.
3. "unit": what the number counts, in 1 or 2 lower-case words copied word for
   word from the question ("cups", "meetings", "phone calls", "times",
   "hours", "{unit_word}").

Strong questions are clear, specific and fun to guess at (never copy these):
{examples}
Weak questions -- never write these kinds:
- Too vague to count: "How much work did you do?", "How busy were you?"
- The same count twice in other words: "How many meetings did you attend?"
  beside "Roughly how many meetings were you in over the years?"
- Two numbers at once: "How many emails did you send and read each day?"
- A number stated as fact: "You went to thousands of meetings, didn't you?"
- Needing records or sums: "What was your exact total of hours worked?"

Each question:
- Is one sentence ending in a single question mark, {min_words} to {max_words} words and
  at most {budget} characters; 8 to 14 words is ideal. No digits, quotation
  marks, colons, exclamation marks or emoji.
- Contains the words "how many" exactly once and asks for one number only.
- Speaks to the retiree as "you" and names its time frame -- your whole
  career, over the years, a typical workday, shift or week, or your busiest
  day -- so nobody wonders whether to write a daily figure or a lifetime total.
- Follows its brief's tone and shape; if the shape truly does not suit the
  detail, keep the detail and use the closest natural shape.
- Is light and kind. Gentle humour about coffee, meetings, Mondays, alarm
  clocks and lost pens is welcome; never mention money, pay, pensions,
  health, illness, injuries, accidents, stress, age, memory, weight, alcohol,
  smoking, religion, politics, romance, family life, bathroom breaks,
  mistakes, complaints, arguments, being fired or quitting.
- Asks nothing private: no employer names, addresses, ID numbers or salary.
- Is gender neutral, names nobody and never says "I", "me" or "my".
- Original wording: not a quotation, song lyric, film line or slogan, and not
  copied from a party game, printable or book. No brand names or celebrities.

Each unit:
- Is 1 or 2 lower-case words, at most {unit_budget} characters, every one of them
  in the question.
- Names what the number counts -- never "things", "items", "amount" or
  "total", and never money, weight or percent.
- Uses {unit_word} for any distance.
{language}

Return JSON only:
{{ "items": [ {{ "brief": 1, "concept": "cups of coffee", "question": "About how many cups of coffee kept you going over your whole career?", "unit": "cups" }} ] }}
"""


def _parse_payload(raw: str) -> List[Any]:
    data = parse_json_object(raw)
    items = data.get("items", data.get("questions"))
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
        response_schema=CareerNumbersModelOutput,
        label="career_numbers",
    )


# ---------------------------------------------------------------- generate


def memory_label(question: str) -> str:
    """A question as remembered: from "How many" on, cut on a word to fit the memory.

    The shared memory cuts labels at a fixed length. The opening ("On a
    typical workday,", "If you had to guess,") is only the time frame, so it
    goes first and the length is spent on what the question counts; cut
    mid-word a long question would no longer match itself next time.
    Mirrors `cbnMemoryLabel`.
    """
    found = _HOW_MANY_RE.search(question)
    text = question[found.start():] if found else question
    text = text[:1].upper() + text[1:]
    if len(text) <= MEMORY_LABEL_CHARS:
        return text
    cut = text[:MEMORY_LABEL_CHARS]
    return cut[: max(cut.rfind(" "), 1)].strip()


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
    kept: Dict[int, CareerNumbersItem],
    accepted: List[IdeaKey],
    printed: Sequence[IdeaKey],
    budget: int,
    unit_budget: int,
    distance: str,
) -> None:
    """File each valid, fresh question under the slot its brief belongs to."""
    for raw in items_raw:
        if not isinstance(raw, dict):
            continue
        index = owners.get(_brief_number(raw.get("brief")) or 0)
        if index is None or index in kept:
            continue
        item = normalize_item(raw, slot=slots[index], budget=budget, unit_budget=unit_budget, distance=distance)
        if item is None:
            continue
        key = question_key(item.question, item.concept)
        if any(keys_repeat(key, other) for other in accepted):
            continue
        if any(keys_repeat(key, other) for other in printed):
            continue
        kept[index] = item
        accepted.append(key)


async def generate_career_numbers(req: CareerNumbersRequest, user_id: str) -> CareerNumbersResponse:
    _check_rate_limit(user_id)

    slots = plan_slots(req)
    if not slots:
        raise CareerNumbersGenerationError(FINAL_ERROR)
    budget = _question_budget(req)
    unit_budget = _unit_budget(req)
    started = time.perf_counter()
    home = _scope(req, user_id, req.seed)
    # What this seller printed before: the client's list (spans workers and
    # restarts) plus this worker's own memory. A question that repeats either
    # is dropped here, not just discouraged in the prompt.
    printed = [question_key(label) for label in [*req.avoid, *recent(home, MEMORY_FILTER_LIMIT)]]
    kept: Dict[int, CareerNumbersItem] = {}
    accepted: List[IdeaKey] = []
    calls = 0

    for attempt in range(_limit("maxAttempts")):
        missing = [i for i in range(len(slots)) if i not in kept]
        if not missing:
            break
        asks = [(i, _retry_slot(slots[i], attempt)) for i in missing]
        written = [memory_label(kept[i].question) for i in sorted(kept)]
        seed = req.seed + attempt * 97
        prompt = _build_prompt(
            asks,
            workplace=req.workplace,
            distance=req.distance,
            budget=budget,
            unit_budget=unit_budget,
            locale=req.locale,
        )
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
            logger.warning("studio_career_numbers_call_failed attempt=%s error=%s", attempt + 1, exc)
            continue
        _accept(
            items_raw,
            briefs(asks, req.distance)[1],
            slots=_slot_map(slots, asks),
            kept=kept,
            accepted=accepted,
            printed=printed,
            budget=budget,
            unit_budget=unit_budget,
            distance=req.distance,
        )

    if not accepted:
        raise CareerNumbersGenerationError(FINAL_ERROR)

    questions = [kept[i] for i in sorted(kept)]
    remember(home, (memory_label(item.question) for item in questions))
    logger.info(
        "studio_career_numbers_generated model=%s latency_ms=%s questions=%s wanted=%s calls=%s workplace=%s distance=%s top_up=%s",
        settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        len(questions),
        len(slots),
        calls,
        req.workplace,
        req.distance,
        bool(req.themes),
    )
    return CareerNumbersResponse(questions=questions)


def build_prompt_for_tests(
    asks: Sequence[Tuple[int, Slot]], *, workplace: str = "any", distance: str = "miles"
) -> str:
    return _build_prompt(
        asks, workplace=workplace, distance=distance, budget=110, unit_budget=16, locale="en"
    )


def parse_payload_for_tests(raw: str) -> List[Any]:
    return _parse_payload(raw)
