"""Generate Anagram Sheet themed words + hints via Gemini."""

from __future__ import annotations

import logging
import re
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_anagram import (
    AnagramItem,
    AnagramModelOutput,
    AnagramRequest,
    AnagramResponse,
)
from app.services.studio_gemini import (
    RateLimiter,
    StudioGenerationError,
    StudioRateLimitError,
    call_gemini_json,
    parse_json_object,
)
from app.services.prompt_data import (
    int_value,
    load_config,
    locale_line,
    section,
)
from app.services.studio_variety import (
    VarietyScope,
    bucket_key,
    remember,
    with_variety,
)

logger = logging.getLogger(__name__)

GAME = "anagram"


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


@lru_cache(maxsize=1)
def _word_re() -> re.Pattern[str]:
    low = int_value(_limits(), "minWordLetters")
    high = int_value(_limits(), "maxWordLetters")
    return re.compile(rf"^[A-Za-z]{{{low},{high}}}$")


def _length_for(difficulty: str) -> tuple[int, int]:
    low, high = section(_config(), "lengthByDifficulty")[difficulty]
    return int(low), int(high)


# Ask for spares so the anagram + hint filters can drop weak rows and still fill
# the sheet.
_rate_limiter = RateLimiter(
    label="anagram",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class AnagramRateLimitError(StudioRateLimitError):
    """User exceeded the short-window anagram generation quota."""


class AnagramGenerationError(StudioGenerationError):
    """Model output could not be parsed into a valid anagram payload."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise AnagramRateLimitError(str(exc)) from exc


def _scope(req: AnagramRequest, user_id: str) -> VarietyScope:
    """Same theme + difficulty is what risks repeating an earlier word list."""
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.theme, req.difficulty),
        seed=req.seed,
    )


def _build_prompt(req: AnagramRequest) -> str:
    min_len, max_len = _length_for(req.difficulty)
    want = req.item_count + int_value(_limits(), "overRequest")
    language_line = locale_line(section(_config(), "locale"), req.locale)
    return f"""Pick {want} common words about: {req.theme.strip()}.
Each word is printed with its letters shuffled and the solver unscrambles it, so
the puzzle only works if the letters spell exactly one word.
Seed for variety: {req.seed}.

Word rules:
- {min_len}-{max_len} letters, A-Z only. Count the letters before writing.
- The letters must NOT rearrange into a second common word. Skip words like
  lemon/melon, listen/silent, earth/heart, angle/glean, stone/notes.
- Everyday vocabulary an older adult would recognise. No brand names, no proper
  nouns, no duplicates.

Hint rules:
- 8 words or fewer, a plain definition or category.
- The hint must never contain the answer word or any part of it.

{language_line}

Write one entry per word in "items", each with "word" and "hint".
"""


def _validate_shape(data: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(data.get("items"), list) or not data["items"]:
        raise ValueError("missing items")
    return data


def _parse_anagram_json(raw: str) -> dict[str, Any]:
    return _validate_shape(parse_json_object(raw))


def _normalize_items(
    raw_items: list[Any], *, min_len: int, max_len: int, want: int
) -> list[AnagramItem]:
    seen: set[str] = set()
    out: list[AnagramItem] = []
    for entry in raw_items:
        if not isinstance(entry, dict):
            continue
        word = str(entry.get("word", "")).strip().upper()
        hint = str(entry.get("hint", "")).strip()
        if not _word_re().match(word):
            continue
        if len(word) < min_len or len(word) > max_len:
            continue
        if word in seen:
            continue
        if not hint or word in hint.upper():
            continue
        seen.add(word)
        out.append(AnagramItem(word=word, hint=hint))
        if len(out) >= want:
            break
    return out


async def _call_gemini(prompt: str) -> str:
    """Seam for tests; keeps the shared client call in one place."""
    return await call_gemini_json(
        prompt=prompt,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=AnagramModelOutput,
        label="anagram",
    )


async def generate_anagram(req: AnagramRequest, user_id: str) -> AnagramResponse:
    _check_rate_limit(user_id)
    scope = _scope(req, user_id)
    prompt = with_variety(_build_prompt(req), scope, client_avoid=req.avoid)
    started = time.perf_counter()
    min_len, max_len = _length_for(req.difficulty)

    try:
        raw = await _call_gemini(prompt)
        data = _parse_anagram_json(raw)
    except AnagramGenerationError:
        raise
    except Exception as exc:
        logger.warning(
            "studio_anagram_generation_failed error=%s model=%s",
            exc,
            settings.STUDIO_GEMINI_MODEL,
            exc_info=True,
        )
        raise AnagramGenerationError(
            "Model did not return valid anagram JSON"
        ) from exc

    items = _normalize_items(
        data["items"], min_len=min_len, max_len=max_len, want=req.item_count
    )
    if len(items) < max(5, req.item_count // 2):
        raise AnagramGenerationError("model returned too few valid words")

    remember(scope, (item.word for item in items))

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "studio_anagram_generated",
        extra={
            "user_id": user_id,
            "model": settings.STUDIO_GEMINI_MODEL,
            "latency_ms": elapsed_ms,
            "item_count": len(items),
            "theme": req.theme[:40],
        },
    )

    return AnagramResponse(items=items)


# Test helpers (pure, no network)
def build_prompt_for_tests(req: AnagramRequest) -> str:
    return _build_prompt(req)


def parse_anagram_json_for_tests(raw: str) -> dict[str, Any]:
    return _parse_anagram_json(raw)


def validate_anagram_shape_for_tests(data: dict[str, Any]) -> dict[str, Any]:
    return _validate_shape(data)


def normalize_items_for_tests(
    raw_items: list[Any], *, min_len: int, max_len: int, want: int
) -> list[AnagramItem]:
    return _normalize_items(raw_items, min_len=min_len, max_len=max_len, want=want)
