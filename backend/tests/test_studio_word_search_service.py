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
    "PENSION", "HAMMOCK", "GARDEN", "TRAVEL", "CRUISE", "FAMILY",
    "HOBBY", "RELAX", "SUNSET", "FRIENDS", "NATURE", "READING",
    "SAILING", "FREEDOM", "JOURNEY", "WEEKEND", "PICNIC", "SOCIAL",
    "OUTING", "COMFORT", "LEISURE", "MEMORY", "BOOK", "WALK",
    "LAKE", "BIRD", "ROSE", "SOFA", "GOLF", "FISH",
]


def test_prompt_includes_new_payload_fields_and_pool_size() -> None:
    prompt = build_prompt_for_tests(
        WordSearchRequest(
            theme="Retiring nurse",
            tone="funny",
            difficulty="hard",
            printStyle="standard",
            seed=5,
        )
    )
    assert "Retiring nurse" in prompt
    assert "30" in prompt
    assert "funny" in prompt.lower() or "witty" in prompt.lower()
    assert "standard" in prompt
    assert "3 to 11 letters" in prompt


def test_filter_keeps_phrase_display_and_drops_unsafe_nested_words() -> None:
    result = filter_word_pool_for_tests(
        ["Road Trip", "LEVEL", "REST", "RESTAURANT", "Disney", "GARDEN"]
    )
    assert "Road Trip" in result
    assert "LEVEL" not in result
    assert "REST" not in result
    assert "Disney" not in result
    assert "RESTAURANT" in result


def test_generate_retries_with_seed_plus_97(monkeypatch: pytest.MonkeyPatch) -> None:
    prompts: list[str] = []

    async def fake_gemini(prompt: str) -> str:
        prompts.append(prompt)
        if len(prompts) == 1:
            return json.dumps({"words": ["TEA"]})
        return json.dumps({"words": VALID_WORDS})

    monkeypatch.setattr("app.services.studio_word_search_service._call_gemini", fake_gemini)
    monkeypatch.setattr(
        "app.services.studio_word_search_service._check_rate_limit", lambda _uid: None
    )
    result = asyncio.run(
        generate_word_search(
            WordSearchRequest(theme="Life after work", difficulty="easy", seed=7),
            user_id="user-1",
        )
    )
    assert len(result.words) == 30
    assert len(prompts) == 2
    assert prompts[0] != prompts[1]


def test_generate_uses_final_error_after_three_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps({"words": ["TEA"]})

    monkeypatch.setattr("app.services.studio_word_search_service._call_gemini", fake_gemini)
    monkeypatch.setattr(
        "app.services.studio_word_search_service._check_rate_limit", lambda _uid: None
    )
    with pytest.raises(WordSearchGenerationError, match="broader theme") as exc:
        asyncio.run(generate_word_search(WordSearchRequest(seed=1), user_id="user-1"))
    assert str(exc.value) == FINAL_ERROR
