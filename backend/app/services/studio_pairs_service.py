"""Generate Perfect Pairs word sets via Gemini with curated top-up."""

from __future__ import annotations

import json
import logging
import random
import re
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_pairs import (
    PairRequest,
    PairResponse,
    PairSet,
    PairsModelOutput,
    WordPair,
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

GAME = "pairs"

_CURATED_PATH = DATA_ROOT / GAME / "fallback.json"


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


@lru_cache(maxsize=1)
def _collocation_list() -> tuple[tuple[str, str], ...]:
    """Pairs that make an "arbitrary" pairing not arbitrary (§3.2)."""
    raw = _config()["collocations"]
    return tuple(
        (str(pair[0]).lower(), str(pair[1]).lower()) for pair in raw
    )


@lru_cache(maxsize=1)
def _collocations() -> frozenset[tuple[str, str]]:
    return frozenset(_norm_pair(left, right) for left, right in _collocation_list())


_rate_limiter = RateLimiter(
    label="pair",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class PairRateLimitError(StudioRateLimitError):
    """User exceeded the short-window pair generation quota."""


class PairGenerationError(StudioGenerationError):
    """Model output could not be turned into valid pair sets."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise PairRateLimitError(str(exc)) from exc


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().casefold()


def _norm_pair(left: str, right: str) -> tuple[str, str]:
    a, b = _norm(left), _norm(right)
    return (a, b) if a <= b else (b, a)


def _scope(req: PairRequest, user_id: str) -> VarietyScope:
    """Pair type is the only thing steering which words the model picks."""
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.pair_type),
        seed=req.seed,
    )


def _build_prompt(req: PairRequest) -> str:
    language_line = locale_line(section(_config(), "locale"), req.locale)
    prompt_min_letters = int_value(_limits(), "promptMinLetters")
    prompt_max_letters = int_value(_limits(), "promptMaxLetters")
    # Show a few real collocations as the WRONG shape, straight from the blocklist.
    wrong_examples = ", ".join(
        f'"{left}/{right}"'
        for left, right in _collocation_list()[
            : int_value(_limits(), "promptExampleCount")
        ]
    )
    return f"""Generate {req.exercise_count} sets of {req.pair_count} word pairs for a large-print memory
exercise for older adults. Type: {req.pair_type}.
Seed for variety: {req.seed}.

For "arbitrary": pair two CONCRETE, everyday nouns that have NO existing connection.
  - Both words must be things you can picture (lantern, biscuit, kettle, feather).
  - CRITICAL: avoid any common phrase or natural association. {wrong_examples}
    are WRONG for this type — the pairing must be new.
  - Also avoid pairs that rhyme or share a first letter; those give a free hint.
For "related": pair two words with a clear, familiar connection.
For "word-picture": same as arbitrary — concrete nouns only (images are attached later).

All types:
- Each word is ONE word, {prompt_min_letters}-{prompt_max_letters} letters, common and easy to read.
- Wholesome and generic. No brands, no proper nouns, nothing medical or sad.
- No word may appear twice within a set, and no word may appear in two sets.
- All sets must be DISTINCT.
{language_line}

Write the sets in "sets", each with "pairs" of "left" and "right".
"""


def _validate(sets: list[Any], req: PairRequest) -> list[PairSet]:
    clean: list[PairSet] = []
    seen: set[str] = set()
    for raw in sets:
        if not isinstance(raw, dict):
            continue
        pairs_raw = raw.get("pairs", [])
        if not isinstance(pairs_raw, list):
            continue
        pairs = [
            (
                str(p.get("left", "") if isinstance(p, dict) else "").strip().lower(),
                str(p.get("right", "") if isinstance(p, dict) else "").strip().lower(),
            )
            for p in pairs_raw
        ]
        if len(pairs) != req.pair_count:
            continue
        if any(not left or not right for left, right in pairs):
            continue
        if any(
            len(w) > int_value(_limits(), "maxWordLen")
            or " " in w
            or len(w) < int_value(_limits(), "minWordLen")
            for left, right in pairs
            for w in (left, right)
        ):
            continue
        words = [w for pair in pairs for w in pair]
        if len(set(words)) != len(words):
            continue
        if req.pair_type == "arbitrary":
            if any(_norm_pair(left, right) in _collocations() for left, right in pairs):
                continue
        key = _norm(" | ".join(f"{left}-{right}" for left, right in pairs))
        if key in seen:
            continue
        seen.add(key)
        clean.append(
            PairSet(pairs=[WordPair(left=left, right=right) for left, right in pairs])
        )
    return clean


def _parse_pair_json(raw: str, req: PairRequest) -> list[PairSet]:
    data = parse_json_object(raw)
    if not isinstance(data.get("sets"), list):
        raise ValueError("Model did not return sets")
    return _validate(data["sets"], req)


def _load_curated() -> list[dict[str, Any]]:
    with _CURATED_PATH.open(encoding="utf-8") as fh:
        data = json.load(fh)
    return data if isinstance(data, list) else []


def _bank_type(req: PairRequest) -> str:
    if req.pair_type == "related":
        return "related"
    return "arbitrary"


def _top_up_from_bank(
    clean: list[PairSet], req: PairRequest, seed: int
) -> list[PairSet]:
    if len(clean) >= req.exercise_count:
        return clean[: req.exercise_count]

    bank = _load_curated()
    wanted_type = _bank_type(req)
    matches = [
        e
        for e in bank
        if e.get("pairType") == wanted_type
        and isinstance(e.get("pairs"), list)
        and len(e["pairs"]) >= req.pair_count
    ]
    pool = matches or [
        e
        for e in bank
        if isinstance(e.get("pairs"), list) and len(e["pairs"]) >= req.pair_count
    ]
    if not pool:
        return clean

    rng = random.Random(seed)
    shuffled = pool[:]
    rng.shuffle(shuffled)
    seen = {
        _norm(" | ".join(f"{p.left}-{p.right}" for p in s.pairs)) for s in clean
    }
    out = list(clean)

    for entry in shuffled:
        if len(out) >= req.exercise_count:
            break
        raw_pairs = entry["pairs"][: req.pair_count]
        pairs = [
            (str(p.get("left", "")).strip().lower(), str(p.get("right", "")).strip().lower())
            for p in raw_pairs
        ]
        if len(pairs) != req.pair_count:
            continue
        if any(not left or not right for left, right in pairs):
            continue
        words = [w for pair in pairs for w in pair]
        if len(set(words)) != len(words):
            continue
        key = _norm(" | ".join(f"{left}-{right}" for left, right in pairs))
        if key in seen:
            continue
        seen.add(key)
        out.append(
            PairSet(pairs=[WordPair(left=left, right=right) for left, right in pairs])
        )
    return out


def _attach_outline_images(sets: list[PairSet], seed: int) -> list[PairSet]:
    """Pair each word-set with outline images on the right half (§3.3)."""
    from app.services.studio_pictures_service import (
        PictureLibraryError,
        sample_outline_images,
    )

    total = sum(len(s.pairs) for s in sets)
    if total <= 0:
        return sets

    try:
        rows = sample_outline_images(limit=total, seed=seed)
    except PictureLibraryError:
        logger.warning("studio_pairs_outline_sample_failed")
        return sets

    if len(rows) < total:
        logger.warning(
            "studio_pairs_outline_shortfall",
            extra={"needed": total, "got": len(rows)},
        )
        return sets

    idx = 0
    out: list[PairSet] = []
    for pair_set in sets:
        next_pairs: list[WordPair] = []
        for pair in pair_set.pairs:
            row = rows[idx]
            idx += 1
            url = str(row.get("public_url") or "").strip()
            title = str(row.get("title") or "").strip().lower()
            label = (title.split()[0] if title else pair.right) or pair.right
            next_pairs.append(
                WordPair(
                    left=pair.left,
                    right=label,
                    rightImageUrl=url or None,
                )
            )
        out.append(PairSet(pairs=next_pairs))
    return out


def _model_id() -> str:
    return settings.STUDIO_PAIRS_MODEL or settings.STUDIO_GEMINI_MODEL


async def _call_gemini(prompt: str) -> str:
    """Seam for tests; keeps the shared client call in one place."""
    return await call_gemini_json(
        prompt=prompt,
        # Up to 40 sets x 10 pairs of two short words each.
        max_output_tokens=8192,
        response_schema=PairsModelOutput,
        model=_model_id(),
        label="pairs",
    )


async def generate_pairs(req: PairRequest, user_id: str) -> PairResponse:
    _check_rate_limit(user_id)
    # word-picture uses arbitrary word generation, then attaches outline images.
    gen_req = req
    if req.pair_type == "word-picture":
        gen_req = req.model_copy(update={"pair_type": "arbitrary"})

    scope = _scope(gen_req, user_id)
    prompt = with_variety(_build_prompt(gen_req), scope, client_avoid=req.avoid)
    started = time.perf_counter()
    clean: list[PairSet] = []

    try:
        raw = await _call_gemini(prompt)
        clean = _parse_pair_json(raw, gen_req)
    except PairGenerationError:
        raise
    except Exception as exc:
        logger.warning(
            "studio_pairs_generation_failed",
            extra={
                "user_id": user_id,
                "model": _model_id(),
                "error": str(exc),
            },
        )

    before = len(clean)
    clean = _top_up_from_bank(clean, gen_req, req.seed)
    dropped = max(0, req.exercise_count - before)

    if not clean:
        raise PairGenerationError("Could not produce valid pair sets")

    if req.pair_type == "word-picture":
        clean = _attach_outline_images(clean, req.seed)

    remember(
        scope,
        (f"{pair.left} / {pair.right}" for group in clean for pair in group.pairs),
    )

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "studio_pairs_generated",
        extra={
            "user_id": user_id,
            "model": _model_id(),
            "latency_ms": elapsed_ms,
            "set_count": len(clean),
            "validation_drop": dropped,
            "pair_type": req.pair_type,
        },
    )
    return PairResponse(sets=clean)


# Test helpers (pure, no network)
def parse_pair_json_for_tests(raw: str, req: PairRequest) -> list[PairSet]:
    return _parse_pair_json(raw, req)


def validate_pairs_for_tests(sets: list[Any], req: PairRequest) -> list[PairSet]:
    return _validate(sets, req)


def top_up_from_bank_for_tests(
    clean: list[PairSet], req: PairRequest, seed: int
) -> list[PairSet]:
    return _top_up_from_bank(clean, req, seed)
