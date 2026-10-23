"""Calls to the Creator Hub about the project a launch token opens.

The hub lists the user's projects; this app keeps their content. Both use the same project
id, which the hub puts in the launch token. These calls let the editor show the project's
name, report saves for the hub's dashboard, and register (adopt) a project this app already
had before the hub knew about it.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any, Optional
from uuid import UUID

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)

HUB_PROJECT_PATH = "/launch/project"
HUB_ADOPT_PATH = "/launch/project/adopt"
HUB_TIMEOUT_SECONDS = 10

# Auto-save can fire every few seconds; the dashboard only needs "edited just now".
EDIT_REPORT_MIN_INTERVAL_SECONDS = 30
_last_edit_report: dict[str, tuple[float, Optional[int]]] = {}
_last_edit_report_lock = threading.Lock()


class HubProjectDeleted(RuntimeError):
    """The user deleted this project in the hub."""


def _hub_url(path: str) -> Optional[str]:
    base = (getattr(settings, "HUB_API_URL", None) or "").strip().rstrip("/")
    return f"{base}{path}" if base else None


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token.strip()}"}


def adopt_project(token: str, project_id: UUID) -> Optional[dict[str, Any]]:
    """
    Register this app's project in the hub; returns `{"token", "project": {"id", "name"}}`
    with a new token pinned to it. None when the hub does not support projects for this app
    (or is unreachable), so the app keeps working as a single-project app.
    Raises `HubProjectDeleted` when the user deleted that project in the hub.
    """
    url = _hub_url(HUB_ADOPT_PATH)
    if url is None:
        return None
    try:
        resp = requests.post(url, json={"project_id": str(project_id)}, headers=_auth(token), timeout=HUB_TIMEOUT_SECONDS)
    except requests.RequestException as exc:
        logger.warning("hub_adopt_failed project=%s err=%s", project_id, exc)
        return None
    if resp.status_code == 410:
        raise HubProjectDeleted(str(project_id))
    if resp.status_code != 200:
        # 422: projects are not turned on for this app; 404/405: an older hub.
        if resp.status_code not in (404, 405, 422):
            logger.warning("hub_adopt_rejected project=%s status=%s", project_id, resp.status_code)
        return None
    data = resp.json()
    if not isinstance(data, dict) or not data.get("token") or not isinstance(data.get("project"), dict):
        return None
    return data


def get_project(token: str) -> Optional[dict[str, Any]]:
    """`{"id", "name"}` of the project the token opens, or None when unavailable."""
    url = _hub_url(HUB_PROJECT_PATH)
    if url is None:
        return None
    try:
        resp = requests.get(url, headers=_auth(token), timeout=HUB_TIMEOUT_SECONDS)
    except requests.RequestException as exc:
        logger.warning("hub_get_project_failed err=%s", exc)
        return None
    if resp.status_code != 200:
        return None
    data = resp.json()
    return data if isinstance(data, dict) and data.get("id") else None


def rename_project(token: str, name: str) -> Optional[dict[str, Any]]:
    url = _hub_url(HUB_PROJECT_PATH)
    if url is None:
        return None
    try:
        resp = requests.patch(url, json={"name": name}, headers=_auth(token), timeout=HUB_TIMEOUT_SECONDS)
    except requests.RequestException as exc:
        logger.warning("hub_rename_project_failed err=%s", exc)
        return None
    if resp.status_code != 200:
        return None
    data = resp.json()
    return data if isinstance(data, dict) and data.get("id") else None


def report_project_saved(token: str, project_id: UUID, page_count: Optional[int]) -> None:
    """Best-effort: tell the hub the project was just edited. Never raises; throttled per project."""
    key = str(project_id)
    now = time.monotonic()
    with _last_edit_report_lock:
        last = _last_edit_report.get(key)
        if last is not None and now - last[0] < EDIT_REPORT_MIN_INTERVAL_SECONDS and last[1] == page_count:
            return
        _last_edit_report[key] = (now, page_count)

    url = _hub_url(HUB_PROJECT_PATH)
    if url is None:
        return
    payload: dict[str, Any] = {"edited": True}
    if page_count is not None:
        payload["page_count"] = page_count
    try:
        requests.patch(url, json=payload, headers=_auth(token), timeout=HUB_TIMEOUT_SECONDS)
    except requests.RequestException as exc:
        logger.info("hub_report_saved_failed project=%s err=%s", project_id, exc)
