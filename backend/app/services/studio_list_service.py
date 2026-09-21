"""Generate Shopping List Recall targets + distractors via Gemini."""

from __future__ import annotations

import logging
import random
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_list import (
    ListItem,
    ListModelOutput,
    ListRecallRequest,
    ListRecallResponse,
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
    string_list,
)
from app.services.studio_variety import (
    VarietyScope,
    bucket_key,
    remember,
    with_variety,
)

logger = logging.getLogger(__name__)

GAME = "list-recall"


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _valid_tiers() -> frozenset[str]:
    return frozenset(string_list(_config(), "validTiers"))


def _default_tier() -> str:
    return str(_config()["defaultTier"])


# Simple per-user token bucket (in-process). Protects LLM spend on "generate".
_rate_limiter = RateLimiter(
    label="list",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class ListRateLimitError(StudioRateLimitError):
    """User exceeded the short-window list generation quota."""


class ListGenerationError(StudioGenerationError):
    """Model output could not be parsed into a valid shopping list."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise ListRateLimitError(str(exc)) from exc


def _theme_hint(req: ListRecallRequest) -> str:
    custom = (req.theme or "").strip()
    if custom:
        return custom
    return section(_config(), "categoryHints")[req.category]


def _scope(req: ListRecallRequest, user_id: str) -> VarietyScope:
    """Same theme + decoy difficulty = same risk of repeating a previous list."""
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(_theme_hint(req), req.distractor_difficulty),
        seed=req.seed,
    )


def _build_prompt(req: ListRecallRequest) -> str:
    hint = _theme_hint(req)
    tiers = section(_config(), "distractorTiers")[req.distractor_difficulty]
    language_line = locale_line(section(_config(), "locale"), req.locale)
    item_rules = section(_config(), "itemRules")
    item_rule = item_rules["themed" if (req.theme or "").strip() else "grocery"]
    return f"""You generate items for a memory recognition exercise in a printable workbook.

Produce a shopping list and decoys. Seed for variety: {req.seed}.

Rules:
- Theme: {hint}.
- Exactly {req.list_length} REAL list items (targets).
- Exactly {req.distractor_count} DECOY items that were NOT on the list.
- Decoys: {tiers}.
- {item_rule}
- No duplicates. A decoy must never equal a target.
- Targets and decoys must be indistinguishable in style and length — if decoys
  are obviously wordier or fancier, the reader spots them without remembering.
{language_line}

Write the list items in "targets".
Write the decoys in "distractors", each an object with "label" and a "tier" of
"plain" (unrelated), "category" (same category as some target), or "qualitative"
(a variant of a specific target).
"""


def _normalize_distractor(raw: Any) -> dict[str, str]:
    if isinstance(raw, str):
        label = raw.strip()
        if not label:
            raise ValueError("malformed distractor")
        return {"label": label, "tier": _default_tier()}
    if not isinstance(raw, dict):
        raise ValueError("malformed distractor")
    label = str(raw.get("label", "")).strip()
    if not label:
        raise ValueError("malformed distractor")
    tier = str(raw.get("tier", _default_tier())).strip().lower()
    if tier not in _valid_tiers():
        tier = _default_tier()
    return {"label": label, "tier": tier}


def _coerce_distractors(data: dict[str, Any]) -> list[dict[str, str]]:
    """Accept object list, string list, or a separate mapping array from the model."""
    mapping = data.get("mapping")
    if isinstance(mapping, list) and mapping and all(isinstance(d, dict) for d in mapping):
        return [_normalize_distractor(d) for d in mapping]

    distractors = data.get("distractors")
    if not isinstance(distractors, list):
        raise ValueError("missing distractors")
    return [_normalize_distractor(d) for d in distractors]


def _validate_shape(data: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(data.get("targets"), list) or not data["targets"]:
        raise ValueError("missing targets")
    data["distractors"] = _coerce_distractors(data)
    return data


def _parse_list_json(raw: str) -> dict[str, Any]:
    return _validate_shape(parse_json_object(raw))


async def _call_gemini(prompt: str) -> str:
    """Seam for tests; keeps the shared client call in one place."""
    return await call_gemini_json(
        prompt=prompt,
        max_output_tokens=2048,
        response_schema=ListModelOutput,
        label="list",
    )


async def generate_list_recall(
    req: ListRecallRequest, user_id: str
) -> ListRecallResponse:
    _check_rate_limit(user_id)
    scope = _scope(req, user_id)
    prompt = with_variety(_build_prompt(req), scope, client_avoid=req.avoid)
    started = time.perf_counter()

    try:
        raw = await _call_gemini(prompt)
        data = _parse_list_json(raw)
    except ListGenerationError:
        raise
    except Exception as exc:
        logger.warning(
            "studio_list_generation_failed error=%s model=%s user_id=%s",
            str(exc),
            settings.STUDIO_GEMINI_MODEL,
            user_id,
        )
        raise ListGenerationError("Model did not return valid list JSON") from exc

    targets = [str(t).strip() for t in data["targets"] if str(t).strip()]
    targets = targets[: req.list_length]
    if len(targets) < 5:
        raise ListGenerationError("Model returned too few targets")

    target_set = {t.lower() for t in targets}
    options: list[ListItem] = [ListItem(label=t, isTarget=True) for t in targets]

    for d in data["distractors"]:
        if len(options) - len(targets) >= req.distractor_count:
            break
        label = str(d["label"]).strip()
        if not label or label.lower() in target_set:
            continue
        target_set.add(label.lower())
        options.append(
            ListItem(label=label, isTarget=False, tier=d.get("tier", "plain"))
        )

    rng = random.Random(req.seed)
    rng.shuffle(options)

    # Targets are what the reader memorizes — repeating those is what reads as
    # a duplicate page. Decoys may recur without anyone noticing.
    remember(scope, targets)

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "studio_list_generated",
        extra={
            "user_id": user_id,
            "model": settings.STUDIO_GEMINI_MODEL,
            "latency_ms": elapsed_ms,
            "target_count": len(targets),
            "option_count": len(options),
        },
    )

    return ListRecallResponse(targets=targets, options=options)


# Test helpers (pure, no network)
def parse_list_json_for_tests(raw: str) -> dict[str, Any]:
    return _parse_list_json(raw)


def validate_list_shape_for_tests(data: dict[str, Any]) -> dict[str, Any]:
    return _validate_shape(data)
