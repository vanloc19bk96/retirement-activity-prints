from __future__ import annotations

import asyncio
import json

import pytest
from pydantic import ValidationError

from app.schemas.studio_anagram import AnagramRequest
from app.services.studio_anagram_service import (
    AnagramGenerationError,
    generate_anagram,
    normalize_items_for_tests,
    parse_anagram_json_for_tests,
    validate_anagram_shape_for_tests,
)


VALID_PAYLOAD = {
    "items": [
        {"word": "tiger", "hint": "a big cat"},
        {"word": "eagle", "hint": "a bird of prey"},
        {"word": "ocean", "hint": "a large body of salt water"},
        {"word": "bread", "hint": "baked staple food"},
        {"word": "river", "hint": "flowing fresh water"},
        {"word": "apple", "hint": "a common fruit"},
    ]
}


def test_parse_valid_json() -> None:
    data = parse_anagram_json_for_tests(json.dumps(VALID_PAYLOAD))
    assert len(data["items"]) == 6


def test_parse_markdown_fenced_json() -> None:
    raw = "```json\n" + json.dumps(VALID_PAYLOAD) + "\n```"
    data = parse_anagram_json_for_tests(raw)
    assert len(data["items"]) == 6


def test_missing_items_raises() -> None:
    with pytest.raises(ValueError, match="missing items"):
        validate_anagram_shape_for_tests({})


def test_normalize_drops_bad_words_and_leaky_hints() -> None:
    items = normalize_items_for_tests(
        [
            {"word": "tiger", "hint": "a big cat"},
            {"word": "ab", "hint": "too short"},
            {"word": "SILENT", "hint": "the word silent means quiet"},
            {"word": "eagle!", "hint": "bird"},
            {"word": "ocean", "hint": "salt water"},
            {"word": "bread", "hint": "baked food"},
            {"word": "river", "hint": "fresh water"},
            {"word": "apple", "hint": "fruit"},
        ],
        min_len=3,
        max_len=7,
        want=10,
    )
    words = [i.word for i in items]
    assert "TIGER" in words
    assert "SILENT" not in words
    assert "AB" not in words
    assert all(i.word.isalpha() and i.word.isupper() for i in items)


def test_generate_strips_and_uppercases(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps(
            {
                "items": [
                    {"word": " tiger ", "hint": "a big cat"},
                    {"word": "Eagle", "hint": "a bird of prey"},
                    {"word": "OCEAN", "hint": "salt water"},
                    {"word": "bread", "hint": "baked food"},
                    {"word": "river", "hint": "fresh water"},
                    {"word": "apple", "hint": "a fruit"},
                ]
            }
        )

    monkeypatch.setattr(
        "app.services.studio_anagram_service._call_gemini",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_anagram_service._check_rate_limit",
        lambda _uid: None,
    )

    req = AnagramRequest(theme="animals", itemCount=6, difficulty="easy", seed=7)
    result = asyncio.run(generate_anagram(req, user_id="user-1"))
    assert len(result.items) == 6
    assert result.items[0].word == "TIGER"


def test_too_few_items_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps(
            {"items": [{"word": "cat", "hint": "small pet"}, {"word": "dog", "hint": "loyal"}]}
        )

    monkeypatch.setattr(
        "app.services.studio_anagram_service._call_gemini",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_anagram_service._check_rate_limit",
        lambda _uid: None,
    )

    req = AnagramRequest(itemCount=12, seed=1)
    with pytest.raises(AnagramGenerationError, match="too few"):
        asyncio.run(generate_anagram(req, user_id="user-1"))


def test_theme_max_length_rejected() -> None:
    with pytest.raises(ValidationError):
        AnagramRequest(theme="x" * 121)
