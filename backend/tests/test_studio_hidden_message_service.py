from __future__ import annotations

import asyncio
import json
import re

import pytest

from app.schemas.studio_hidden_message import HiddenMessageRequest
from app.services.studio_hidden_message_service import (
    HiddenMessageGenerationError,
    build_prompt_for_tests,
    filter_word_pool_for_tests,
    generate_hidden_message,
    normalize_message,
    parse_payload_for_tests,
)

VALID_WORDS = [
    "PENSION",
    "HAMMOCK",
    "GARDEN",
    "TRAVEL",
    "CRUISE",
    "FAMILY",
    "HOBBY",
    "RELAX",
    "SUNSET",
    "FRIENDS",
    "NATURE",
    "READING",
    "SAILING",
    "FREEDOM",
    "JOURNEY",
    "WEEKEND",
    "PICNIC",
    "SOCIAL",
    "OUTING",
    "COMFORT",
    "LEISURE",
    "MEMORY",
    "BOOK",
    "WALK",
    "LAKE",
    "BIRD",
    "ROSE",
    "SOFA",
    "GOLF",
    "FISH",
    "BOAT",
    "YARD",
    "KNIT",
    "QUILT",
    "PORCH",
    "SHADE",
    "PEACE",
    "SMILE",
    "NAP",
    "TEA",
]

VALID = {"message": "EVERY DAY IS SATURDAY NOW", "words": VALID_WORDS}


def test_parse_valid_json() -> None:
    message, words = parse_payload_for_tests(json.dumps(VALID))
    assert "SATURDAY" in message
    assert len(words) == 40


def test_parse_invalid_json_raises() -> None:
    with pytest.raises(ValueError, match="valid JSON"):
        parse_payload_for_tests("not json")


def test_parse_missing_fields_raises() -> None:
    with pytest.raises(ValueError, match="missing"):
        parse_payload_for_tests(json.dumps({"items": ["nope"]}))


def test_normalize_message_letter_bounds() -> None:
    assert normalize_message("HI THERE") is None
    assert normalize_message("A" * 36) is None
    assert normalize_message("EVERY DAY IS SATURDAY NOW")[1] == "EVERYDAYISSATURDAYNOW"


def test_filter_drops_palindrome_nested_and_unsafe() -> None:
    words = filter_word_pool_for_tests(
        ["LEVEL", "REST", "RESTAURANT", "Disney", "cure memory loss", "GARDEN", "NAP"]
    )
    tokens = [re.sub(r"[^A-Z]", "", w) for w in words]
    assert "LEVEL" not in tokens
    assert "REST" not in tokens
    assert "DISNEY" not in tokens
    assert "RESTAURANT" in tokens
    assert "GARDEN" in tokens


def test_prompt_mentions_theme_and_pool_size() -> None:
    req = HiddenMessageRequest(theme="Retiring nurse", tone="funny", difficulty="easy", seed=3)
    prompt = build_prompt_for_tests(req)
    assert "Retiring nurse" in prompt
    assert "40" in prompt
    assert "funny" in prompt.lower() or "witty" in prompt


def test_custom_message_skips_writing_a_saying() -> None:
    req = HiddenMessageRequest(
        theme="Life after work",
        customMessage="EVERY DAY IS SATURDAY NOW",
        seed=1,
    )
    prompt = build_prompt_for_tests(req)
    assert "already chosen" in prompt
    assert "EVERY DAY IS SATURDAY NOW" in prompt


def test_generate_retries_invalid_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    async def fake_gemini(_prompt: str) -> str:
        calls["n"] += 1
        if calls["n"] == 1:
            return "not json"
        if calls["n"] == 2:
            return json.dumps({"message": "HI", "words": ["TEA"]})
        return json.dumps(VALID)

    monkeypatch.setattr(
        "app.services.studio_hidden_message_service._call_gemini",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_hidden_message_service._check_rate_limit",
        lambda _uid: None,
    )

    result = asyncio.run(
        generate_hidden_message(
            HiddenMessageRequest(theme="Life after work", difficulty="easy", seed=7),
            user_id="user-1",
        )
    )
    assert result.message.startswith("EVERY DAY")
    assert len(result.words) >= 26
    assert calls["n"] == 3


def test_generate_gives_up_after_three_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps({"message": "HI", "words": ["TEA"]})

    monkeypatch.setattr(
        "app.services.studio_hidden_message_service._call_gemini",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_hidden_message_service._check_rate_limit",
        lambda _uid: None,
    )

    with pytest.raises(HiddenMessageGenerationError):
        asyncio.run(
            generate_hidden_message(HiddenMessageRequest(seed=1), user_id="user-1")
        )
