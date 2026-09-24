"""Generate Would You Rather: Retirement Edition questions via Gemini.

A question is two choices printed after a fixed "Would you rather..." lead:
"spend a month exploring a new country by train" OR "spend a month turning the
garden into the best on the street". Both have to belong to one scenario and
weigh about the same, or the reader has nothing to decide.

Everything here is printed and sold on KDP, so a pair only survives whole:

* **Two usable choices.** Each reads as the end of "Would you rather ...": it
  opens on a verb, is one clause, carries no second question and no third
  option ("... or the lake"). Numbering, quotes and a repeated lead are
  stripped; anything that still needs repairing is dropped, not rewritten.
* **A real dilemma.** The two sides differ in substance -- not the same words
  twice, not "go" versus "not go" -- and neither dwarfs the other in length.
  Before writing, the model names the setup both sides share and the two
  opposite ends it put them at ("X vs Y"); a pair it cannot sum up that way is
  two unrelated activities and is dropped.
* **No repeats.** Pairs are compared on their content words, qualifiers and
  plurals folded and sides in either order, against each other, against what
  the client says the book already prints, and against this worker's memory.
* **Nothing sensitive.** Health, ageing bodies, money trouble, loneliness,
  death, politics, religion, alcohol, gambling, brands and celebrities are
  dropped.

Variety is structural. Each requested question gets its own brief -- a topic
and a dilemma shape sampled by seed -- so a reply cannot be eight paraphrases of
"beach or mountains", and two sellers on the same settings get different books.
"""

from __future__ import annotations

import logging
import random
import re
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Iterable, Mapping

