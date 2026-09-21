from __future__ import annotations

import asyncio
import json

import pytest

from app.schemas.studio_missing_vowels import MissingVowelsRequest
from app.services.studio_missing_vowels_service import (
    MissingVowelsGenerationError,
    generate_missing_vowels,
    normalize_items_for_tests,
    parse_mv_json_for_tests,
    validate_mv_shape_for_tests,
)


VALID_WORDS = {
    "items": ["tiger", "eagle", "ocean", "bread", "river", "apple"]
}

VALID_PHRASES = {
    "items": [
        "practice makes perfect",
        "better late than never",
        "knowledge is power",
        "slow and steady",
        "time heals wounds",
        "actions speak louder",
    ]
}


def test_parse_valid_json() -> None:
    data = parse_mv_json_for_tests(json.dumps(VALID_WORDS))
    assert len(data["items"]) == 6


def test_parse_markdown_fenced_json() -> None:
    raw = "```json\n" + json.dumps(VALID_WORDS) + "\n```"
    data = parse_mv_json_for_tests(raw)
    assert len(data["items"]) == 6


def test_missing_items_raises() -> None:
    with pytest.raises(ValueError, match="missing items"):
        validate_mv_shape_for_tests({})


def test_normalize_words_drops_bad_entries() -> None:
    items = normalize_items_for_tests(
        ["tiger", "ab", "eagle!", "ocean", "bread", "river", "apple", "toolongwordxyz"],
        kind="words",
        min_len=3,
        max_len=7,
        min_words=2,
        max_words=6,
        want=10,
    )
    assert "TIGER" in items
    assert "AB" not in items
    assert all(i.isalpha() and i.isupper() for i in items)


def test_normalize_phrases() -> None:
    items = normalize_items_for_tests(
        VALID_PHRASES["items"] + ["x", "one two three four five six seven eight nine"],
        kind="phrases",
        min_len=3,
        max_len=12,
        min_words=2,
        max_words=6,
        want=10,
    )
    assert len(items) >= 5
    assert all(" " in i for i in items)


def test_generate_strips_and_uppercases(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps(
            {
                "items": [
                    " tiger ",
                    "Eagle",
                    "OCEAN",
                    "bread",
                    "river",
                    "apple",
                ]
            }
        )

    monkeypatch.setattr(
        "app.services.studio_missing_vowels_service._call_gemini",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_missing_vowels_service._check_rate_limit",
        lambda _uid: None,
    )

    req = MissingVowelsRequest(
        theme="animals", itemCount=6, difficulty="easy", seed=7, kind="words"
    )
    result = asyncio.run(generate_missing_vowels(req, user_id="user-1"))
    assert len(result.items) == 6
    assert result.items[0] == "TIGER"


def test_too_few_items_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps({"items": ["cat", "dog"]})

    monkeypatch.setattr(
        "app.services.studio_missing_vowels_service._call_gemini",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_missing_vowels_service._check_rate_limit",
        lambda _uid: None,
    )

    req = MissingVowelsRequest(itemCount=12, seed=1)
    with pytest.raises(MissingVowelsGenerationError, match="too few"):
        asyncio.run(generate_missing_vowels(req, user_id="user-1"))
