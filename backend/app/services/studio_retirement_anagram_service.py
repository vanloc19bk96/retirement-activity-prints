"""Generate retirement-themed anagram answer words via Gemini.

AI-only: no bundled animal/common-theme fallback. Words must relate to the
selected retirement topic and fit the difficulty letter budget.
"""

from __future__ import annotations

import logging
import re
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_retirement_anagram import (
    RetirementAnagramModelOutput,
    RetirementAnagramRequest,
    RetirementAnagramResponse,
)
from app.services.studio_gemini import (
    RateLimiter,
    StudioGenerationError,
    StudioRateLimitError,
    call_gemini_json,
    parse_string_items,
)
from app.services.prompt_data import (
    int_value,
    load_config,
    locale_line,
    rotate,
    section,
    string_list,
)
from app.services.studio_variety import (
    VarietyScope,
    bucket_key,
    remember,
    with_variety,
)

logger = logging.getLogger(__name__)

GAME = "retirement-anagram"


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


def _length_for(difficulty: str) -> tuple[int, int]:
    """Mirrors LENGTH_RANGE in frontend retirement-anagram/content.ts."""
    low, high = section(_config(), "lengthByDifficulty")[difficulty]
    return int(low), int(high)


@lru_cache(maxsize=1)
def _angles() -> tuple[str, ...]:
    return string_list(_config(), "varietyAngles")


@lru_cache(maxsize=1)
def _word_re() -> re.Pattern[str]:
    low = int_value(_limits(), "minWordLetters")
    high = int_value(_limits(), "maxWordLetters")
    return re.compile(rf"^[A-Za-z]{{{low},{high}}}$")


_rate_limiter = RateLimiter(
    label="retirement-anagram",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class RetirementAnagramRateLimitError(StudioRateLimitError):
    """User exceeded the short-window retirement-anagram quota."""


class RetirementAnagramGenerationError(StudioGenerationError):
    """Model output could not be parsed into usable words."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise RetirementAnagramRateLimitError(str(exc)) from exc


def _scope(req: RetirementAnagramRequest, user_id: str) -> VarietyScope:
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.topic, req.difficulty),
        seed=req.seed,
    )


def _build_prompt(req: RetirementAnagramRequest) -> str:
    min_len, max_len = _length_for(req.difficulty)
    want = req.item_count + int_value(_limits(), "overRequest")
    angle = rotate(_angles(), req.seed)
    language_line = locale_line(section(_config(), "locale"), req.locale)
    return f"""Pick {want} single English words clearly about: {req.topic.strip()}.
Focus angle for variety: {angle}.
Each word will be printed with its letters shuffled for a retirement activity book.
Seed for variety: {req.seed}.

Word rules:
- {min_len}-{max_len} letters, A-Z only. Count letters before writing.
- Single words only — no phrases, hyphens, or spaces.
- Familiar vocabulary for adults and seniors.
- Must clearly relate to the retirement topic above.
- No proper nouns, brands, abbreviations, or slang.
- No offensive, medical-crisis, or depressing retirement concepts.
- No duplicates.
- Prefer words whose letters spell only ONE common English word
  (skip lemon/melon, listen/silent, earth/heart, angle/glean, stone/notes).

{language_line}

Return JSON with "items": an array of {want} uppercase words (strings only).
"""


def _normalize_words(
    raw_items: list[Any], *, min_len: int, max_len: int, want: int
) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for entry in raw_items:
        word = re.sub(r"[^A-Z]", "", str(entry).strip().upper())
        if not word or not _word_re().match(word):
            continue
        if len(word) < min_len or len(word) > max_len:
            continue
        if word in seen:
            continue
        seen.add(word)
        out.append(word)
        if len(out) >= want:
            break
    return out


async def _call_gemini(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=RetirementAnagramModelOutput,
        label="retirement-anagram",
    )


async def generate_retirement_anagram(
    req: RetirementAnagramRequest, user_id: str
) -> RetirementAnagramResponse:
    _check_rate_limit(user_id)
    scope = _scope(req, user_id)
    prompt = with_variety(_build_prompt(req), scope, client_avoid=req.avoid)
    started = time.perf_counter()
    min_len, max_len = _length_for(req.difficulty)
    want = req.item_count + int_value(_limits(), "overRequest")

    try:
        raw = await _call_gemini(prompt)
        items_raw = parse_string_items(raw)
    except RetirementAnagramGenerationError:
        raise
    except Exception as exc:
        logger.warning(
            "studio_retirement_anagram_generation_failed error=%s model=%s",
            exc,
            settings.STUDIO_GEMINI_MODEL,
            exc_info=True,
        )
        raise RetirementAnagramGenerationError(
            "Model did not return valid retirement-anagram JSON"
        ) from exc

    items = _normalize_words(items_raw, min_len=min_len, max_len=max_len, want=want)
    if len(items) < max(5, req.item_count // 2):
        raise RetirementAnagramGenerationError("model returned too few valid words")

    remember(scope, items)

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "studio_retirement_anagram_generated model=%s latency_ms=%s item_count=%s "
        "difficulty=%s topic=%s",
        settings.STUDIO_GEMINI_MODEL,
        elapsed_ms,
        len(items),
        req.difficulty,
        req.topic[:40],
    )

    return RetirementAnagramResponse(items=items)


def build_prompt_for_tests(req: RetirementAnagramRequest) -> str:
    return _build_prompt(req)


def parse_json_for_tests(raw: str) -> list[Any]:
    return parse_string_items(raw)


def normalize_words_for_tests(
    raw_items: list[Any], *, min_len: int, max_len: int, want: int
) -> list[str]:
    return _normalize_words(raw_items, min_len=min_len, max_len=max_len, want=want)
