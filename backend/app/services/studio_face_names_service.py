"""Generate diverse, gender-tagged names for Face–Name Association via Gemini."""

from __future__ import annotations

import logging
import re
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_face_names import (
    FaceNameItem,
    FaceNameRequest,
    FaceNameResponse,
    FaceNamesModelOutput,
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

GAME = "face-names"


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


@lru_cache(maxsize=1)
def _valid_genders() -> frozenset[str]:
    return frozenset(string_list(_config(), "validGenders"))


@lru_cache(maxsize=1)
def _name_token() -> re.Pattern[str]:
    tail = int_value(_limits(), "maxNameLength") - 1
    return re.compile(rf"^[A-Za-z][A-Za-z'-]{{0,{tail}}}$")


# Ask for spares so duplicate/invalid rows can be dropped and still fill the sheet.
_rate_limiter = RateLimiter(
    label="face-name",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class FaceNamesRateLimitError(StudioRateLimitError):
    """User exceeded the short-window face-names generation quota."""


class FaceNamesGenerationError(StudioGenerationError):
    """Model output could not be parsed into a valid face-names payload."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise FaceNamesRateLimitError(str(exc)) from exc


def _scope(req: FaceNameRequest, user_id: str) -> VarietyScope:
    """Only the name style changes what the model draws from."""
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.name_style),
        seed=req.seed,
    )


def _build_prompt(req: FaceNameRequest) -> str:
    style_key = "full" if req.name_style == "full" else "first"
    style_line = section(_config(), "styleLines")[style_key]
    last_hint = section(_config(), "lastFieldHints")[style_key]
    language_line = locale_line(section(_config(), "locale"), req.locale)
    want = req.count + int_value(_limits(), "overRequest")
    return f"""Generate {want} distinct first names for a face–name memory worksheet.
Seed for variety (must change the name set): {req.seed}.

Rules:
- Wholesome, printable, suitable for an adult brain-training workbook.
- No titles (Mr/Ms/Dr), no initials-only, no emoji, no punctuation except hyphen/apostrophe in names.
- Unique first names within this list (case-insensitive) — never repeat a first name.
- Names must be easy to tell apart: no two that rhyme or share the first three
  letters, or the memory task becomes a spelling test.
- Prefer less-common given names so different seeds produce clearly different sets.
- Gender mix approximately 40% male, 40% female, 20% neutral (unisex).
- Tag gender from the name itself only (how the name is commonly used).
  Do not invent gender from facial hair or appearance — faces are generated separately.
- {style_line}
{language_line}

Write the names in "names": "first", "gender" (male, female or neutral), and
"last" ({last_hint}).
"""


def _normalize_name_token(raw: str) -> str:
    token = raw.strip()
    if not token or not _name_token().match(token):
        raise ValueError(f"invalid name token: {raw!r}")
    return token[0].upper() + token[1:]


def _normalize_gender(raw: Any) -> str:
    gender = str(raw or "").strip().lower()
    if gender not in _valid_genders():
        raise ValueError(f"invalid gender: {raw!r}")
    return gender


def _parse_names_json(raw: str, *, count: int, name_style: str) -> list[FaceNameItem]:
    data = parse_json_object(raw)
    rows = data.get("names")
    if not isinstance(rows, list) or not rows:
        raise ValueError("missing names")

    seen: set[str] = set()
    out: list[FaceNameItem] = []
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("malformed name row")
        first = _normalize_name_token(str(row.get("first", "")))
        key = first.casefold()
        if key in seen:
            continue
        seen.add(key)
        gender = _normalize_gender(row.get("gender"))
        last: str | None = None
        if name_style == "full":
            last_raw = row.get("last")
            if last_raw is None or not str(last_raw).strip():
                raise ValueError("missing last name")
            last = _normalize_name_token(str(last_raw))
        out.append(
            FaceNameItem(
                first=first,
                last=last,
                gender=gender,  # validated against male|female|neutral
            )
        )
        if len(out) >= count:
            break

    if len(out) < count:
        raise ValueError(f"expected {count} unique names, got {len(out)}")
    return out


async def _call_gemini(prompt: str) -> str:
    """Seam for tests; keeps the shared client call in one place."""
    return await call_gemini_json(
        prompt=prompt,
        # High temperature: the only job is variety across seeds.
        temperature=0.95,
        max_output_tokens=2048,
        response_schema=FaceNamesModelOutput,
        label="face_names",
    )


async def generate_face_names(req: FaceNameRequest, user_id: str) -> FaceNameResponse:
    _check_rate_limit(user_id)
    scope = _scope(req, user_id)
    prompt = with_variety(_build_prompt(req), scope, client_avoid=req.avoid)
    started = time.perf_counter()

    try:
        raw = await _call_gemini(prompt)
        names = _parse_names_json(raw, count=req.count, name_style=req.name_style)
    except FaceNamesGenerationError:
        raise
    except Exception as exc:
        logger.warning(
            "studio_face_names_generation_failed error=%s model=%s user_id=%s",
            str(exc),
            settings.STUDIO_GEMINI_MODEL,
            user_id,
        )
        raise FaceNamesGenerationError(
            "Model did not return valid face-name JSON"
        ) from exc

    remember(scope, (name.first for name in names))

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "studio_face_names_generated",
        extra={
            "user_id": user_id,
            "model": settings.STUDIO_GEMINI_MODEL,
            "latency_ms": elapsed_ms,
            "count": len(names),
            "name_style": req.name_style,
        },
    )
    return FaceNameResponse(names=names)


# Test helpers (pure, no network)
def parse_names_json_for_tests(
    raw: str, *, count: int, name_style: str
) -> list[FaceNameItem]:
    return _parse_names_json(raw, count=count, name_style=name_style)
