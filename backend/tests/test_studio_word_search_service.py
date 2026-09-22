from __future__ import annotations

import asyncio
import json

import pytest

from app.schemas.studio_word_search import WordSearchRequest
from app.services.studio_word_search_service import (
    FINAL_ERROR,
    WordSearchGenerationError,
    build_prompt_for_tests,
    filter_word_pool_for_tests,
    generate_word_search,
)

VALID_WORDS = [
    "Pension", "Hammock", "Garden", "Travel", "Cruise", "Family",
    "Hobby", "Relax", "Sunset", "Friends", "Nature", "Reading",
    "Sailing", "Freedom", "Journey", "Weekend", "Picnic", "Social",
    "Outing", "Comfort", "Leisure", "Memory", "Bench", "Ramble",
]


def test_prompt_carries_theme_count_and_letter_band() -> None:
    prompt = build_prompt_for_tests(
        WordSearchRequest(
            theme="Retiring nurse",
            count=24,
            minLetters=4,
            maxLetters=7,
            seed=5,
        )
    )
    assert "Retiring nurse" in prompt
    assert "pool of 24" in prompt
    assert "4 to 7 letters" in prompt
    assert "Title Case" in prompt


def test_letter_band_is_clamped_to_what_a_grid_can_hold() -> None:
    prompt = build_prompt_for_tests(
        WordSearchRequest(theme="Gardening", minLetters=3, maxLetters=12, seed=1)
    )
    assert "3 to 12 letters" in prompt


def test_letter_band_must_be_ordered() -> None:
    with pytest.raises(ValueError):
        WordSearchRequest(theme="Gardening", minLetters=8, maxLetters=5, seed=1)


def test_filter_keeps_phrase_display_and_drops_unusable_entries() -> None:
    result = filter_word_pool_for_tests(
        ["Road Trip", "LEVEL", "Rest", "Restaurant", "Disney", "Garden", "Forgetful"],
        low=4,
        high=10,
    )
    assert "Road Trip" in result
    # Palindrome: reads the same both ways, so the key cannot be right about it.
    assert "LEVEL" not in result
    # Nested inside RESTAURANT — circling one circles the other.
    assert "Rest" not in result
    assert "Restaurant" in result
    assert "Disney" not in result
    assert "Forgetful" not in result
    assert "Garden" in result


def test_filter_enforces_the_requested_letter_band() -> None:
    result = filter_word_pool_for_tests(
        ["Garden", "Gardening", "Sun", "Travel"], low=4, high=7
    )
    assert "Gardening" not in result
    assert "Sun" not in result
    assert result == ["Garden", "Travel"]


def test_generate_retries_with_seed_plus_97(monkeypatch: pytest.MonkeyPatch) -> None:
    prompts: list[str] = []

    async def fake_gemini(prompt: str) -> str:
        prompts.append(prompt)
        if len(prompts) == 1:
            return json.dumps({"words": ["Tea"]})
        return json.dumps({"words": VALID_WORDS})

    monkeypatch.setattr("app.services.studio_word_search_service._call_gemini", fake_gemini)
    monkeypatch.setattr(
        "app.services.studio_word_search_service._check_rate_limit", lambda _uid: None
    )
    result = asyncio.run(
        generate_word_search(
            WordSearchRequest(
                theme="Life after work", count=24, minLetters=4, maxLetters=9, seed=7
            ),
            user_id="user-1",
        )
    )
    assert len(result.words) >= 16
    assert len(prompts) == 2
    assert prompts[0] != prompts[1]


def test_generate_uses_final_error_after_three_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps({"words": ["Tea"]})

    monkeypatch.setattr("app.services.studio_word_search_service._call_gemini", fake_gemini)
    monkeypatch.setattr(
        "app.services.studio_word_search_service._check_rate_limit", lambda _uid: None
    )
    with pytest.raises(WordSearchGenerationError, match="broader theme") as exc:
        asyncio.run(generate_word_search(WordSearchRequest(seed=1), user_id="user-1"))
    assert str(exc.value) == FINAL_ERROR
