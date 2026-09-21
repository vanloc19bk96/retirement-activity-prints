from __future__ import annotations

import asyncio
import json

import pytest

from app.schemas.studio_retirement_anagram import RetirementAnagramRequest
from app.services.studio_retirement_anagram_service import (
    RetirementAnagramGenerationError,
    build_prompt_for_tests,
    generate_retirement_anagram,
    normalize_words_for_tests,
    parse_json_for_tests,
)


VALID_PAYLOAD = {
    "items": [
        "TRAVEL",
        "GARDEN",
        "PENSION",
        "HOBBY",
        "CRUISE",
        "FAMILY",
        "LEISURE",
        "VOLUNTEER",
        "RELAX",
        "MEMORY",
        "BUCKET",
        "WELLNESS",
    ]
}


def test_parse_valid_json() -> None:
    items = parse_json_for_tests(json.dumps(VALID_PAYLOAD))
    assert len(items) == 12


def test_missing_items_raises() -> None:
    with pytest.raises(ValueError, match="missing items"):
        parse_json_for_tests(json.dumps({}))


def test_normalize_filters_length_and_dupes() -> None:
    words = normalize_words_for_tests(
        ["TRAVEL", "travel", "AB", "TOOLONGWORDXX", "GARDEN", "OK"],
        min_len=4,
        max_len=8,
        want=10,
    )
    assert words == ["TRAVEL", "GARDEN"]


def test_prompt_mentions_topic_and_length() -> None:
    req = RetirementAnagramRequest(
        topic="Gardening",
        itemCount=12,
        difficulty="easy",
        seed=7,
    )
    prompt = build_prompt_for_tests(req)
    assert "Gardening" in prompt
    assert "4-6" in prompt


def test_generate_returns_normalized_words(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps(VALID_PAYLOAD)

    monkeypatch.setattr(
        "app.services.studio_retirement_anagram_service._call_gemini",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_retirement_anagram_service._check_rate_limit",
        lambda _uid: None,
    )

    req = RetirementAnagramRequest(
        topic="Retirement Life",
        itemCount=8,
        difficulty="medium",
        seed=1,
    )
    result = asyncio.run(generate_retirement_anagram(req, user_id="user-1"))
    assert len(result.items) >= 8
    assert all(w.isupper() for w in result.items)


def test_generate_raises_when_too_few(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps({"items": ["HI", "BYE"]})

    monkeypatch.setattr(
        "app.services.studio_retirement_anagram_service._call_gemini",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_retirement_anagram_service._check_rate_limit",
        lambda _uid: None,
    )

    req = RetirementAnagramRequest(
        topic="Retirement Life",
        itemCount=12,
        difficulty="medium",
        seed=1,
    )
    with pytest.raises(RetirementAnagramGenerationError, match="too few"):
        asyncio.run(generate_retirement_anagram(req, user_id="user-1"))
