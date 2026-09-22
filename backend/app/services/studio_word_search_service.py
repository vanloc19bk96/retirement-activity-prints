"""Generate a retirement word-search pool via Gemini.

Every entry here is printed inside a grid and sold on KDP, so the gates below
drop three kinds of word rather than set them: copy that puts a title at risk
(brands, health claims, finance advice), copy that talks down to the reader the
book is for, and words the puzzle itself cannot be honest about — palindromes
and words nested inside other words, both of which give a grid two right
answers and an answer key that circles one.
"""

from __future__ import annotations

import logging
import re
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_word_search import (
    WordSearchModelOutput,
    WordSearchRequest,
    WordSearchResponse,
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
from app.services.studio_variety import VarietyScope, bucket_key, remember, with_variety

logger = logging.getLogger(__name__)

GAME = "word-search"
FINAL_ERROR = "Could not build a word search. Try again, or pick a broader theme."
_LETTER_RE = re.compile(r"[^A-Z]")
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


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


_rate_limiter = RateLimiter(
    label="word-search",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class WordSearchRateLimitError(StudioRateLimitError):
    """User exceeded the short-window word-search quota."""


class WordSearchGenerationError(StudioGenerationError):
    """Model output could not be turned into a usable word pool."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise WordSearchRateLimitError(str(exc)) from exc


def _scope(req: WordSearchRequest, user_id: str, seed: int) -> VarietyScope:
    """Same theme and letter band is what risks repeating an earlier page."""
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.theme, str(req.min_letters), str(req.max_letters)),
        seed=seed,
    )


def _letter_band(req: WordSearchRequest) -> tuple[int, int]:
    """The request's band, clamped to what any grid this app draws can hold."""
    low = max(int_value(_limits(), "minWordLetters"), req.min_letters)
    high = min(int_value(_limits(), "maxWordLetters"), req.max_letters)
    return low, max(low, high)


def _letter_token(text: str) -> str:
    return _LETTER_RE.sub("", text.upper())


def _is_unsafe(text: str) -> bool:
    return bool(
        _MEDICAL_RE.search(text)
        or _BRAND_RE.search(text)
        or _FINANCE_RE.search(text)
        or _STEREOTYPE_RE.search(text)
    )


def _normalize_word(raw: Any, *, low: int, high: int) -> tuple[str, str] | None:
    display = re.sub(r"\s+", " ", str(raw or "").strip())
    if not display:
        return None
    token = _letter_token(display)
    if len(token) < low or len(token) > high:
        return None
    letters_only = re.sub(r"[\s'’-]", "", display.upper())
    if letters_only != token:
        return None
    # A palindrome reads the same in both directions, so the grid holds two
    # correct answers and the key can only circle one of them.
    if token == token[::-1] or _is_unsafe(display):
        return None
    return display, token


def filter_word_pool(raw_words: list[Any], *, low: int, high: int, cap: int) -> list[str]:
    seen: set[str] = set()
    entries: list[tuple[str, str]] = []
    for raw in raw_words:
        normalized = _normalize_word(raw, low=low, high=high)
        if normalized is None:
            continue
        display, token = normalized
        if token in seen:
            continue
        seen.add(token)
        entries.append((display, token))

    # Longest first, so GARDENING survives and the GARDEN nested inside it goes.
    entries.sort(key=lambda item: (-len(item[1]), item[1]))
    kept: list[tuple[str, str]] = []
    for display, token in entries:
        if any(token in other_token for _other_display, other_token in kept):
            continue
        kept.append((display, token))
    return [display for display, _token in kept[:cap]]


def _min_pool(req: WordSearchRequest) -> int:
    """Below this the page cannot fill its word bank, so the attempt is wasted.

    The client already over-requests: ``count`` is the candidate budget, not the
    number of words that print. Two thirds of it is what the page needs once its
    own gates — grid width, bank column width — have run.
    """
    return max(8, (req.count * 2) // 3)


def _parse_payload(raw: str) -> list[Any]:
    data = parse_json_object(raw)
    words = data.get("words")
    if not isinstance(words, list) or not words:
        raise ValueError("invalid JSON: missing words")
    return words


def _build_prompt(req: WordSearchRequest, *, seed: int | None = None) -> str:
    low, high = _letter_band(req)
    want = min(int_value(_limits(), "poolSize"), req.count)
    prompt_seed = req.seed if seed is None else seed
    angle = rotate(string_list(_config(), "varietyAngles"), prompt_seed)
    language = locale_line(section(_config(), "locale"), req.locale)
    return f"""Create a pool of {want} retirement words or short phrases for a word search.
Theme: {req.theme.strip()}
Variety angle: {angle}

Length (hard constraint — count the letters before writing):
- {low} to {high} letters once spaces, apostrophes and hyphens are removed.

Rules:
- Every entry clearly fits the theme, and is warm and positive about later life.
- Familiar vocabulary an older adult would recognise on sight.
- Letters A-Z only. Two-word phrases are welcome; keep their space for display.
- Write each entry in Title Case, the way it should print in the word list.
- No duplicates, no palindromes, and no entry contained inside another entry.
- No brand names, copyrighted characters, health claims, or finance advice.
- Nothing about frailty, memory loss or decline. This book is for its reader.
{language}

Return JSON only: {{ "words": ["Free Time", "Garden", "Travel"] }}
"""


async def _call_gemini(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=WordSearchModelOutput,
        label="word_search",
    )


async def generate_word_search(
    req: WordSearchRequest, user_id: str
) -> WordSearchResponse:
    _check_rate_limit(user_id)
    started = time.perf_counter()
    attempts = int_value(_limits(), "maxAttempts")
    low, high = _letter_band(req)
    cap = min(int_value(_limits(), "poolSize"), req.count)

    for attempt in range(attempts):
        seed = req.seed + attempt * 97
        scope = _scope(req, user_id, seed)
        prompt = with_variety(
            _build_prompt(req, seed=seed),
            scope,
            client_avoid=req.avoid,
        )
        try:
            raw = await _call_gemini(prompt)
            words = filter_word_pool(_parse_payload(raw), low=low, high=high, cap=cap)
        except Exception as exc:
            logger.warning(
                "studio_word_search_attempt_failed attempt=%s error=%s",
                attempt + 1,
                exc,
            )
            continue

        if len(words) < _min_pool(req):
            logger.warning(
                "studio_word_search_pool_too_small attempt=%s got=%s need=%s band=%s-%s",
                attempt + 1,
                len(words),
                _min_pool(req),
                low,
                high,
            )
            continue

        result = WordSearchResponse(words=words)
        remember(scope, result.words)
        logger.info(
            "studio_word_search_generated model=%s latency_ms=%s words=%s band=%s-%s theme=%s",
            settings.STUDIO_GEMINI_MODEL,
            int((time.perf_counter() - started) * 1000),
            len(result.words),
            low,
            high,
            req.theme[:40],
        )
        return result

    raise WordSearchGenerationError(FINAL_ERROR)


def build_prompt_for_tests(req: WordSearchRequest) -> str:
    return _build_prompt(req)


def parse_payload_for_tests(raw: str) -> list[Any]:
    return _parse_payload(raw)


def filter_word_pool_for_tests(
    raw_words: list[Any], *, low: int = 4, high: int = 9, cap: int = 30
) -> list[str]:
    return filter_word_pool(raw_words, low=low, high=high, cap=cap)
