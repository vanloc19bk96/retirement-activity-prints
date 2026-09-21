"""Notify Creator Hub to sync access when a user is added/updated (e.g. after WarriorPlus IPN)."""

import asyncio
import logging
from typing import Optional

import requests

from app.core.config import settings
from app.core.email import normalize_email

logger = logging.getLogger(__name__)

SYNC_PATH = "/access/sync"


def _sync_access_sync(email: str, app_code: str, status: str = "active") -> Optional[dict]:
    """Sync access to hub (blocking). Called from thread."""
    base = (settings.HUB_API_URL or "").rstrip("/")
    if not base or not (settings.HUB_APP_CODE or app_code):
        return None
    url = f"{base}{SYNC_PATH}"
    payload = {
        "email": normalize_email(email),
        "app_code": app_code or settings.HUB_APP_CODE,
        "status": status,
    }
    try:
        resp = requests.post(url, json=payload, timeout=10)
        resp.raise_for_status()
        return resp.json() if resp.content else {}
    except requests.RequestException as e:
        logger.warning("Hub sync failed for %s: %s", email, e)
        return None


async def notify_hub_sync(email: str, app_code: Optional[str] = None) -> None:
    """
    Notify hub to sync access for the given email (active).
    Uses HUB_APP_CODE if app_code not provided. No-op if HUB_API_URL or app code not set.
    """
    code = app_code or settings.HUB_APP_CODE
    if not settings.HUB_API_URL or not code:
        return
    await asyncio.to_thread(_sync_access_sync, email, code, "active")
