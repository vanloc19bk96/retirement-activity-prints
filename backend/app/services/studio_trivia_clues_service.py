"""Generate trivia clue + answer pairs for a word-search page via Gemini.

Everything here is printed and sold on KDP, so the gates below drop three kinds
of copy rather than set them: copy that puts a title at risk (brands, health
claims, finance advice), copy that talks down to the reader the book is for,
and pairs the puzzle itself cannot be honest about.

That last class is what makes this service different from the crossword's. A
trivia clue is only fair if the grid can answer it exactly once, so an answer
is rejected when it is a palindrome (it reads both ways, so the key circles one
of two right answers), when it is contained in another answer (circling
GARDENING circles GARDEN, and the page then has two clues with one mark), or
when the clue repeats the answer it is asking for. A pair that survives all of
that is one the page can number, place and print a matching solution for.

One rule is particular to this game: answers are single words. A two-word
answer would print a letter count the grid does not agree with -- "Road Trip"
is eight cells, not four and four -- and a reader who counts before they search
is exactly the reader this book is for.
"""

from __future__ import annotations

import logging
import re
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_trivia_clues import (
    TriviaClueItem,
    TriviaCluesModelOutput,
    TriviaCluesRequest,
    TriviaCluesResponse,
)
from app.services.prompt_data import (
    int_value,
    load_config,
    locale_line,
    rotate,
    section,
    string_list,
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
    remember,
    with_variety,
)

logger = logging.getLogger(__name__)

GAME = "trivia-clue-word-search"
FINAL_ERROR = (
    "Could not write clear trivia clues for this theme. "
    "Try again, or pick a broader theme."
)

_ANSWER_RE = re.compile(r"^[A-Za-z]+$")
_LENGTH_HINT_RE = re.compile(r"\s*\(\s*\d+\s*(letters?)?\s*\)\s*$", re.IGNORECASE)
_CLUE_TRIM_CHARS = "\"'“” "
_MEDICAL_RE = re.compile(
    r"\bprevent\s+dementia\b|\breverse\s+aging\b|\bcure\s+memory\s+loss\b|"
    r"\btreat\s+alzheimer|\bcure\s+alzheimer|\banti[\s-]?aging\s+cure\b|"
    r"\bmemory\s+loss\b",
    re.IGNORECASE,
)
_BRAND_RE = re.compile(
    r"\bnintendo\b|\bdisney\b|\bmarvel\b|\bstarbucks\b|\bmcdonald|"
    r"\bcoca[\s-]?cola\b|\bharry\s+potter\b|\btaylor\s+swift\b|\bstar\s+wars\b",
    re.IGNORECASE,
)
_FINANCE_RE = re.compile(
    r"\bguaranteed\s+(return|income|profit)|\binvest\s+now\b|\bget[\s-]?rich\b|"
    r"\bcrypto|\bbitcoin\b|\bday[\s-]?trad|\bpenny\s+stock|\bno[\s-]?risk\s+invest",
    re.IGNORECASE,
)
# Mirrors AGE_STEREOTYPE_PATTERNS in
# frontend/src/utils/studio/retirement-word-search/content-quality.ts.
_STEREOTYPE_RE = re.compile(
    r"\bfrail\b|\bforgetful\b|\bsenile\b|\bold[\s-]?timer\b|\bdecline\b|"
    r"\bfeeble\b|\buseless\b",
    re.IGNORECASE,
)
# Recall trivia rather than a clue: a year, a score, a percentage. The audience
# for this book is solving a word search, not sitting a quiz.
_RECALL_RE = re.compile(r"\b(19|20)\d{2}\b|\b\d+\s?%|\bhow many\b", re.IGNORECASE)


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


