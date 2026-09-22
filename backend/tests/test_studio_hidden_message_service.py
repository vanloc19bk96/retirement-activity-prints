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

# Four to eight letters, Title Case, no palindromes and nothing nested inside
# anything else — a pool shaped like one the classic level asks for.
VALID_WORDS = [
    "Garden",
    "Travel",
    "Cruise",
    "Family",
    "Hobby",
    "Relax",
    "Sunset",
    "Friends",
    "Nature",
    "Reading",
    "Sailing",
    "Freedom",
    "Journey",
    "Weekend",
    "Picnic",
    "Social",
    "Outing",
    "Comfort",
    "Leisure",
    "Memory",
    "Pension",
    "Hammock",
    "Book",
    "Walk",
    "Lake",
    "Bird",
    "Rose",
    "Sofa",
    "Golf",
    "Fish",
]

VALID = {"message": "Every Day Is Saturday Now", "words": VALID_WORDS}


def _req(**overrides) -> HiddenMessageRequest:
    base = {
        "theme": "Life after work",
        "count": 30,
        "minLetters": 4,
        "maxLetters": 8,
        "minMessageLetters": 18,
        "maxMessageLetters": 28,
        "seed": 7,
    }
    base.update(overrides)
    return HiddenMessageRequest(**base)


def test_parse_valid_json() -> None:
    message, words = parse_payload_for_tests(json.dumps(VALID))
    assert "Saturday" in message
    assert len(words) == 30


def test_parse_invalid_json_raises() -> None:
    with pytest.raises(ValueError, match="valid JSON"):
        parse_payload_for_tests("not json")


def test_parse_missing_fields_raises() -> None:
    with pytest.raises(ValueError, match="missing"):
        parse_payload_for_tests(json.dumps({"items": ["nope"]}))


def test_normalize_message_uses_the_requested_band() -> None:
    # The band is the caller's, not a constant: a saying the gentle level can
    # hide is one the challenging level's page has no room left for.
    assert normalize_message("Every Day Is Saturday Now", low=18, high=28) is not None
    assert normalize_message("Every Day Is Saturday Now", low=24, high=32) is None
    assert normalize_message("Too short", low=18, high=28) is None
    assert normalize_message("A" * 29, low=18, high=28) is None
    assert normalize_message("Every Day Is Saturday Now", low=18, high=28)[1] == (
        "EVERYDAYISSATURDAYNOW"
    )


def test_normalize_message_drops_unsafe_sayings() -> None:
    assert normalize_message("These puzzles prevent dementia now", low=18, high=40) is None


def test_letter_band_is_enforced_on_the_pool() -> None:
    words = filter_word_pool_for_tests(["Tea", "Nap", "Garden", "Retirement Party"], low=4, high=8)
    tokens = [re.sub(r"[^A-Z]", "", w.upper()) for w in words]
    # Three letters is under the floor; sixteen is over the ceiling.
    assert "TEA" not in tokens
    assert "NAP" not in tokens
    assert "RETIREMENTPARTY" not in tokens
    assert "GARDEN" in tokens


def test_filter_drops_palindrome_nested_unsafe_and_stereotype() -> None:
    words = filter_word_pool_for_tests(
        ["Level", "Rest", "Restaurant", "Disney", "cure memory loss", "Garden", "Frail"],
        low=4,
        high=12,
    )
    tokens = [re.sub(r"[^A-Z]", "", w.upper()) for w in words]
    assert "LEVEL" not in tokens
    assert "REST" not in tokens
    assert "DISNEY" not in tokens
    assert "FRAIL" not in tokens
    assert "RESTAURANT" in tokens
    assert "GARDEN" in tokens


def test_prompt_states_both_bands_and_the_theme() -> None:
    prompt = build_prompt_for_tests(
        _req(theme="Retiring nurse", tone="funny", minLetters=4, maxLetters=7)
    )
    assert "Retiring nurse" in prompt
    assert "4 to 7 letters" in prompt
    assert "18 to 28 letters" in prompt
    assert "witty" in prompt


def test_prompt_asks_for_mixed_lengths_because_the_grid_fills_exactly() -> None:
    prompt = build_prompt_for_tests(_req())
    assert "Mix the lengths" in prompt
    assert "filled exactly" in prompt


def test_custom_message_skips_writing_a_saying() -> None:
    prompt = build_prompt_for_tests(_req(customMessage="Every Day Is Saturday Now"))
    assert "already chosen" in prompt
    assert "Every Day Is Saturday Now" in prompt


def test_custom_message_outside_the_band_is_refused_up_front() -> None:
    with pytest.raises(HiddenMessageGenerationError, match="18-28 letters"):
        asyncio.run(
            generate_hidden_message(_req(customMessage="Too short"), user_id="user-1")
        )


def test_band_order_is_validated() -> None:
    with pytest.raises(ValueError, match="maxLetters"):
        _req(minLetters=8, maxLetters=4)
    with pytest.raises(ValueError, match="maxMessageLetters"):
        _req(minMessageLetters=30, maxMessageLetters=20)


def test_generate_retries_invalid_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    async def fake_gemini(_prompt: str) -> str:
        calls["n"] += 1
        if calls["n"] == 1:
            return "not json"
        if calls["n"] == 2:
            # A saying outside the requested band, and a pool too thin to fill.
            return json.dumps({"message": "Too short", "words": ["Tea"]})
        return json.dumps(VALID)

    monkeypatch.setattr(
        "app.services.studio_hidden_message_service._call_gemini", fake_gemini
    )
    monkeypatch.setattr(
        "app.services.studio_hidden_message_service._check_rate_limit", lambda _uid: None
    )

    result = asyncio.run(generate_hidden_message(_req(), user_id="user-1"))
    assert result.message == "Every Day Is Saturday Now"
    assert len(result.words) >= 20
    assert calls["n"] == 3


def test_generate_gives_up_after_three_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps({"message": "Too short", "words": ["Tea"]})

    monkeypatch.setattr(
        "app.services.studio_hidden_message_service._call_gemini", fake_gemini
    )
    monkeypatch.setattr(
        "app.services.studio_hidden_message_service._check_rate_limit", lambda _uid: None
    )

    with pytest.raises(HiddenMessageGenerationError):
        asyncio.run(generate_hidden_message(_req(seed=1), user_id="user-1"))
