"""Load AI runtime settings from Supabase."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

from app.core.supabase import create_supabase_admin_client

logger = logging.getLogger(__name__)

PROJECT_SCHEMA_NAME = "retirement_activity_prints"
AI_RUNTIME_SETTINGS_TABLE = "ai_runtime_settings"
AI_RUNTIME_SETTINGS_ROW_ID = "default"
_CACHE_TTL_SECONDS = 30.0

DEFAULT_GRSAI_BASE_URL = "https://grsaiapi.com"
DEFAULT_GRSAI_PRIMARY_ENDPOINT = "completions"
DEFAULT_GRSAI_NANO_BANANA_MODEL = "nano-banana"
DEFAULT_GRSAI_COMPLETIONS_MODEL = "gpt-image-2"

_cached_settings: AiRuntimeSettings | None = None
_cached_at_monotonic: float = 0.0


@dataclass(frozen=True)
class AiRuntimeSettings:
    grsai_api_key: str
    grsai_base_url: str
    grsai_primary_endpoint: str
    grsai_nano_banana_model: str
    grsai_completions_model: str


def _db() -> Any:
    return create_supabase_admin_client().schema(PROJECT_SCHEMA_NAME)


def _pick_string(*, db_value: object, default: str) -> str:
    if isinstance(db_value, str):
        cleaned = db_value.strip()
        if cleaned:
            return cleaned
    return default


def _normalize_primary_endpoint(raw_endpoint: str) -> str:
    normalized = (raw_endpoint or DEFAULT_GRSAI_PRIMARY_ENDPOINT).strip().lower()
    if normalized in ("nano-banana", "banana"):
        return "nano-banana"
    if normalized in ("completions", "gpt-image"):
        return "completions"
    return DEFAULT_GRSAI_PRIMARY_ENDPOINT


def _fetch_settings_row() -> dict[str, Any] | None:
    try:
        response = (
            _db()
            .table(AI_RUNTIME_SETTINGS_TABLE)
            .select("*")
            .eq("id", AI_RUNTIME_SETTINGS_ROW_ID)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.warning("Failed to load ai_runtime_settings from Supabase: %s", exc)
        return None

    rows = list(response.data or [])
    if not rows:
        return None
    row = rows[0]
    return row if isinstance(row, dict) else None


def _build_settings_from_row(row: dict[str, Any] | None) -> AiRuntimeSettings:
    db = row or {}
    primary_endpoint = _normalize_primary_endpoint(
        _pick_string(
            db_value=db.get("grsai_primary_endpoint") or db.get("grsai_image_mode"),
            default=DEFAULT_GRSAI_PRIMARY_ENDPOINT,
        )
    )
    return AiRuntimeSettings(
        grsai_api_key=_pick_string(db_value=db.get("grsai_api_key"), default=""),
        grsai_base_url=_pick_string(
            db_value=db.get("grsai_base_url"),
            default=DEFAULT_GRSAI_BASE_URL,
        ),
        grsai_primary_endpoint=primary_endpoint,
        grsai_nano_banana_model=_pick_string(
            db_value=db.get("grsai_nano_banana_model") or db.get("grsai_model"),
            default=DEFAULT_GRSAI_NANO_BANANA_MODEL,
        ),
        grsai_completions_model=_pick_string(
            db_value=db.get("grsai_completions_model") or db.get("grsai_completions_image_model"),
            default=DEFAULT_GRSAI_COMPLETIONS_MODEL,
        ),
    )


def get_ai_runtime_settings(*, force_refresh: bool = False) -> AiRuntimeSettings:
    """Return AI settings from Supabase retirement_activity_prints.ai_runtime_settings."""
    global _cached_settings, _cached_at_monotonic

    now = time.monotonic()
    if (
        not force_refresh
        and _cached_settings is not None
        and (now - _cached_at_monotonic) < _CACHE_TTL_SECONDS
    ):
        return _cached_settings

    row = _fetch_settings_row()
    resolved = _build_settings_from_row(row)
    _cached_settings = resolved
    _cached_at_monotonic = now
    return resolved
