"""
GRSAI OpenAI-compatible chat completions client.

Docs: https://grsaiapi.com/v1/chat/completions
"""

from __future__ import annotations

import logging
import random
import time
from typing import Any, Optional

import requests

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://grsaiapi.com"
CHAT_COMPLETIONS_PATH = "/v1/chat/completions"


def _headers(api_key: str) -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }


def _normalize_message_content(content: Any) -> str:
    """GRSAI may return string or multimodal content parts."""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if not isinstance(item, dict):
                continue
            text = item.get("text")
            if isinstance(text, str) and text.strip():
                parts.append(text.strip())
        return "\n".join(parts).strip()
    return ""


def _build_request_body(
    *,
    model: str,
    messages: list[dict[str, str]],
    stream: bool,
    extra: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": model,
        "stream": stream,
        "messages": messages,
    }
    if extra:
        body.update(extra)
    return body


def _is_retryable_error(status_code: int, body: dict[str, Any]) -> bool:
    if status_code == 429:
        return True
    if status_code >= 500:
        return True
    message = str(body.get("error", {}).get("message", "")).lower()
    return any(
        token in message
        for token in ("rate limit", "timeout", "temporarily", "overloaded", "retry")
    )


def chat_completion(
    api_key: str,
    *,
    messages: list[dict[str, str]],
    model: str,
    stream: bool = False,
    base_url: str = DEFAULT_BASE_URL,
    timeout: float = 90.0,
    max_attempts: int = 3,
    backoff_base_seconds: float = 1.0,
    extra_body: Optional[dict[str, Any]] = None,
) -> str:
    """Call /v1/chat/completions and return assistant message content."""
    root = base_url.rstrip("/")
    url = f"{root}{CHAT_COMPLETIONS_PATH}"
    body = _build_request_body(
        model=model,
        messages=messages,
        stream=stream,
        extra=extra_body,
    )

    last_error: Optional[Exception] = None
    for attempt in range(1, max_attempts + 1):
        try:
            response = requests.post(
                url,
                headers=_headers(api_key),
                json=body,
                timeout=timeout,
            )
            payload = response.json() if response.content else {}
            if not response.ok:
                if attempt < max_attempts and _is_retryable_error(response.status_code, payload):
                    wait = backoff_base_seconds * (2 ** (attempt - 1)) + random.uniform(0, 0.4)
                    logger.warning(
                        "GRSAI chat retryable HTTP %s attempt %s/%s; waiting %.1fs",
                        response.status_code,
                        attempt,
                        max_attempts,
                        wait,
                    )
                    time.sleep(wait)
                    continue
                message = payload.get("error", {}).get("message", response.text)
                raise RuntimeError(f"GRSAI chat API error ({response.status_code}): {message}")

            choices = payload.get("choices", [])
            if not choices:
                raise RuntimeError(f"GRSAI chat API returned no choices: {payload}")

            message = choices[0].get("message", {})
            content = _normalize_message_content(message.get("content", ""))
            if not content:
                raise RuntimeError(f"GRSAI chat API returned empty content: {payload}")
            return content
        except (requests.RequestException, RuntimeError) as exc:
            last_error = exc
            if attempt >= max_attempts:
                break
            wait = backoff_base_seconds * (2 ** (attempt - 1)) + random.uniform(0, 0.4)
            logger.warning(
                "GRSAI chat attempt %s/%s failed (%s). Retrying in %.1fs.",
                attempt,
                max_attempts,
                exc,
                wait,
            )
            time.sleep(wait)

    raise RuntimeError(f"GRSAI chat failed after {max_attempts} attempts") from last_error
