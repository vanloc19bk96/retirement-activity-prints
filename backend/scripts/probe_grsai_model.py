"""Probe GRSAI chat model response shape."""
from __future__ import annotations

import json
import sys

import requests

from app.services.ai_runtime_settings_service import get_ai_runtime_settings

MODEL = sys.argv[1] if len(sys.argv) > 1 else "gpt-5.5"


def main() -> None:
    runtime = get_ai_runtime_settings()
    api_key = runtime.grsai_api_key.strip()
    base_url = runtime.grsai_base_url.rstrip("/")
    url = f"{base_url}/v1/chat/completions"
    body = {
        "model": MODEL,
        "stream": False,
        "messages": [
            {
                "role": "user",
                "content": (
                    'Return JSON only: {"title":"Test","story_intro":"Hi","clues":["a"]}'
                ),
            },
        ],
    }
    resp = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=120,
    )
    print("status", resp.status_code)
    print("raw_head", resp.text[:800])
    data = resp.json()
    choices = data.get("choices", [])
    if not choices:
        print("no choices")
        return
    message = choices[0].get("message", {})
    print("message_keys", list(message.keys()))
    print("content_type", type(message.get("content")).__name__)
    print("content_repr", repr(message.get("content"))[:500])


if __name__ == "__main__":
    main()