from app.core.config import settings
from app.schemas.studio_would_you_rather import (
    WouldYouRatherItem,
    WouldYouRatherModelOutput,
    WouldYouRatherRequest,
    WouldYouRatherResponse,
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

GAME = "would-you-rather"
FINAL_ERROR = (
    "Could not write clear Would You Rather questions for this theme. "
    "Try again, or pick a broader theme."
)
# Separates the two sides in an avoid label. Options may not contain it.
PAIR_SEPARATOR = " / "
# Remembered pairs a new one is checked against. Bounded, so the check stays a
# few thousand token comparisons however long a seller keeps generating.
MEMORY_FILTER_LIMIT = 200

_MEDICAL_RE = re.compile(
    r"\bprevent\s+dementia\b|\breverse\s+aging\b|\bcure\s+memory\s+loss\b|"
    r"\banti[\s-]?aging\b|\bmemory\s+loss\b",
    re.IGNORECASE,
)
_FINANCE_RE = re.compile(
    r"\bguaranteed\s+(return|income|profit)|\binvest\s+now\b|\bget[\s-]?rich\b|"
    r"\bcrypto|\bbitcoin\b|\bday[\s-]?trad|\bpenny\s+stock",
    re.IGNORECASE,
)
# Mirrors AGE_STEREOTYPE_PATTERNS in
# frontend/src/utils/studio/retirement-word-search/content-quality.ts.
_STEREOTYPE_RE = re.compile(
    r"\bfrail\b|\bforgetful\b|\bsenile\b|\bold[\s-]?timer\b|\bdecline\b|"
    r"\bfeeble\b|\buseless\b",
    re.IGNORECASE,
)
_LEAD_RE = re.compile(r"^\s*(would\s+you\s+(rather|prefer)\b[\s,.:…-]*)", re.IGNORECASE)
_LABEL_RE = re.compile(
    r"^\s*(\(?(option\s*)?([ab12])\s*[.):-]\s+|option\s+[ab12]\s*[:-]?\s+|[-*•]\s+)",
    re.IGNORECASE,
)
_LEADING_OR_RE = re.compile(r"^\s*(or|either)\b[\s,]*", re.IGNORECASE)
# A third choice hiding inside one side ("... by the sea or the lake").
_INNER_OR_RE = re.compile(r"\b(or|either)\b", re.IGNORECASE)
_ALLOWED_RE = re.compile(r"^[A-Za-z0-9 ,'’\-&()]+$")
# "quiet afternoon vs lively afternoon": the two ends a dilemma is weighed on.
_VERSUS_RE = re.compile(r"\s+(?:vs\.?|versus)\s+", re.IGNORECASE)
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
    return frozenset(word.lower() for word in string_list(_config(), "qualifierWords"))


@lru_cache(maxsize=1)
def _negations() -> frozenset[str]:
    return frozenset(word.lower() for word in string_list(_config(), "negationWords"))


@lru_cache(maxsize=1)
def _non_verb_openers() -> frozenset[str]:
    return frozenset(word.lower() for word in string_list(_config(), "nonVerbOpeners"))


@lru_cache(maxsize=1)
def _ing_exceptions() -> frozenset[str]:
    return frozenset(word.lower() for word in string_list(_config(), "ingVerbExceptions"))


_rate_limiter = RateLimiter(
    label="Would You Rather",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class WouldYouRatherRateLimitError(StudioRateLimitError):
    """User exceeded the short-window Would You Rather quota."""


class WouldYouRatherGenerationError(StudioGenerationError):
    """Model output could not be turned into usable questions."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise WouldYouRatherRateLimitError(str(exc)) from exc


def _scope(req: WouldYouRatherRequest, user_id: str, seed: int) -> VarietyScope:
    """One memory per theme (or one for mixed): that is what risks repeating."""
    bucket = bucket_key("mixed" if req.mixed_topics else req.theme)
    return VarietyScope(game=GAME, user_id=user_id, bucket=bucket, seed=seed)


def _option_budget(req: WouldYouRatherRequest) -> int:
    return min(int_value(_limits(), "maxOptionChars"), req.max_option_chars)


# ---------------------------------------------------------------- text keys


def is_unsafe(text: str) -> bool:
    return bool(
        _MEDICAL_RE.search(text)
        or _FINANCE_RE.search(text)
        or _STEREOTYPE_RE.search(text)
        or _blocked_re().search(text)
        or _brand_re().search(text)
    )


def _stem(token: str) -> str:
    """Fold plurals so ISLAND and ISLANDS compare equal. Deliberately crude."""
    if len(token) > 4 and token.endswith("ies"):
        return token[:-3] + "y"
    if len(token) > 4 and token.endswith(("ches", "shes", "sses", "xes", "zes")):
        return token[:-2]
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def _raw_tokens(text: str) -> list[str]:
    folded = text.lower().replace("’", "'").replace("'s ", " ").replace("'", "")
    return _TOKEN_RE.findall(folded)


def content_tokens(text: str) -> frozenset[str]:
    """The words that carry an option's meaning, qualifiers and plurals folded."""
    return frozenset(_stem(word) for word in _raw_tokens(text) if word not in _qualifiers())


def _jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    union = a | b
    return len(a & b) / len(union) if union else 1.0


def options_match(first: str, second: str) -> bool:
    """True when a reader would call the two choices the same choice.

    Half their meaning shared, or one wholly inside the other once it has at
    least three words of substance ("sail the islands" / "sail between quiet
    islands in the summer").
    """
    a, b = content_tokens(first), content_tokens(second)
    if not a or not b:
        return first.strip().lower() == second.strip().lower()
    if _jaccard(a, b) >= 0.6:
        return True
    return min(len(a), len(b)) >= 3 and (a <= b or b <= a)


def _strong_match(first: str, second: str) -> bool:
    """The same choice reused, near word for word."""
    a, b = content_tokens(first), content_tokens(second)
    if not a or not b:
        return first.strip().lower() == second.strip().lower()
    return _jaccard(a, b) >= 0.75


@dataclass(frozen=True)
class _PairKey:
    a: str
    b: str

    @property
    def union(self) -> frozenset[str]:
        return content_tokens(self.a) | content_tokens(self.b)


def pairs_repeat(first: _PairKey, second: _PairKey) -> bool:
    """True when two questions would read as the same question twice.

    Either order counts -- "A or B" and "B or A" are one question -- and so does
    one side reused word for word: a book that offers "travel the world by
    train" on three pages is repeating itself even if the other side changes.
    """
    if (options_match(first.a, second.a) and options_match(first.b, second.b)) or (
        options_match(first.a, second.b) and options_match(first.b, second.a)
    ):
        return True
    if any(_strong_match(x, y) for x in (first.a, first.b) for y in (second.a, second.b)):
        return True
    return _jaccard(first.union, second.union) >= 0.55


def _avoid_key(label: str) -> _PairKey | None:
    text = str(label or "").strip()
    if not text:
        return None
    if PAIR_SEPARATOR.strip() in text:
        a, _, b = text.partition(PAIR_SEPARATOR.strip())
        return _PairKey(a.strip(), b.strip())
    # A bare label (older client, merged server memory) still blocks its words.
    return _PairKey(text, text)


AVOID_LABEL_CHARS = 60


def _fit_words(words: list[str], limit: int) -> str:
    out = ""
    for word in words:
        candidate = f"{out} {word}".strip()
        if len(candidate) > limit:
            break
        out = candidate
    return out


def avoid_label(item: WouldYouRatherItem) -> str:
    """Compact "a / b" label for avoid lists, inside the 60-char label cap.

    Content words only. When both sides do not fit, the words the second side
    shares with the first go (its opening verb stays), because the words that
    tell the two sides apart are the ones a later comparison needs:
    "spend spring weekend cottage sea / spend farmhouse hills".
    """
    first = [w for w in _raw_tokens(item.option_a) if w not in _qualifiers()]
    second = [w for w in _raw_tokens(item.option_b) if w not in _qualifiers()]
    room = AVOID_LABEL_CHARS - len(PAIR_SEPARATOR)
    if len(" ".join(first)) + len(" ".join(second)) > room:
        shared = set(first)
        second = second[:1] + [w for w in second[1:] if w not in shared]
    a_text = " ".join(first)
    b_text = " ".join(second)
    if len(a_text) + len(b_text) > room:
        half = room // 2
        b_text = _fit_words(second, max(half, room - len(a_text)))
        a_text = _fit_words(first, room - len(b_text))
    return f"{a_text or item.option_a[:20]}{PAIR_SEPARATOR}{b_text or item.option_b[:20]}"


# ---------------------------------------------------------------- gates


def _clean(raw: Any) -> str:
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    return text.strip(_EDGE_TRIM_CHARS)


def _opens_on_verb(text: str) -> bool:
    """Reads as the end of "Would you rather ..." -- a bare verb first."""
    first = (_raw_tokens(text) or [""])[0]
    if not first or first in _non_verb_openers():
        return False
    if first.endswith("ing") and first not in _ing_exceptions():
        return False
    return True


def normalize_option(raw: Any, *, budget: int) -> str | None:
    """One choice, sentence case, no lead, label or end mark -- or None."""
    text = _clean(raw)
    for pattern in (_LEAD_RE, _LABEL_RE, _LEADING_OR_RE):
        text = pattern.sub("", text).strip()
    text = re.sub(r"^to\s+", "", text, flags=re.IGNORECASE)
    text = text.rstrip(" .,;:!?…").strip(_EDGE_TRIM_CHARS)
    if not text:
        return None
    # Letters, digits and light punctuation only: no second sentence, no
    # question mark, no slash offering a third choice, no emoji.
    if not _ALLOWED_RE.match(text):
        return None
    if _INNER_OR_RE.search(text):
        return None
    letters = [ch for ch in text if ch.isalpha()]
    if not letters or sum(ch.isupper() for ch in letters) > len(letters) * 0.5:
        return None
    words = text.split()
    if not int_value(_limits(), "minOptionWords") <= len(words) <= int_value(
        _limits(), "maxOptionWords"
    ):
        return None
    if not int_value(_limits(), "minOptionChars") <= len(text) <= budget:
        return None
    if not _opens_on_verb(text) or is_unsafe(text):
        return None
    return text[0].upper() + text[1:]


def _negation_twin(first: str, second: str) -> bool:
    """"Retire to the coast" / "not retire to the coast" is not a dilemma."""

    def core(text: str) -> frozenset[str]:
        skip = _qualifiers() | _negations()
        return frozenset(_stem(w) for w in _raw_tokens(text) if w not in skip)

    return core(first) == core(second)


def pair_problem(option_a: str, option_b: str) -> str | None:
    """Why two valid options are not one fair dilemma, or None."""
    if option_a.lower() == option_b.lower():
        return "same option twice"
    a, b = content_tokens(option_a), content_tokens(option_b)
    if a == b or _jaccard(a, b) >= 0.8:
        return "options too alike"
    if _negation_twin(option_a, option_b):
        return "option and its negation"
    short, long_ = sorted((len(option_a), len(option_b)))
    if long_ * 100 > short * int_value(_limits(), "maxLengthRatioPercent"):
        return "options unbalanced"
    return None


def dilemma_problem(setup: Any, dilemma: Any) -> str | None:
    """Why the model's own summary shows two unrelated choices, or None.

    Both choices must live in one shared setup and sit at opposite ends of one
    "X vs Y" axis. "Label the photos" and "sort the letters" share a topic but
    no axis; "shape a bowl" and "spot constellations" share nothing.
    """
    if not _clean(setup):
        return "no shared setup"
    poles = _VERSUS_RE.split(_clean(dilemma))
    if len(poles) != 2 or not all(pole.strip() for pole in poles):
        return "no two-sided trade-off"
    if content_tokens(poles[0]) == content_tokens(poles[1]):
        return "both sides of the trade-off are the same"
    return None


def normalize_pair(raw: Any, *, budget: int) -> WouldYouRatherItem | None:
    """One complete, fair dilemma -- or None. Never a repaired one."""
    if not isinstance(raw, dict):
        return None
    option_a = normalize_option(raw.get("optionA", raw.get("option_a")), budget=budget)
    option_b = normalize_option(raw.get("optionB", raw.get("option_b")), budget=budget)
    if option_a is None or option_b is None:
        return None
    # Straight from the model, a pair carries its setup and trade-off; one it
    # cannot sum up that way is two unrelated sentences. Pairs already kept
    # come back without them and are not re-judged.
    if ("setup" in raw or "dilemma" in raw) and dilemma_problem(
        raw.get("setup"), raw.get("dilemma")
    ):
        return None
    if pair_problem(option_a, option_b):
        return None
    topic = _clean(raw.get("topic"))[:60]
    return WouldYouRatherItem(option_a=option_a, option_b=option_b, topic=topic)


def filter_pairs(
    raw_items: Iterable[Any],
    *,
    budget: int,
    cap: int,
    avoid: Iterable[str] = (),
) -> list[WouldYouRatherItem]:
    """Keep the pairs a page can print without repeating the book."""
    avoided = [key for key in (_avoid_key(label) for label in avoid) if key is not None]
    kept: list[WouldYouRatherItem] = []
    keys: list[_PairKey] = []

    for raw in raw_items:
        item = normalize_pair(raw, budget=budget)
        if item is None:
            continue
        key = _PairKey(item.option_a, item.option_b)
        if any(pairs_repeat(key, other) for other in keys + avoided):
            continue
        kept.append(item)
        keys.append(key)
        if len(kept) >= cap:
            break
    return kept


# ---------------------------------------------------------------- prompt


def _parse_payload(raw: str) -> list[Any]:
    data = parse_json_object(raw)
    items = data.get("items", data.get("questions"))
    if not isinstance(items, list) or not items:
        raise ValueError("invalid JSON: missing items")
    return items


def _briefs(req: WouldYouRatherRequest, want: int, seed: int) -> list[str]:
    """One distinct brief per question: topic (when mixed), shape and tone.

    Topics and shapes are shuffled by seed independently, so the same topic
    meets a different shape on the next page and a long book walks through
    hundreds of combinations before it could meet one twice.
    """
    rng = random.Random(seed)
    topics = list(string_list(_config(), "topics"))
    shapes = list(string_list(_config(), "shapes"))
    rng.shuffle(topics)
    rng.shuffle(shapes)
    cycle = string_list(section(_config(), "styles"), req.style)
    offset = rng.randrange(len(cycle))
    tones = section(_config(), "tones")

    lines: list[str] = []
    for index in range(want):
        tone = cycle[(index + offset) % len(cycle)]
        parts = []
        if req.mixed_topics:
            parts.append(f"topic: {topics[index % len(topics)]}")
        parts.append(f"shape: {shapes[index % len(shapes)]}")
        parts.append(f"tone: {tones[tone]}")
        lines.append(f"{index + 1}. " + "; ".join(parts))
    return lines


def _build_prompt(req: WouldYouRatherRequest, *, seed: int | None = None) -> str:
    want = min(int_value(_limits(), "poolSize"), req.count)
    prompt_seed = req.seed if seed is None else seed
    language = locale_line(section(_config(), "locale"), req.locale)
    budget = _option_budget(req)
    max_words = int_value(_limits(), "maxOptionWords")
    theme = str(_config()["mixedTheme"]) if req.mixed_topics else req.theme.strip()
    briefs = "\n".join(_briefs(req, want, prompt_seed))
    theme_rule = (
        "Each question follows its own brief's topic, so the page ranges across retirement life."
        if req.mixed_topics
        else f"Every question is about {theme}, each from a different corner of it."
    )

    return f"""Create "Would you rather...?" questions for a large-print retirement
activity book, read by retirees, couples, families and guests at retirement
parties. Each question is two choices printed after "Would you rather".

Theme: {theme}
{theme_rule}

Write exactly {want} questions, one per brief, in this order:
{briefs}

How to build each question -- in this order:
1. "setup": the ONE concrete situation both choices share, drawn from the
   brief's topic (or the theme) -- the same free afternoon, the same trip, the
   same party, the same chore, the same wish.
2. "dilemma": the two OPPOSITE ends the reader weighs, written "X vs Y" (e.g.
   "peace and quiet vs a lively crowd"). Take the axis from the brief's shape;
   if it sits awkwardly on the setup, use the nearest opposite that fits.
3. optionA sits at one end, optionB at the other, both inside the setup. Picking
   one must mean giving up what the other offers -- that is the whole game.

Related AND opposite, never just two nice things:
- Bad (same topic, no opposite -- both are tidying old keepsakes):
  "label every family photo in a velvet album" / "sort a lifetime of letters by year"
- Good (preserving the past vs making new memories):
  "put every old family photo into albums" / "fill a new album with this year's adventures"
- Bad (nothing in common): "shape a bowl on a pottery wheel" / "spot five new
  constellations through a telescope"
- Good (one clear evening, quiet vs lively): "spend a clear night stargazing in
  the backyard" / "spend a clear night dancing at an outdoor concert"
- Check every pair: if either choice could be moved to another question without
  anyone noticing, or the reader cannot say what they give up, rewrite it.

Each choice:
- Completes "Would you rather ...": starts with a plain verb ("spend", "learn",
  "host", "have") and is one clause. Where it reads naturally, repeat the shared
  part of the setup in both and change only the part that differs.
- Both genuinely appealing (or both equally, harmlessly awkward) -- neither
  obviously better.
- 3 to {max_words} words and at most {budget} characters. Keep the two about the
  same length.
- Specific and vivid, not vague ("spend a week on a quiet lake with a canoe", not
  "go somewhere nice"). No specialist knowledge needed.
- Vary the wording across questions: do not start every choice with "spend",
  and do not reuse a sentence pattern from another question.
- No "or", "either" or slashes inside a choice. No question marks, numbering,
  labels or quotation marks.

Never:
- Health, illness, ageing bodies, memory, loneliness, money worries, death,
  disability, politics, religion, alcohol or gambling.
- Jokes about being old, slow or forgetful. Retirees are capable and busy.
- Brand names, celebrities, characters, TV shows, films, songs or quotations.
- Anything childish, crude or unkind.
{language}

Return JSON only:
{{ "items": [ {{ "brief": 1, "topic": "short getaways and day trips",
  "setup": "a spring weekend away",
  "dilemma": "the coast vs the countryside",
  "optionA": "spend a spring weekend in a cottage by the sea",
  "optionB": "spend a spring weekend at a farmhouse in the hills" }} ] }}
"""


async def _call_gemini(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        temperature=0.95,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=WouldYouRatherModelOutput,
        label="would_you_rather",
    )


def _min_pairs(cap: int) -> int:
    """Below this the page may not fill, so the attempt is worth repeating.

    The client over-asks to leave spares for its own layout and project gates;
    half is enough for the common page, and every extra round trip is a paid
    call against a per-minute quota.
    """
    return max(1, (cap + 1) // 2)


async def generate_would_you_rather(
    req: WouldYouRatherRequest, user_id: str
) -> WouldYouRatherResponse:
    _check_rate_limit(user_id)

    budget = _option_budget(req)
    cap = min(int_value(_limits(), "poolSize"), req.count)
    attempts = int_value(_limits(), "maxAttempts")
    last_error = FINAL_ERROR
    started = time.perf_counter()
    kept: list[WouldYouRatherItem] = []
    # What this seller printed before: the client's list (spans workers and
    # restarts) plus this worker's own memory. A pair that repeats either is
    # dropped here, not just discouraged in the prompt.
    printed = [*req.avoid, *recent(_scope(req, user_id, req.seed), MEMORY_FILTER_LIMIT)]

    for attempt in range(attempts):
        seed = req.seed + attempt * 97
        scope = _scope(req, user_id, seed)
        # Pairs already kept go into the avoid list, so a retry writes new ones.
        avoid = [*req.avoid, *(avoid_label(item) for item in kept)]
        prompt = with_variety(_build_prompt(req, seed=seed), scope, client_avoid=avoid)
        try:
            raw = await _call_gemini(prompt)
            items_raw = _parse_payload(raw)
        except Exception as exc:
            logger.warning(
                "studio_would_you_rather_attempt_failed attempt=%s error=%s", attempt + 1, exc
            )
            last_error = "The AI did not return valid Would You Rather questions. Please try again."
            continue

        kept = filter_pairs(
            [*({"optionA": i.option_a, "optionB": i.option_b, "topic": i.topic} for i in kept),
             *items_raw],
            budget=budget,
            cap=cap,
            avoid=printed,
        )
        if len(kept) >= _min_pairs(cap):
            break
        last_error = (
            "Could not get enough clear Would You Rather questions. "
            "Try again, or pick a broader theme."
        )

    if not kept:
        raise WouldYouRatherGenerationError(last_error)

    remember(_scope(req, user_id, req.seed), (avoid_label(item) for item in kept))
    logger.info(
        "studio_would_you_rather_generated model=%s latency_ms=%s pairs=%s mixed=%s style=%s",
        settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        len(kept),
        req.mixed_topics,
        req.style,
    )
    return WouldYouRatherResponse(items=kept)


def build_prompt_for_tests(req: WouldYouRatherRequest, *, seed: int | None = None) -> str:
    return _build_prompt(req, seed=seed)


def parse_payload_for_tests(raw: str) -> list[Any]:
    return _parse_payload(raw)
