from __future__ import annotations

import asyncio
import json

import pytest
from pydantic import ValidationError

from app.schemas.studio_theme_words import ThemeWordsRequest
from app.services.studio_gemini import StudioGenerationError
from app.services.studio_theme_words_service import (
    ThemeWordsGenerationError,
    build_prompt_for_tests,
    generate_theme_words,
    normalize_words_for_tests,
)

RANGE = {"min_letters": 3, "max_letters": 8}

VALID_WORDS = [
    "kettle",
    "teapot",
    "saucer",
    "ladle",
    "whisk",
    "sieve",
    "grater",
    "tongs",
    "jug",
]


def test_request_rejects_inverted_letter_range() -> None:
    with pytest.raises(ValidationError):
        ThemeWordsRequest(minLetters=10, maxLetters=4)


def test_normalize_uppercases_and_drops_non_letters() -> None:
    items = normalize_words_for_tests(["ket-tle", "tea pot"], want=5, **RANGE)
    assert items == ["KETTLE", "TEAPOT"]


def test_normalize_enforces_length_bounds() -> None:
    items = normalize_words_for_tests(["jug", "ex", "casserole"], want=5, **RANGE)
    assert items == ["JUG"]


def test_normalize_drops_duplicates() -> None:
    items = normalize_words_for_tests(["kettle", "KETTLE", "ladle"], want=5, **RANGE)
    assert items == ["KETTLE", "LADLE"]


def test_prompt_rotates_variety_with_seed() -> None:
    first = build_prompt_for_tests(ThemeWordsRequest(theme="kitchen", seed=0))
    second = build_prompt_for_tests(ThemeWordsRequest(theme="kitchen", seed=1))
    assert first != second


def test_prompt_carries_letter_bounds() -> None:
    prompt = build_prompt_for_tests(
        ThemeWordsRequest(theme="kitchen", minLetters=4, maxLetters=9, seed=2)
    )
    assert "4-9 letters" in prompt


def test_prompt_requires_theme_fidelity() -> None:
    prompt = build_prompt_for_tests(
        ThemeWordsRequest(theme="things you find at the beach", seed=3)
    )
    assert "things you find at the beach" in prompt
    assert "STRICT theme fidelity" in prompt
    assert "moose" in prompt.lower()
    # Old angles hijacked the theme (e.g. "things seen in a kitchen").
    assert "things seen in a kitchen" not in prompt
    assert "widen to closely related" not in prompt


def test_generate_returns_words(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps({"items": VALID_WORDS})

    monkeypatch.setattr(
        "app.services.studio_theme_words_service._call_gemini", fake_gemini
    )
    monkeypatch.setattr(
        "app.services.studio_theme_words_service._check_rate_limit", lambda _uid: None
    )

    req = ThemeWordsRequest(
        theme="kitchen", itemCount=6, minLetters=3, maxLetters=8, seed=5
    )
    result = asyncio.run(generate_theme_words(req, user_id="user-1"))
    assert len(result.items) == 6
    assert all(item.isalpha() and item.isupper() for item in result.items)


def test_generate_raises_when_too_few_usable(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps({"items": ["ex", "yz"]})

    monkeypatch.setattr(
        "app.services.studio_theme_words_service._call_gemini", fake_gemini
    )
    monkeypatch.setattr(
        "app.services.studio_theme_words_service._check_rate_limit", lambda _uid: None
    )

    req = ThemeWordsRequest(itemCount=12, seed=1)
    with pytest.raises(ThemeWordsGenerationError, match="enough words"):
        asyncio.run(generate_theme_words(req, user_id="user-1"))


def test_generate_accepts_partial_list(monkeypatch: pytest.MonkeyPatch) -> None:
    """Short of the ask is OK — a printable grid only needs a handful of words."""

    async def fake_gemini(_prompt: str) -> str:
        return json.dumps({"items": ["shell", "towel", "tide", "sand", "wave"]})

    monkeypatch.setattr(
        "app.services.studio_theme_words_service._call_gemini", fake_gemini
    )
    monkeypatch.setattr(
        "app.services.studio_theme_words_service._check_rate_limit", lambda _uid: None
    )

    req = ThemeWordsRequest(
        theme="things you find at the beach",
        itemCount=14,
        minLetters=3,
        maxLetters=11,
        seed=1,
    )
    result = asyncio.run(generate_theme_words(req, user_id="user-1"))
    assert len(result.items) == 5
    assert all(item.isalpha() and item.isupper() for item in result.items)


def test_generate_retries_after_gemini_blip(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    async def flaky_gemini(_prompt: str) -> str:
        calls["n"] += 1
        if calls["n"] == 1:
            raise StudioGenerationError("temporary upstream failure")
        return json.dumps({"items": VALID_WORDS})

    monkeypatch.setattr(
        "app.services.studio_theme_words_service._call_gemini", flaky_gemini
    )
    monkeypatch.setattr(
        "app.services.studio_theme_words_service._check_rate_limit", lambda _uid: None
    )

    req = ThemeWordsRequest(
        theme="kitchen", itemCount=6, minLetters=3, maxLetters=8, seed=5
    )
    result = asyncio.run(generate_theme_words(req, user_id="user-1"))
    assert calls["n"] == 2
    assert len(result.items) == 6
