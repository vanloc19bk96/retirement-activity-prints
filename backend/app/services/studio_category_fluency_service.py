"""Generate Category Fluency prompts + reference lists via Gemini."""

from __future__ import annotations

import logging
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_category_fluency import (
    CategoryFluencyModelOutput,
    CategoryFluencyRequest,
    CategoryFluencyResponse,
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

GAME = "category-fluency"


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")

_rate_limiter = RateLimiter(
    label="category fluency",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class CategoryFluencyRateLimitError(StudioRateLimitError):
    """User exceeded the short-window category fluency generation quota."""


class CategoryFluencyGenerationError(StudioGenerationError):
    """Model output could not be parsed into a valid category fluency payload."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise CategoryFluencyRateLimitError(str(exc)) from exc


def _clamp_line_count(raw: int) -> int:
    limits = _limits()
    return max(
        int_value(limits, "minLineCount"),
        min(int_value(limits, "maxLineCount"), int(raw)),
    )


def _scope(req: CategoryFluencyRequest, user_id: str) -> VarietyScope:
    """The picked category is the repeat: the same hint keeps returning it."""
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.category_hint or "", req.difficulty),
        seed=req.seed,
    )


def _build_prompt(req: CategoryFluencyRequest) -> str:
    line_count = _clamp_line_count(req.line_count)
    raw_hint = (req.category_hint or "").strip()
    hint = (
        str(_config()["categoryHintLine"]).format(hint=raw_hint) if raw_hint else ""
    )
    level = section(_config(), "difficultyLevels")[req.difficulty]
    language_line = locale_line(section(_config(), "locale"), req.locale)
    return f"""Pick ONE semantic fluency category for a brain exercise: {level}.{hint}
Then list at least {line_count} members of that category (prefer exactly {line_count}).
Seed for variety: {req.seed}.

The list is the answer key a facilitator checks against, so it must be broad
rather than clever: if a reasonable person would name it in one minute, include it.

Rules:
- The category name is 1-4 words and unambiguous, so a solver knows instantly
  whether something belongs (e.g. "Kitchen utensils", not "Useful things").
- Every example is a genuine member of the category — no near-misses.
- Order roughly from most obvious to least obvious.
- Provide at least {line_count} distinct members — the worksheet has {line_count} lines.
- No brand names. No proper nouns unless the category is about them
  (e.g. countries). No duplicates or plurals of an entry already listed.
{language_line}

Write the category name in "category" and the members in "examples".
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


def _validate_shape(data: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(data.get("category"), str) or not data["category"].strip():
        raise ValueError("missing category")
    if not isinstance(data.get("examples"), list) or not data["examples"]:
        raise ValueError("missing examples")
    return data


def _parse_category_json(raw: str) -> dict[str, Any]:
    return _validate_shape(parse_json_object(raw))


async def _call_gemini(prompt: str) -> str:
    """Seam for tests; keeps the shared client call in one place."""
    return await call_gemini_json(
        prompt=prompt,
        max_output_tokens=4096,
        response_schema=CategoryFluencyModelOutput,
        label="category_fluency",
    )


async def generate_category_fluency(
    req: CategoryFluencyRequest, user_id: str
) -> CategoryFluencyResponse:
    _check_rate_limit(user_id)
    scope = _scope(req, user_id)
    prompt = with_variety(_build_prompt(req), scope, client_avoid=req.avoid)
    started = time.perf_counter()

    try:
        raw = await _call_gemini(prompt)
        data = _parse_category_json(raw)
    except CategoryFluencyGenerationError:
        raise
    except Exception as exc:
        logger.warning(
            "studio_category_fluency_generation_failed error=%s model=%s user_id=%s",
            exc,
            settings.STUDIO_GEMINI_MODEL,
            user_id,
            exc_info=True,
        )
        raise CategoryFluencyGenerationError(
            "Model did not return valid category fluency JSON"
        ) from exc

    line_count = _clamp_line_count(req.line_count)
    category = str(data["category"]).strip()
    examples = _dedupe_preserve(
        [str(e).strip() for e in data["examples"] if str(e).strip()]
    )[:line_count]

    if not category or len(examples) < line_count:
        raise CategoryFluencyGenerationError("model returned too little")

    # Only the category: two sheets on "Kitchen utensils" are the duplicate a
    # reader notices, not a shared example inside two different categories.
    remember(scope, [category])

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "studio_category_fluency_generated",
        extra={
            "user_id": user_id,
            "model": settings.STUDIO_GEMINI_MODEL,
            "latency_ms": elapsed_ms,
            "category": category,
            "example_count": len(examples),
            "line_count": line_count,
        },
    )

    return CategoryFluencyResponse(category=category, examples=examples)


# Test helpers (pure, no network)
def build_prompt_for_tests(req: CategoryFluencyRequest) -> str:
    return _build_prompt(req)


def parse_category_json_for_tests(raw: str) -> dict[str, Any]:
    return _parse_category_json(raw)


def validate_category_shape_for_tests(data: dict[str, Any]) -> dict[str, Any]:
    return _validate_shape(data)
