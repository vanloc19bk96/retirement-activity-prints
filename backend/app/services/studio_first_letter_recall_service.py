"""Generate First Letter Recall sample word lists via Gemini."""

from __future__ import annotations

import logging
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_first_letter_recall import (
    FirstLetterRecallModelOutput,
    FirstLetterRecallRequest,
    FirstLetterRecallResponse,
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

GAME = "first-letter-recall"


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")
_rate_limiter = RateLimiter(
    label="first letter recall",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class FirstLetterRecallRateLimitError(StudioRateLimitError):
    """User exceeded the short-window first-letter-recall generation quota."""


class FirstLetterRecallGenerationError(StudioGenerationError):
    """Model output could not be parsed into a valid first-letter payload."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise FirstLetterRecallRateLimitError(str(exc)) from exc


def _clamp_line_count(raw: int) -> int:
    limits = _limits()
    return max(
        int_value(limits, "minLineCount"),
        min(int_value(limits, "maxLineCount"), int(raw)),
    )


def _scope(req: FirstLetterRecallRequest, user_id: str) -> VarietyScope:
    """The requested letters decide the word pool that keeps recurring."""
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key("".join(req.letters)),
        seed=req.seed,
    )


def _build_prompt(req: FirstLetterRecallRequest) -> str:
    letters = ", ".join(req.letters)
    line_count = _clamp_line_count(req.line_count)
    language_line = locale_line(section(_config(), "locale"), req.locale)
    return f"""For a timed letter-fluency brain exercise, list at least {line_count}
common words that begin with EACH of these letters: {letters}
(prefer exactly {line_count} per letter).
Seed for variety: {req.seed}.

The list is the answer key a facilitator checks against, so favour the words a
person would actually say under time pressure over unusual vocabulary.

Rules for every word:
- Must start with the given letter.
- Everyday vocabulary an older adult would recognise.
- No names of people or places.
- No brand names.
- No number words (e.g. four, five, fifty).
- No plurals of a word already listed (prefer singular forms).
- No duplicates within a letter.
- Provide at least {line_count} distinct words per letter — the worksheet has {line_count} lines.
- Order roughly from most obvious to least obvious.
{language_line}

Return one entry in "groups" for EACH requested letter, in the order given:
"letter" is the letter itself, "words" is that letter's list.
"""


def _dedupe_preserve(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        key = item.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def _normalize_by_letter(
    raw: dict[str, Any], letters: list[str], line_count: int
) -> dict[str, list[str]]:
    by_letter: dict[str, list[str]] = {}
    count = _clamp_line_count(line_count)
    for letter in letters:
        bucket = raw.get(letter) or raw.get(letter.lower())
        if not isinstance(bucket, list):
            raise ValueError(f"missing examples for letter {letter}")
        words = _dedupe_preserve(
            [str(e).strip() for e in bucket if str(e).strip()]
        )
        # Keep only words that actually start with the letter.
        words = [w for w in words if w[:1].upper() == letter][:count]
        if len(words) < count:
            raise ValueError(f"too few examples for letter {letter}")
        by_letter[letter] = words
    return by_letter


def _groups_to_map(groups: list[Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for group in groups:
        if not isinstance(group, dict):
            continue
        letter = str(group.get("letter", "")).strip().upper()[:1]
        if letter:
            out[letter] = group.get("words")
    return out


def _parse_payload(
    raw: str, letters: list[str], line_count: int
) -> dict[str, list[str]]:
    data = parse_json_object(raw)
    groups = data.get("groups")
    if isinstance(groups, list) and groups:
        return _normalize_by_letter(_groups_to_map(groups), letters, line_count)
    # Older prompt shape, and what hand-written fixtures still use.
    nested = data.get("byLetter") or data.get("by_letter")
    if not isinstance(nested, dict):
        raise ValueError("missing groups")
    return _normalize_by_letter(nested, letters, line_count)


async def generate_first_letter_recall(
    req: FirstLetterRecallRequest, user_id: str
) -> FirstLetterRecallResponse:
    _check_rate_limit(user_id)
    scope = _scope(req, user_id)
    prompt = with_variety(_build_prompt(req), scope, client_avoid=req.avoid)
    started = time.perf_counter()

    try:
        raw = await call_gemini_json(
            prompt=prompt,
            # 3 letters x 30 words plus schema overhead; wide by design because
            # a truncated answer key is a short answer key.
            max_output_tokens=6144,
            temperature=0.9,
            response_schema=FirstLetterRecallModelOutput,
            label="first_letter_recall",
        )
        by_letter = _parse_payload(raw, req.letters, req.line_count)
    except FirstLetterRecallGenerationError:
        raise
    except Exception as exc:
        logger.warning(
            "studio_first_letter_recall_generation_failed error=%s model=%s user_id=%s",
            exc,
            settings.STUDIO_GEMINI_MODEL,
            user_id,
            exc_info=True,
        )
        raise FirstLetterRecallGenerationError(
            "Model did not return valid first letter recall JSON"
        ) from exc

    remember(scope, (word for words in by_letter.values() for word in words))

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "studio_first_letter_recall_generated",
        extra={
            "user_id": user_id,
            "model": settings.STUDIO_GEMINI_MODEL,
            "latency_ms": elapsed_ms,
            "letters": req.letters,
            "line_count": req.line_count,
            "example_counts": {k: len(v) for k, v in by_letter.items()},
        },
    )

    return FirstLetterRecallResponse(byLetter=by_letter)


# Test helpers (pure, no network)
def parse_first_letter_payload_for_tests(
    raw: str, letters: list[str], line_count: int = 8
) -> dict[str, list[str]]:
    return _parse_payload(raw, letters, line_count)
