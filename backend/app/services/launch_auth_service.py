"""Verify/refresh launch token via Creator Hub.

The frontend opens the app from the Hub with a launch token, then calls:
- POST /api/auth/verify-launch-token
- POST /api/auth/refresh-launch-token
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

import requests
from fastapi import HTTPException, Request, status

from app.core.config import settings
from app.core.email import fetch_user_row_by_email
from app.core.supabase import create_supabase_admin_client
from app.services.download_quota_service import get_download_quota_status
from app.services.projects_service import PROJECT_SCHEMA_NAME
from app.schemas.auth import UserResponse

logger = logging.getLogger(__name__)

HUB_VERIFY_PATH = "/launch/verify"
HUB_REFRESH_PATH = "/launch/refresh"
USERS_TABLE_NAME = "users"


def _get_hub_base_url() -> str:
    base = (getattr(settings, "HUB_API_URL", None) or "").strip().rstrip("/")
    if not base:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Launch authentication is not configured",
        )
    return base


def _parse_datetime_as_iso(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


# PostgREST encodes a bytea column as this prefix followed by hex.
BYTEA_HEX_PREFIX = "\\x"


def _get_user_row_by_email(*, email: str) -> dict[str, Any]:
    supabase = create_supabase_admin_client().schema(PROJECT_SCHEMA_NAME)
    query = supabase.table(USERS_TABLE_NAME).select("*")
    row = fetch_user_row_by_email(query, email)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found. Please complete your purchase first, then open this app from the hub.",
        )
    return row


def verify_launch_token_via_hub(token: str) -> dict[str, str]:
    base = _get_hub_base_url()
    url = f"{base}{HUB_VERIFY_PATH}"

    headers = {"Authorization": f"Bearer {token.strip()}"}
    try:
        resp = requests.get(url, headers=headers, timeout=10)
    except requests.RequestException as exc:
        logger.warning("Hub verify request failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not verify launch token with hub",
        ) from exc

    if resp.status_code == 401:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired launch token",
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Hub could not verify launch token",
        )

    try:
        data = resp.json()
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invalid response from hub",
        ) from exc

    hub_user_id = data.get("hub_user_id")
    email = data.get("email")
    if not hub_user_id or not email:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invalid response from hub",
        )
    return {"hub_user_id": str(hub_user_id), "email": str(email)}


def refresh_launch_token_via_hub(token: str) -> dict[str, str]:
    base = _get_hub_base_url()
    url = f"{base}{HUB_REFRESH_PATH}"

    headers = {"Authorization": f"Bearer {token.strip()}"}
    try:
        resp = requests.post(url, headers=headers, timeout=10)
    except requests.RequestException as exc:
        logger.warning("Hub refresh request failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not refresh launch token with hub",
        ) from exc

    if resp.status_code == 401:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired launch token; cannot refresh",
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Hub could not refresh launch token",
        )

    try:
        data = resp.json()
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invalid response from hub",
        ) from exc

    new_token = data.get("token")
    hub_user_id = data.get("hub_user_id")
    email = data.get("email")
    if not new_token or not hub_user_id or not email:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invalid response from hub",
        )
    return {"token": str(new_token), "hub_user_id": str(hub_user_id), "email": str(email)}


def _normalize_puzzle_salt(raw: Any) -> Optional[str]:
    """
    Hex-encode the account's puzzle salt for the client.

    PostgREST returns a `bytea` as a backslash-x prefixed hex string, so the
    common path is a prefix strip. A missing salt is not an error: accounts
    created before the migration have none, and the client falls back to
    deriving one from the owner key, which still separates accounts.
    """

    if raw is None:
        return None
    if isinstance(raw, (bytes, bytearray)):
        return bytes(raw).hex()

    text = str(raw).strip()
    if text[:2].lower() == BYTEA_HEX_PREFIX:
        text = text[2:]
    text = text.lower()
    if not text or any(char not in "0123456789abcdef" for char in text):
        logger.warning("Unexpected puzzle_salt encoding; omitting from session")
        return None
    return text


def get_user_from_launch(*, hub_user_id: str, email: str) -> UserResponse:
    _ = hub_user_id  # Hub user id is currently informational for this app.
    row = _get_user_row_by_email(email=email)

    # retirement_activity_prints.users uses uuid primary key + quota tracking columns.
    user_id = row.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record missing id",
        )

    full_name = row.get("full_name")
    plan = row.get("plan")
    created_at = _parse_datetime_as_iso(row.get("created_at"))

    download_quota = get_download_quota_status(user_id=str(user_id))

    return UserResponse(
        puzzle_salt=_normalize_puzzle_salt(row.get("puzzle_salt")),
        id=str(user_id),
        email=str(row.get("email") or email),
        full_name=str(full_name) if full_name is not None else None,
        plan=str(plan) if plan is not None else None,
        created_at=created_at,
        monthly_downloads_used=int(download_quota["monthly_downloads_used"]),
        monthly_download_limit=download_quota["monthly_download_limit"],
        monthly_downloads_remaining=download_quota["monthly_downloads_remaining"],
        is_unlimited_downloads=bool(download_quota["is_unlimited"]),
    )


def get_launch_token_from_request(request: Request) -> Optional[str]:
    """
    Extract launch token from:
    - `X-Launch-Token` header
    - `Authorization: Bearer <token>` header
    """

    x_token = request.headers.get("X-Launch-Token") or request.headers.get("x-launch-token")
    if x_token and x_token.strip():
        return x_token.strip()

    authorization = request.headers.get("Authorization")
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
        return token or None

    return None

