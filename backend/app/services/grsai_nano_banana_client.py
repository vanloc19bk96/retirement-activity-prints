"""
GRSAI Nano Banana API client for image generation.

Uses polling: POST /v1/draw/nano-banana with webHook=-1 for task id, then POST /v1/draw/result until done.
Request includes imageSize (default 1K) per GRSAI Nano Banana API.
Docs: https://grsaiapi.com
"""

from __future__ import annotations

import time
from typing import Any, Optional

import requests

DEFAULT_BASE_URL = "https://grsaiapi.com"
DRAW_PATH = "/v1/draw/nano-banana"
RESULT_PATH = "/v1/draw/result"


def _headers(api_key: str) -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }


def submit_task(
    api_key: str,
    *,
    prompt: str,
    model: str = "nano-banana-fast",
    aspect_ratio: str = "auto",
    image_size: str = "1K",
    urls: Optional[list[str]] = None,
    base_url: str = DEFAULT_BASE_URL,
    timeout: float = 60.0,
) -> str:
    """
    Submit a draw task with webHook="-1" to get an immediate task id.
    Use poll_until_done() to retrieve the result.
    """
    root = base_url.rstrip("/")
    url = f"{root}{DRAW_PATH}"
    body: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "aspectRatio": aspect_ratio,
        "imageSize": image_size,
        "webHook": "-1",
        "shutProgress": True,
    }
    if urls:
        body["urls"] = urls

    resp = requests.post(
        url,
        headers=_headers(api_key),
        json=body,
        timeout=timeout,
    )
    resp.raise_for_status()
    data = resp.json()
    if data.get("code") != 0:
        raise RuntimeError(
            f"GRSAI draw API error: code={data.get('code')} msg={data.get('msg')}"
        )
    task_id = data.get("data", {}).get("id")
    if not task_id:
        raise RuntimeError(f"No task id in GRSAI response: {data}")
    return str(task_id)


def get_result(
    api_key: str,
    task_id: str,
    *,
    base_url: str = DEFAULT_BASE_URL,
    timeout: float = 60.0,
) -> dict[str, Any]:
    """POST /v1/draw/result — returns full JSON payload."""
    root = base_url.rstrip("/")
    url = f"{root}{RESULT_PATH}"
    resp = requests.post(
        url,
        headers=_headers(api_key),
        json={"id": task_id},
        timeout=timeout,
    )
    resp.raise_for_status()
    return resp.json()


def poll_until_done(
    api_key: str,
    task_id: str,
    *,
    interval_sec: float = 2.0,
    timeout_sec: float = 600.0,
    base_url: str = DEFAULT_BASE_URL,
) -> dict[str, Any]:
    """Poll /v1/draw/result until status is succeeded or failed; returns inner `data` object."""
    deadline = time.monotonic() + timeout_sec
    last: dict[str, Any] = {}
    while time.monotonic() < deadline:
        raw = get_result(api_key, task_id, base_url=base_url)
        if raw.get("code") == -22:
            raise RuntimeError(f"GRSAI task {task_id} does not exist")
        if raw.get("code") != 0:
            raise RuntimeError(
                f"GRSAI get_result error: code={raw.get('code')} msg={raw.get('msg')}"
            )
        last = raw.get("data") or {}
        status = (last.get("status") or "").lower()
        if status == "succeeded":
            return last
        if status == "failed":
            reason = last.get("failure_reason", "")
            detail = last.get("error", "")
            raise RuntimeError(f"GRSAI task failed: {reason} — {detail}")
        time.sleep(interval_sec)
    raise TimeoutError(f"GRSAI timeout waiting for task {task_id}; last={last}")


def draw_with_polling(
    api_key: str,
    *,
    prompt: str,
    model: str = "nano-banana-fast",
    aspect_ratio: str = "auto",
    image_size: str = "1K",
    urls: Optional[list[str]] = None,
    base_url: str = DEFAULT_BASE_URL,
    submit_timeout: float = 60.0,
    poll_interval_sec: float = 2.0,
    poll_timeout_sec: float = 600.0,
) -> dict[str, Any]:
    """
    Submit task (webHook=-1) and poll /v1/draw/result until succeeded.
    Returns the inner `data` object (id, results, status, ...).
    """
    task_id = submit_task(
        api_key,
        prompt=prompt,
        model=model,
        aspect_ratio=aspect_ratio,
        image_size=image_size,
        urls=urls,
        base_url=base_url,
        timeout=submit_timeout,
    )
    return poll_until_done(
        api_key,
        task_id,
        interval_sec=poll_interval_sec,
        timeout_sec=poll_timeout_sec,
        base_url=base_url,
    )


def extract_image_urls(payload: dict[str, Any]) -> list[str]:
    """Collect image URLs from /v1/draw/result `data` object (or equivalent)."""
    results = payload.get("results")
    if not results:
        return []
    return [
        str(item["url"])
        for item in results
        if isinstance(item, dict) and item.get("url")
    ]