_rate_limiter = RateLimiter(
    label="trivia-clues",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class TriviaCluesRateLimitError(StudioRateLimitError):
    """User exceeded the short-window trivia-clue quota."""


class TriviaCluesGenerationError(StudioGenerationError):
    """Model output could not be turned into usable clue + answer pairs."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise TriviaCluesRateLimitError(str(exc)) from exc


def _scope(req: TriviaCluesRequest, user_id: str, seed: int) -> VarietyScope:
    """Same theme at the same difficulty is what risks repeating an earlier page."""
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.theme, req.difficulty),
        seed=seed,
    )


def _letter_band(req: TriviaCluesRequest) -> tuple[int, int]:
    """The request's band, clamped to what any grid this app draws holds."""
    low = max(int_value(_limits(), "minWordLetters"), req.min_letters)
    high = min(int_value(_limits(), "maxWordLetters"), req.max_letters)
    return low, max(low, high)


def _clue_budget(req: TriviaCluesRequest) -> int:
    return min(int_value(_limits(), "maxClueChars"), req.max_clue_chars)


def _is_unsafe(text: str) -> bool:
    return bool(
        _MEDICAL_RE.search(text)
        or _BRAND_RE.search(text)
        or _FINANCE_RE.search(text)
        or _STEREOTYPE_RE.search(text)
    )


def _normalize_answer(raw: Any, *, low: int, high: int) -> str | None:
    """A bare A-Z word inside the band, or None.

    Single words only: the grid prints one unbroken run of cells, so a phrase
    would advertise a letter count the puzzle does not have.
    """
    text = str(raw or "").strip()
    if not _ANSWER_RE.match(text):
        return None
    token = text.upper()
    if len(token) < low or len(token) > high:
        return None
    # A palindrome reads the same in both directions, so the grid holds two
    # correct answers and the key can only circle one of them.
    if token == token[::-1]:
        return None
    if _is_unsafe(token):
        return None
    return token


def _clue_echoes_answer(answer: str, clue: str) -> bool:
    """A clue that prints its own answer, or an obvious stem of it."""
    upper = clue.upper()
    if answer in upper:
        return True
    return len(answer) >= 5 and answer[:-1] in upper


def _normalize_clue(raw: Any, answer: str, *, budget: int) -> str | None:
    clue = re.sub(r"\s+", " ", str(raw or "").strip())
    clue = clue.strip(_CLUE_TRIM_CHARS)
    # Drop any length hint the model wrote; the page computes its own from the
    # grid, and two disagreeing counts on one line is worse than none.
    clue = _LENGTH_HINT_RE.sub("", clue).strip()
    if len(clue) < int_value(_limits(), "minClueChars") or len(clue) > budget:
        return None
    if _clue_echoes_answer(answer, clue):
        return None
    if _is_unsafe(clue) or _RECALL_RE.search(clue):
        return None
    return clue


def filter_pairs(
    raw_items: list[Any], *, low: int, high: int, budget: int, cap: int
) -> list[TriviaClueItem]:
    """Keep the pairs a page can number, place and answer exactly once."""
    seen_answers: set[str] = set()
    seen_clues: set[str] = set()
    pairs: list[tuple[str, str]] = []

    for raw in raw_items:
        if not isinstance(raw, dict):
            continue
        answer = _normalize_answer(
            raw.get("answer", raw.get("word", "")), low=low, high=high
        )
        if answer is None or answer in seen_answers:
            continue
        clue = _normalize_clue(raw.get("clue", ""), answer, budget=budget)
        if clue is None:
            continue
        # Two clues that read alike are two clues a solver cannot tell apart,
        # whatever the answers behind them are.
        clue_key = re.sub(r"[^a-z0-9 ]", "", clue.lower())
        if clue_key in seen_clues:
            continue
        seen_answers.add(answer)
        seen_clues.add(clue_key)
        pairs.append((answer, clue))

    # Longest first, so GARDENING survives and the GARDEN nested inside it goes.
    pairs.sort(key=lambda pair: (-len(pair[0]), pair[0]))
    kept: list[tuple[str, str]] = []
    for answer, clue in pairs:
        if any(answer in other for other, _clue in kept):
            continue
        kept.append((answer, clue))
    return [TriviaClueItem(answer=a, clue=c) for a, c in kept[:cap]]


def _min_pool(req: TriviaCluesRequest) -> int:
    """Below this the page cannot fill its clue list, so the attempt is wasted.

    The client already over-requests: ``count`` is the candidate budget, not the
    number of clues that print. Losing a third of a pool to the gates above is
    ordinary, and a second call costs a paid request against a per-minute quota.
    """
    return max(6, (req.count * 2) // 3)


def _parse_payload(raw: str) -> list[Any]:
    data = parse_json_object(raw)
    items = data.get("items", data.get("clues"))
    if not isinstance(items, list) or not items:
        raise ValueError("invalid JSON: missing items")
    return items


def _build_prompt(req: TriviaCluesRequest, *, seed: int | None = None) -> str:
    low, high = _letter_band(req)
    budget = _clue_budget(req)
    want = min(int_value(_limits(), "poolSize"), req.count)
    prompt_seed = req.seed if seed is None else seed
    angle = rotate(string_list(_config(), "varietyAngles"), prompt_seed)
    language = locale_line(section(_config(), "locale"), req.locale)
    difficulty = str(_config()["difficultyLine"]).format(difficulty=req.difficulty)

    return f"""Create trivia clues for a large-print word search in a printable
retirement activity book. The solver reads a clue, works out the answer, then
finds that answer hidden in a letter grid.

Theme: {req.theme.strip()}
Variety angle: {angle}
{difficulty}

Write {want} clue-and-answer pairs.

The answer:
- ONE English word, letters A-Z only. No spaces, hyphens, apostrophes or digits.
- {low} to {high} letters. Mix the lengths across that whole band.
- A familiar everyday word an older adult would recognise on sight.
- Clearly on the theme, and warm and positive about later life.
- No duplicates, no palindromes, and no answer contained inside another answer.

The clue:
- 2 to 12 words, and at most {budget} characters. It is set in large print in a
  narrow column, so count the characters before you write it.
- Exactly one sensible answer: the word you paired it with, and no other word
  on your own list. A clue several answers satisfy breaks the page.
- A plain definition or a short everyday question. No cryptic wordplay, no
  anagrams, no "sounds like", no fill-in-the-blank quotations.
- Never contains the answer or a stem of it -- a solver who already reads the
  answer has nothing to solve.
- No years, scores, percentages or "how many" questions. This is a warm puzzle,
  not a memory test.
- No brand names, celebrities, franchises, song, film or book titles, politics,
  health claims or finance advice.
- Nothing about frailty, memory loss or decline. This book is for its reader.
- Respectful of an adult reader: plain, never babyish, never obscure.
{language}

Return JSON only:
{{ "items": [ {{ "answer": "GARDEN", "clue": "Where you grow tomatoes and roses" }} ] }}
"""


async def _call_gemini(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        # Lower temperature: clue writing is a precision job, not a creative one.
        temperature=0.6,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=TriviaCluesModelOutput,
        label="trivia_clues",
    )


async def generate_trivia_clues(
    req: TriviaCluesRequest, user_id: str
) -> TriviaCluesResponse:
    _check_rate_limit(user_id)

    low, high = _letter_band(req)
    budget = _clue_budget(req)
    need = _min_pool(req)
    attempts = int_value(_limits(), "maxAttempts")
    last_error = FINAL_ERROR
    started = time.perf_counter()

    for attempt in range(attempts):
        seed = req.seed + attempt * 97
        scope = _scope(req, user_id, seed)
        prompt = with_variety(
            _build_prompt(req, seed=seed), scope, client_avoid=req.avoid
        )
        try:
            raw = await _call_gemini(prompt)
            items_raw = _parse_payload(raw)
        except Exception as exc:
            logger.warning(
                "studio_trivia_clues_attempt_failed attempt=%s error=%s",
                attempt + 1,
                exc,
            )
            last_error = "The AI did not return valid trivia clues. Please try again."
            continue

        items = filter_pairs(items_raw, low=low, high=high, budget=budget, cap=req.count)
        if len(items) < need:
            last_error = (
                "Could not get enough clear trivia clues. "
                "Try a broader theme, or a gentler level."
            )
            continue

        remember(scope, (item.answer for item in items))
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        logger.info(
            "studio_trivia_clues_generated model=%s latency_ms=%s pairs=%s theme=%s",
            settings.STUDIO_GEMINI_MODEL,
            elapsed_ms,
            len(items),
            req.theme[:40],
        )
        return TriviaCluesResponse(items=items)

    raise TriviaCluesGenerationError(last_error)


def build_prompt_for_tests(req: TriviaCluesRequest) -> str:
    return _build_prompt(req)


def parse_payload_for_tests(raw: str) -> list[Any]:
    return _parse_payload(raw)


def filter_pairs_for_tests(
    raw_items: list[Any],
    *,
    low: int = 4,
    high: int = 8,
    budget: int = 58,
    cap: int = 32,
) -> list[TriviaClueItem]:
    return filter_pairs(raw_items, low=low, high=high, budget=budget, cap=cap)
