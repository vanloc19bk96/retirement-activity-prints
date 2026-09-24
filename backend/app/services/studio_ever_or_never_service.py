"""Generate Ever or Never: Retirement Edition statements via Gemini.

A statement is one short retirement-life experience printed as a question the
reader answers by ticking **Ever** or **Never**: "Ever taken a nap before lunch
on a Tuesday?". It has to name one thing that either happened or did not, or
there is nothing to tick.

Everything here is printed and sold on KDP, so a statement only survives whole:

* **One answerable experience.** It reads "Ever <past participle> ...?": one
  clause, one question mark, no "or" offering a second experience, no negation
  ("Ever not ...", "never") that turns the answer boxes inside out. Numbering,
  quotes and a "Have you ever" lead are stripped; anything that still needs
  repairing is dropped, not rewritten.
* **Short.** At most the characters the page reserved, so it sets in the lines
  its row holds.
* **No repeats.** Statements are compared on their content words, qualifiers
  and plurals folded, against each other, against what the client says the
  book already prints, and against this worker's memory.
* **Nothing sensitive.** Health, ageing bodies, memory, money trouble,
  loneliness, death, politics, religion, alcohol, gambling, brands and
  celebrities are dropped.

Variety is structural. Each requested statement gets its own brief -- a topic
and an angle sampled by seed -- so a reply cannot be twelve paraphrases of
"taken a nap", and two sellers on the same settings get different books.
"""

from __future__ import annotations

import logging
import random
import re
import time
from functools import lru_cache
from typing import Any, Iterable, Mapping

