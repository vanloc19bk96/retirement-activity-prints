"""Generate Put-It-In-Order sequences via Gemini with curated top-up."""

from __future__ import annotations

import json
import logging
import random
import re
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_sequence import (
    SequenceItem,
    SequenceModelOutput,
    SequenceRequest,
    SequenceResponse,
    SequenceSet,
)
from app.services.studio_gemini import (
    RateLimiter,
    StudioGenerationError,
    StudioRateLimitError,
    call_gemini_json,
    parse_json_object,
)
from app.services.prompt_data import (
    DATA_ROOT,
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

GAME = "sequences"

_CURATED_PATH = DATA_ROOT / GAME / "fallback.json"


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


_rate_limiter = RateLimiter(
    label="sequence",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class SequenceRateLimitError(StudioRateLimitError):
    """User exceeded the short-window sequence generation quota."""


class SequenceGenerationError(StudioGenerationError):
    """Model output could not be turned into valid sequences."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise SequenceRateLimitError(str(exc)) from exc


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().casefold()


def _scope(req: SequenceRequest, user_id: str) -> VarietyScope:
    """Type + theme decide which everyday procedures the model reaches for."""
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.sequence_type, req.theme or ""),
        seed=req.seed,
    )


def _build_prompt(req: SequenceRequest) -> str:
    theme = (req.theme or "").strip()
    theme_line = str(_config()["themeLine"]).format(theme=theme) if theme else ""
    language_line = locale_line(section(_config(), "locale"), req.locale)
    return f"""Generate {req.sequence_count} sequences for a large-print memory exercise for older adults.
Type: {req.sequence_type}. Each sequence has exactly {req.item_count} items.
Seed for variety: {req.seed}.

For "arbitrary": {req.item_count} unrelated, concrete, everyday nouns. There must be NO
logical or alphabetical relationship between them — the order is arbitrary by design.
Omit "title" (or set null) — do not invent a category label like "Unrelated Objects".

For "steps"/"everyday": a familiar everyday procedure. CRITICAL: the order must be
UNAMBIGUOUS — each step must physically require the previous one. If two steps could
reasonably be swapped, do not use that procedure.

For "story": a short sequence of narrative events with a clear temporal order.

All types:
- Each item is 1-5 words. Short enough to fit a printed line comfortably.
- Write items in the CORRECT order; the sheet shuffles them for the solver.
- Wholesome, positive, generic. No brands, no proper nouns, nothing medical or sad.
- All {req.sequence_count} sequences must be DISTINCT.
{theme_line}
{language_line}

Write the sequences in "sequences", each with "title" and "items" of "text".
"""


def _validate(sequences: list[Any], req: SequenceRequest) -> list[SequenceSet]:
    clean: list[SequenceSet] = []
    seen: set[str] = set()
    for raw in sequences:
        if not isinstance(raw, dict):
            continue
        items_raw = raw.get("items", [])
        if not isinstance(items_raw, list):
            continue
        texts = [str(i.get("text", "") if isinstance(i, dict) else i).strip() for i in items_raw]
        if len(texts) != req.item_count:
            continue
        if any(not t or len(t.split()) > int_value(_limits(), "maxItemWords") for t in texts):
            continue
        if len({_norm(t) for t in texts}) != len(texts):
            continue
        key = _norm(" | ".join(texts))
        if key in seen:
            continue
        seen.add(key)
        title = str(raw.get("title") or "").strip() or None
        # Arbitrary lists are a pure memory test — no category banner on the sheet.
        if req.sequence_type == "arbitrary":
            title = None
        clean.append(
            SequenceSet(
                title=title,
                items=[SequenceItem(text=t) for t in texts],
            )
        )
    return clean


def _parse_sequence_json(raw: str, req: SequenceRequest) -> list[SequenceSet]:
    data = parse_json_object(raw)
    if not isinstance(data.get("sequences"), list):
        raise ValueError("Model did not return sequences")
    return _validate(data["sequences"], req)


def _load_curated() -> list[dict[str, Any]]:
    with _CURATED_PATH.open(encoding="utf-8") as fh:
        data = json.load(fh)
    return data if isinstance(data, list) else []


def _top_up_from_bank(
    clean: list[SequenceSet], req: SequenceRequest, seed: int
) -> list[SequenceSet]:
    if len(clean) >= req.sequence_count:
        return clean[: req.sequence_count]

    bank = _load_curated()
    matches = [
        e
        for e in bank
        if e.get("sequenceType") == req.sequence_type
        and isinstance(e.get("items"), list)
        and len(e["items"]) >= req.item_count
    ]
    pool = matches or [
        e
        for e in bank
        if isinstance(e.get("items"), list) and len(e["items"]) >= req.item_count
    ]
    if not pool:
        return clean

    rng = random.Random(seed)
    shuffled = pool[:]
    rng.shuffle(shuffled)
    seen = {_norm(" | ".join(i.text for i in s.items)) for s in clean}
    out = list(clean)

    for entry in shuffled:
        if len(out) >= req.sequence_count:
            break
        texts = [str(i.get("text", "")).strip() for i in entry["items"][: req.item_count]]
        if len(texts) != req.item_count:
            continue
        key = _norm(" | ".join(texts))
        if key in seen:
            continue
        seen.add(key)
        title = str(entry.get("title") or "").strip() or None
        out.append(
            SequenceSet(title=title, items=[SequenceItem(text=t) for t in texts])
        )
    return out


def _model_id() -> str:
    return settings.STUDIO_SEQUENCE_MODEL or settings.STUDIO_GEMINI_MODEL


async def _call_gemini(prompt: str) -> str:
    """Seam for tests; keeps the shared client call in one place."""
    return await call_gemini_json(
        prompt=prompt,
        # Up to 40 sequences x 8 items of up to 5 words each.
        max_output_tokens=8192,
        response_schema=SequenceModelOutput,
        model=_model_id(),
        label="sequence",
    )


async def generate_sequences(
    req: SequenceRequest, user_id: str
) -> SequenceResponse:
    _check_rate_limit(user_id)
    scope = _scope(req, user_id)
    prompt = with_variety(_build_prompt(req), scope, client_avoid=req.avoid)
    started = time.perf_counter()
    clean: list[SequenceSet] = []

    try:
        raw = await _call_gemini(prompt)
        clean = _parse_sequence_json(raw, req)
    except SequenceGenerationError:
        raise
    except Exception as exc:
        logger.warning(
            "studio_sequence_generation_failed: %s",
            exc,
            extra={
                "user_id": user_id,
                "model": _model_id(),
                "error": str(exc),
            },
        )
        # Fall through to curated top-up rather than hard-fail when possible.

    before = len(clean)
    clean = _top_up_from_bank(clean, req, req.seed)
    dropped = max(0, req.sequence_count - before)

    if not clean:
        raise SequenceGenerationError("Could not produce valid sequences")

    # Arbitrary lists carry no title — their first item names the set well enough.
    remember(
        scope,
        (s.title or (s.items[0].text if s.items else "") for s in clean),
    )

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "studio_sequence_generated",
        extra={
            "user_id": user_id,
            "model": _model_id(),
            "latency_ms": elapsed_ms,
            "sequence_count": len(clean),
            "validation_drop": dropped,
        },
    )
    return SequenceResponse(sequences=clean)


# Test helpers (pure, no network)
def parse_sequence_json_for_tests(raw: str, req: SequenceRequest) -> list[SequenceSet]:
    return _parse_sequence_json(raw, req)


def validate_sequences_for_tests(
    sequences: list[Any], req: SequenceRequest
) -> list[SequenceSet]:
    return _validate(sequences, req)


def top_up_from_bank_for_tests(
    clean: list[SequenceSet], req: SequenceRequest, seed: int
) -> list[SequenceSet]:
    return _top_up_from_bank(clean, req, seed)
