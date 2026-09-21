from __future__ import annotations

import asyncio
import json

import pytest

from app.schemas.studio_missing_vowels import MissingVowelsRequest
from app.services.studio_missing_vowels_service import (
    MissingVowelsGenerationError,
    build_prompt_for_tests,
    generate_missing_vowels,
    mask_vowels_for_tests,
    normalize_items_for_tests,
    parse_mv_json_for_tests,
)


VALID_WORDS = {
    "items": [
        "Gardening",
        "Travel",
        "Cruise",
        "Garden",
        "Picnic",
        "Sunset",
        "Family",
        "Hobby",
        "Relax",
        "Memory",
        "Friends",
        "Nature",
    ]
}


def test_parse_valid_json() -> None:
    items = parse_mv_json_for_tests(json.dumps(VALID_WORDS))
    assert len(items) == 12


def test_parse_markdown_fenced_json() -> None:
    raw = "```json\n" + json.dumps(VALID_WORDS) + "\n```"
    items = parse_mv_json_for_tests(raw)
    assert len(items) == 12


def test_missing_items_raises() -> None:
    with pytest.raises(ValueError, match="missing items"):
        parse_mv_json_for_tests(json.dumps({}))


def test_mask_vowels_keeps_y_and_spaces() -> None:
    assert mask_vowels_for_tests("RETIREMENT") == "R_T_R_M_NT"
    assert mask_vowels_for_tests("ROAD TRIP") == "R__D TR_P"
    assert mask_vowels_for_tests("HAPPY") == "H_PPY"


def test_normalize_drops_bad_entries() -> None:
    items = normalize_items_for_tests(
        ["tiger", "ab", "eagle!", "ocean", "rhythm", "bread", "river", "apple", "toolongwordxyz"],
        min_len=4,
        max_len=8,
        want=10,
    )
    assert "TIGER" in items
    assert "AB" not in items
    assert "RHYTHM" not in items
    assert all("A" <= ch <= "Z" or ch == " " for text in items for ch in text)


def test_normalize_allows_two_word_phrases() -> None:
    items = normalize_items_for_tests(
        ["road trip", "free time", "x", "one two three", {"answer": "tea time"}],
        min_len=4,
        max_len=10,
        want=10,
    )
    assert "ROAD TRIP" in items
    assert "FREE TIME" in items
    assert "TEA TIME" in items
    assert all(len(i.split(" ")) <= 2 for i in items)


def test_prompt_mentions_theme_and_length() -> None:
    req = MissingVowelsRequest(
        theme="Travel Dreams",
        itemCount=12,
        difficulty="classic",
        seed=7,
    )
    prompt = build_prompt_for_tests(req)
    assert "Travel Dreams" in prompt
    assert "5-10" in prompt
    assert "24" in prompt


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
                    "picnic",
                    "sunset",
                    "family",
                    "hobby",
                    "relax",
                    "memory",
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
        theme="Hobbies & Leisure", itemCount=12, difficulty="classic", seed=7
    )
    result = asyncio.run(generate_missing_vowels(req, user_id="user-1"))
    assert len(result.items) >= 8
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