from app.core.config import settings
from app.schemas.studio_ever_or_never import (
    EverOrNeverItem,
    EverOrNeverModelOutput,
    EverOrNeverRequest,
    EverOrNeverResponse,
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

GAME = "ever-or-never"
FINAL_ERROR = (
    "Could not write clear Ever or Never statements for this theme. "
    "Try again, or pick a broader theme."
)
# Remembered statements a new one is checked against. Bounded, so the check
# stays a few thousand token comparisons however long a seller keeps going.
MEMORY_FILTER_LIMIT = 200
AVOID_LABEL_CHARS = 60

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
_NUMBER_RE = re.compile(r"^\s*(\(?\d{1,2}\s*[.):-]\s+|[-*•]\s+)")
_GAME_LABEL_RE = re.compile(r"^\s*ever\s+or\s+never\s*[:,.!?-]*\s*", re.IGNORECASE)
_HAVE_YOU_RE = re.compile(r"^\s*(have|has)\s+(you|anyone|anybody)\s+(ever\s+)?", re.IGNORECASE)
_EVER_RE = re.compile(r"^\s*ever\b[\s,]*", re.IGNORECASE)
# A second experience hiding inside one statement ("... by the sea or the lake").
_INNER_OR_RE = re.compile(r"\b(or|either|nor)\b", re.IGNORECASE)
_ALLOWED_RE = re.compile(r"^[A-Za-z0-9 ,'’\-&()]+$")
_REGULAR_PARTICIPLE_RE = re.compile(r"^[a-z]{2,}ed$")
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
def _participles() -> frozenset[str]:
    return frozenset(word.lower() for word in string_list(_config(), "participleWords"))


_rate_limiter = RateLimiter(
    label="Ever or Never",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class EverOrNeverRateLimitError(StudioRateLimitError):
    """User exceeded the short-window Ever or Never quota."""


class EverOrNeverGenerationError(StudioGenerationError):
    """Model output could not be turned into usable statements."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise EverOrNeverRateLimitError(str(exc)) from exc


def _scope(req: EverOrNeverRequest, user_id: str, seed: int) -> VarietyScope:
    """One memory per theme (or one for mixed): that is what risks repeating."""
    bucket = bucket_key("mixed" if req.mixed_topics else req.theme)
    return VarietyScope(game=GAME, user_id=user_id, bucket=bucket, seed=seed)


def _statement_budget(req: EverOrNeverRequest) -> int:
    return min(int_value(_limits(), "maxStatementChars"), req.max_statement_chars)


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
    """Fold plurals so NAP and NAPS compare equal. Deliberately crude."""
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
    """The words that carry a statement's meaning, qualifiers and plurals folded."""
    return frozenset(_stem(word) for word in _raw_tokens(text) if word not in _qualifiers())


def _jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    union = a | b
    return len(a & b) / len(union) if union else 1.0


def statements_repeat(first: str, second: str) -> bool:
    """True when a reader would call the two statements the same experience.

    Most of their meaning shared ("taken a nap before lunch" / "taken a nap
    after lunch"), or one wholly inside the other once it has at least three
    words of substance.
    """
    a, b = content_tokens(first), content_tokens(second)
    if not a or not b:
        return first.strip().lower() == second.strip().lower()
    if _jaccard(a, b) >= 0.6:
        return True
    return min(len(a), len(b)) >= 3 and (a <= b or b <= a)


def avoid_label(item: EverOrNeverItem) -> str:
    """Compact label for avoid lists: content words only, inside the label cap."""
    words = [w for w in _raw_tokens(item.statement) if w not in _qualifiers()]
    out = ""
    for word in words:
        candidate = f"{out} {word}".strip()
        if len(candidate) > AVOID_LABEL_CHARS:
            break
        out = candidate
    return out or item.statement[:AVOID_LABEL_CHARS]


# ---------------------------------------------------------------- gates


def _clean(raw: Any) -> str:
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    return text.strip(_EDGE_TRIM_CHARS)


def is_participle(word: str) -> bool:
    """Reads as the verb after "Ever" -- "taken", "napped", "sung"."""
    word = word.lower()
    if word in _participles():
        return True
    return bool(_REGULAR_PARTICIPLE_RE.match(word))


def normalize_statement(raw: Any, *, budget: int) -> str | None:
    """One statement as printed -- "Ever taken ...?" -- or None."""
    text = _clean(raw)
    for pattern in (_NUMBER_RE, _GAME_LABEL_RE):
        text = pattern.sub("", text).strip()
    text = text.strip(_EDGE_TRIM_CHARS)
    text = text.rstrip(" .,;:!?…").strip(_EDGE_TRIM_CHARS)
    text = _HAVE_YOU_RE.sub("", text)
    body = _EVER_RE.sub("", text).strip()
    if not body:
        return None
    # Letters, digits and light punctuation only: no second sentence, no inner
    # question mark, no slash offering another experience, no emoji.
    if not _ALLOWED_RE.match(body) or _INNER_OR_RE.search(body):
        return None
    letters = [ch for ch in body if ch.isalpha()]
    if not letters or sum(ch.isupper() for ch in letters) > len(letters) * 0.5:
        return None
    tokens = _raw_tokens(body)
    if not tokens or not is_participle(tokens[0]):
        return None
    # "Ever not ..." and "never" turn the answer boxes inside out.
    if any(token in _negations() for token in tokens):
        return None
    words = body.split()
    if not int_value(_limits(), "minBodyWords") <= len(words) <= int_value(
        _limits(), "maxBodyWords"
    ):
        return None
    statement = f"Ever {body[0].lower()}{body[1:]}?"
    if not int_value(_limits(), "minStatementChars") <= len(statement) <= budget:
        return None
    if is_unsafe(statement):
        return None
    return statement


def normalize_item(raw: Any, *, budget: int) -> EverOrNeverItem | None:
    """One complete statement -- or None. Never a repaired one."""
    if not isinstance(raw, dict):
        return None
    statement = normalize_statement(raw.get("statement"), budget=budget)
    if statement is None:
        return None
    # Straight from the model, a statement carries the moment it names; one it
    # could not name is a vague habit. Items already kept come back without it.
    if "moment" in raw and not _clean(raw.get("moment")):
        return None
    topic = _clean(raw.get("topic"))[:60]
    return EverOrNeverItem(statement=statement, topic=topic)


def filter_statements(
    raw_items: Iterable[Any],
    *,
    budget: int,
    cap: int,
    avoid: Iterable[str] = (),
) -> list[EverOrNeverItem]:
    """Keep the statements a page can print without repeating the book."""
    avoided = [label for label in (str(a or "").strip() for a in avoid) if label]
    kept: list[EverOrNeverItem] = []

    for raw in raw_items:
        item = normalize_item(raw, budget=budget)
        if item is None:
            continue
        if any(statements_repeat(item.statement, other.statement) for other in kept):
            continue
        if any(statements_repeat(item.statement, label) for label in avoided):
            continue
        kept.append(item)
        if len(kept) >= cap:
            break
    return kept


# ---------------------------------------------------------------- prompt


def _parse_payload(raw: str) -> list[Any]:
    data = parse_json_object(raw)
    items = data.get("items", data.get("statements"))
    if not isinstance(items, list) or not items:
        raise ValueError("invalid JSON: missing items")
    return items


def _briefs(req: EverOrNeverRequest, want: int, seed: int) -> list[str]:
    """One distinct brief per statement: topic (when mixed), angle and tone.

    Topics and angles are shuffled by seed independently, so the same topic
    meets a different angle on the next page.
    """
    rng = random.Random(seed)
    topics = list(string_list(_config(), "topics"))
    angles = list(string_list(_config(), "angles"))
    rng.shuffle(topics)
    rng.shuffle(angles)
    cycle = string_list(section(_config(), "styles"), req.style)
    offset = rng.randrange(len(cycle))
    tones = section(_config(), "tones")

    lines: list[str] = []
    for index in range(want):
        tone = cycle[(index + offset) % len(cycle)]
        parts = []
        if req.mixed_topics:
            parts.append(f"topic: {topics[index % len(topics)]}")
        parts.append(f"angle: {angles[index % len(angles)]}")
        parts.append(f"tone: {tones[tone]}")
        lines.append(f"{index + 1}. " + "; ".join(parts))
    return lines


def _build_prompt(req: EverOrNeverRequest, *, seed: int | None = None) -> str:
    want = min(int_value(_limits(), "poolSize"), req.count)
    prompt_seed = req.seed if seed is None else seed
    language = locale_line(section(_config(), "locale"), req.locale)
    budget = _statement_budget(req)
    max_words = int_value(_limits(), "maxBodyWords") + 1
    theme = str(_config()["mixedTheme"]) if req.mixed_topics else req.theme.strip()
    briefs = "\n".join(_briefs(req, want, prompt_seed))
    theme_rule = (
        "Each statement follows its own brief's topic, so the page ranges across retirement life."
        if req.mixed_topics
        else f"Every statement is about {theme}, each from a different corner of it."
    )

    return f"""Create "Ever or Never" statements for a large-print retirement activity
book, read by retirees, couples, families and guests at retirement parties.
Each statement is printed as a short question, and the reader ticks EVER if it
has happened to them or NEVER if it has not.

Theme: {theme}
{theme_rule}

Write exactly {want} statements, one per brief, in this order:
{briefs}

How to build each statement -- in this order:
1. "moment": the ONE concrete, specific thing that either happened or did not
   (e.g. "a nap before lunch on a weekday").
2. "statement": that moment as "Ever <past participle> ...?", e.g.
   "Ever taken a nap before lunch on a Tuesday?"

Good statements (specific, retirement-flavoured, instantly answerable):
- "Ever taken a nap before lunch on a Tuesday?"
- "Ever stayed in your pyjamas until noon on a Monday?"
- "Ever set an alarm just to switch it off and go back to sleep?"
- "Ever booked a trip on a Wednesday just because you could?"
- "Ever lost track of what day of the week it is?"
- "Ever grown a tomato bigger than your fist?"
Bad statements -- never write these kinds:
- Vague or generic: "Ever enjoyed retirement?", "Ever relaxed?", "Ever been happy?"
- A general lifestyle question with retirement bolted on: "Ever used a computer in retirement?"
- Two experiences at once: "Ever baked bread and sold it at a fair?"
- Negative or double negative: "Ever not woken up early?"

Each statement:
- Starts with "Ever" followed straight away by a past participle ("taken",
  "stayed", "booked", "grown", "sung", "tried"). Ends with one question mark.
- One single experience -- something a reader either has done or has never
  done. Specific details (a day, a place, a time, an amount) make it fun.
- Genuinely about retirement life: free time, weekday freedom, hobbies, family,
  friends, travel, routines, trying new things, small everyday freedoms.
- 4 to {max_words} words and at most {budget} characters in total. Short is better.
- Everyday words anyone understands at a glance. No specialist knowledge.
- Vary the verbs and sentence patterns: do not start two statements with the
  same verb, and do not reuse a pattern from another statement.
- No "or", "either", "not", "never", slashes, numbering, labels or quotation
  marks. No second sentence.

Never:
- Health, illness, ageing bodies, memory lapses, loneliness, money worries,
  death, disability, politics, religion, alcohol, gambling or anything illegal.
- Jokes about being old, slow or forgetful. Retirees are capable and busy.
- Brand names, celebrities, characters, TV shows, films, songs or quotations.
- Anything embarrassing, crude, childish or unkind -- every statement should
  be something people happily answer out loud in a group.
{language}

Return JSON only:
{{ "items": [ {{ "brief": 1, "topic": "naps at unexpected times and places",
  "moment": "a nap before lunch on a weekday",
  "statement": "Ever taken a nap before lunch on a Tuesday?" }} ] }}
"""


async def _call_gemini(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        temperature=0.95,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=EverOrNeverModelOutput,
        label="ever_or_never",
    )


def _min_statements(cap: int) -> int:
    """Below this the page may not fill, so the attempt is worth repeating.

    The client over-asks to leave spares for its own layout and book gates;
    two thirds is enough for the common page, and every extra round trip is a
    paid call against a per-minute quota.
    """
    return max(1, (cap * 2 + 2) // 3)


async def generate_ever_or_never(req: EverOrNeverRequest, user_id: str) -> EverOrNeverResponse:
    _check_rate_limit(user_id)

    budget = _statement_budget(req)
    cap = min(int_value(_limits(), "poolSize"), req.count)
    attempts = int_value(_limits(), "maxAttempts")
    last_error = FINAL_ERROR
    started = time.perf_counter()
    kept: list[EverOrNeverItem] = []
    # What this seller printed before: the client's list (spans workers and
    # restarts) plus this worker's own memory. A statement that repeats either
    # is dropped here, not just discouraged in the prompt.
    printed = [*req.avoid, *recent(_scope(req, user_id, req.seed), MEMORY_FILTER_LIMIT)]

    for attempt in range(attempts):
        seed = req.seed + attempt * 97
        scope = _scope(req, user_id, seed)
        # Statements already kept go into the avoid list, so a retry writes new ones.
        avoid = [*req.avoid, *(avoid_label(item) for item in kept)]
        prompt = with_variety(_build_prompt(req, seed=seed), scope, client_avoid=avoid)
        try:
            raw = await _call_gemini(prompt)
            items_raw = _parse_payload(raw)
        except Exception as exc:
            logger.warning(
                "studio_ever_or_never_attempt_failed attempt=%s error=%s", attempt + 1, exc
            )
            last_error = "The AI did not return valid Ever or Never statements. Please try again."
            continue

        kept = filter_statements(
            [*({"statement": i.statement, "topic": i.topic} for i in kept), *items_raw],
            budget=budget,
            cap=cap,
            avoid=printed,
        )
        if len(kept) >= _min_statements(cap):
            break
        last_error = (
            "Could not get enough clear Ever or Never statements. "
            "Try again, or pick a broader theme."
        )

    if not kept:
        raise EverOrNeverGenerationError(last_error)

    remember(_scope(req, user_id, req.seed), (avoid_label(item) for item in kept))
    logger.info(
        "studio_ever_or_never_generated model=%s latency_ms=%s statements=%s mixed=%s style=%s",
        settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        len(kept),
        req.mixed_topics,
        req.style,
    )
    return EverOrNeverResponse(items=kept)


def build_prompt_for_tests(req: EverOrNeverRequest, *, seed: int | None = None) -> str:
    return _build_prompt(req, seed=seed)


def parse_payload_for_tests(raw: str) -> list[Any]:
    return _parse_payload(raw)
