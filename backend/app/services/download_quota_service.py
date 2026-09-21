"""Track and enforce per-user monthly canvas download limits."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException, status

from app.core.plan_download_limits import resolve_monthly_download_limit
from app.core.supabase import create_supabase_admin_client
from app.services.projects_service import PROJECT_SCHEMA_NAME

logger = logging.getLogger(__name__)

USERS_TABLE_NAME = "users"


class DownloadQuotaExceededError(Exception):
    """Raised when the user has no remaining monthly downloads."""


def _parse_iso_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _should_reset_monthly_quota(last_reset: datetime, now: datetime) -> bool:
    return last_reset.year != now.year or last_reset.month != now.month


def _build_quota_status(*, used: int, limit: Optional[int]) -> dict[str, Any]:
    is_unlimited = limit is None
    remaining = None if is_unlimited else max(0, limit - used)
    can_download = is_unlimited or (remaining is not None and remaining > 0)
    return {
        "monthly_downloads_used": used,
        "monthly_download_limit": limit,
        "monthly_downloads_remaining": remaining,
        "is_unlimited": is_unlimited,
        "can_download": can_download,
    }


def _get_users_table():
    return create_supabase_admin_client().schema(PROJECT_SCHEMA_NAME).table(USERS_TABLE_NAME)


def _get_user_row(user_id: str) -> dict[str, Any]:
    response = _get_users_table().select("*").eq("id", user_id).execute()
    rows = response.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    row = rows[0]
    if not isinstance(row, dict):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Invalid user record returned from database",
        )
    return row


def _ensure_monthly_quota_reset(row: dict[str, Any], *, now: Optional[datetime] = None) -> dict[str, Any]:
    current_now = now or datetime.now(timezone.utc)
    last_reset = _parse_iso_datetime(row.get("last_download_reset_at")) or current_now
    used = int(row.get("monthly_downloads_used") or 0)

    if not _should_reset_monthly_quota(last_reset, current_now):
        return row

    user_id = row.get("id")
    if not user_id:
        return row

    update_payload = {
        "monthly_downloads_used": 0,
        "last_download_reset_at": current_now.isoformat(),
    }
    response = _get_users_table().update(update_payload).eq("id", user_id).execute()
    updated_rows = response.data or []
    if updated_rows and isinstance(updated_rows[0], dict):
        logger.info("Reset monthly download quota for user %s", user_id)
        return updated_rows[0]

    return {**row, "monthly_downloads_used": 0, "last_download_reset_at": current_now.isoformat()}


def get_download_quota_status(*, user_id: str) -> dict[str, Any]:
    row = _ensure_monthly_quota_reset(_get_user_row(user_id))
    used = int(row.get("monthly_downloads_used") or 0)
    limit = resolve_monthly_download_limit(row.get("plan"))
    return _build_quota_status(used=used, limit=limit)


def consume_download_quota(*, user_id: str) -> dict[str, Any]:
    row = _ensure_monthly_quota_reset(_get_user_row(user_id))
    used = int(row.get("monthly_downloads_used") or 0)
    limit = resolve_monthly_download_limit(row.get("plan"))

    if limit is not None and used >= limit:
        raise DownloadQuotaExceededError(
            f"Monthly download limit reached ({used}/{limit}). Upgrade your plan for more downloads."
        )

    new_used = used + 1
    response = (
        _get_users_table()
        .update({"monthly_downloads_used": new_used})
        .eq("id", user_id)
        .execute()
    )
    updated_rows = response.data or []
    if updated_rows and isinstance(updated_rows[0], dict):
        row = updated_rows[0]
        used = int(row.get("monthly_downloads_used") or new_used)

    return _build_quota_status(used=used, limit=limit)
