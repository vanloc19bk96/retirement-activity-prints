"""Generate Story Recall passages + WH questions via Gemini."""

from __future__ import annotations

import logging
import time
from functools import lru_cache
from typing import Any

from app.core.config import settings
from app.schemas.studio_story import (
    StoryModelOutput,
    StoryQuestion,
    StoryRecallRequest,
    StoryRecallResponse,
)
from app.services.studio_gemini import (
    RateLimiter,
    StudioGenerationError,
    StudioRateLimitError,
    call_gemini_json,
    parse_json_object,
)
from app.services.prompt_data import (
    float_value,
    int_value,
    section,
    string_list,
)
from app.services.studio_story_prompts import (
    GAME,
    build_expand_prompt,
    build_story_prompt,
    config as story_config,
    word_range,
)
from app.services.studio_variety import (
    VarietyScope,
    bucket_key,
    remember,
    with_variety,
)

logger = logging.getLogger(__name__)


def _max_output_tokens(length: str) -> int:
    return int(section(story_config(), "maxOutputTokens")[length])


@lru_cache(maxsize=1)
def _valid_wh() -> frozenset[str]:
    return frozenset(string_list(story_config(), "validWh"))


# Simple per-user token bucket (in-process). Protects LLM spend on "generate".
_rate_limiter = RateLimiter(
    label="story",
    max_per_window=int_value(section(story_config(), "limits"), "rateLimitPerWindow"),
)


class StoryRateLimitError(StudioRateLimitError):
    """User exceeded the short-window story generation quota."""


class StoryGenerationError(StudioGenerationError):
    """Model output could not be parsed into a valid story."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise StoryRateLimitError(str(exc)) from exc


def _count_words(text: str) -> int:
    return len(text.split())


def _is_passage_too_short(passage: str, length: str) -> bool:
    lo, _ = word_range(length)
    ratio = float_value(section(story_config(), "limits"), "shortPassageRatio")
    return _count_words(passage) < int(lo * ratio)


def _validate_shape(data: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(data.get("passage"), str) or not data["passage"].strip():
        raise ValueError("missing passage")
    if not isinstance(data.get("questions"), list) or not data["questions"]:
        raise ValueError("missing questions")
    for q in data["questions"]:
        if not isinstance(q, dict):
            raise ValueError("malformed question")
        if not all(k in q for k in ("wh", "question", "answer")):
            raise ValueError("malformed question")
        wh = str(q["wh"]).strip().lower().replace(" ", "").replace("_", "")
        if wh == "howmany" or wh == "howmany?":
            q["wh"] = "howmany"
        elif wh not in _valid_wh():
            raise ValueError(f"invalid wh: {q['wh']}")
        else:
            q["wh"] = wh
        if not str(q["question"]).strip() or not str(q["answer"]).strip():
            raise ValueError("empty question or answer")
    return data


def _parse_story_json(raw: str) -> dict[str, Any]:
    return _validate_shape(parse_json_object(raw))


async def _call_gemini(prompt: str, *, max_output_tokens: int) -> str:
    """Seam for tests; keeps the shared client call in one place."""
    return await call_gemini_json(
        prompt=prompt,
        temperature=0.7,
        max_output_tokens=max_output_tokens,
        response_schema=StoryModelOutput,
        label="story",
    )


async def _generate_story_json(
    prompt: str, *, max_output_tokens: int
) -> dict[str, Any]:
    raw = await _call_gemini(prompt, max_output_tokens=max_output_tokens)
    return _parse_story_json(raw)


def _scope(req: StoryRecallRequest, user_id: str) -> VarietyScope:
    """Theme + shape decide which story the model tells."""
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.theme, req.length, req.difficulty),
        seed=req.seed,
    )


async def generate_story_recall(
    req: StoryRecallRequest, user_id: str
) -> StoryRecallResponse:
    _check_rate_limit(user_id)
    scope = _scope(req, user_id)
    prompt = with_variety(build_story_prompt(req), scope, client_avoid=req.avoid)
    started = time.perf_counter()
    max_output_tokens = _max_output_tokens(req.length)

    try:
        data = await _generate_story_json(
            prompt, max_output_tokens=max_output_tokens
        )
        # Models often ignore soft length hints (~80–100 words). Retry once if short.
        if _is_passage_too_short(str(data.get("passage", "")), req.length):
            first_words = _count_words(str(data["passage"]))
            logger.info(
                "studio_story_length_retry",
                extra={
                    "user_id": user_id,
                    "length": req.length,
                    "word_count": first_words,
                },
            )
            try:
                expanded = await _generate_story_json(
                    build_expand_prompt(req, data, first_words),
                    max_output_tokens=max_output_tokens,
                )
                if _count_words(str(expanded["passage"])) > first_words:
                    data = expanded
            except Exception as expand_exc:
                logger.warning(
                    "studio_story_length_retry_failed",
                    extra={"user_id": user_id, "error": str(expand_exc)},
                )
    except StoryGenerationError:
        raise
    except Exception as exc:
        logger.warning(
            "studio_story_generation_failed: %s",
            exc,
            extra={
                "user_id": user_id,
                "model": settings.STUDIO_GEMINI_MODEL,
                "error": str(exc),
            },
        )
        raise StoryGenerationError("Model did not return valid story JSON") from exc

    questions = [
        StoryQuestion(
            id=f"q{i + 1}",
            wh=q["wh"],
            question=str(q["question"]).strip(),
            answer=str(q["answer"]).strip(),
        )
        for i, q in enumerate(data["questions"][: req.question_count])
    ]
    if len(questions) < 3:
        raise StoryGenerationError("Model returned too few valid questions")

    passage = str(data["passage"]).strip()
    # The title stands in for the whole story: same title, same page.
    remember(scope, [str(data.get("title", "")).strip()])

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "studio_story_generated",
        extra={
            "user_id": user_id,
            "model": settings.STUDIO_GEMINI_MODEL,
            "latency_ms": elapsed_ms,
            "length": req.length,
            "passage_words": _count_words(passage),
            "passage_len": len(passage),
            "question_count": len(questions),
        },
    )

    return StoryRecallResponse(
        title=str(data.get("title", "A Short Story")).strip() or "A Short Story",
        passage=passage,
        questions=questions,
    )


# Test helpers (pure, no network)
def parse_story_json_for_tests(raw: str) -> dict[str, Any]:
    return _parse_story_json(raw)


def validate_story_shape_for_tests(data: dict[str, Any]) -> dict[str, Any]:
    return _validate_shape(data)


def count_words_for_tests(text: str) -> int:
    return _count_words(text)


def is_passage_too_short_for_tests(passage: str, length: str) -> bool:
    return _is_passage_too_short(passage, length)
