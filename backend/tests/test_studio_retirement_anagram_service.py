from __future__ import annotations

import asyncio
import json

import pytest
from pydantic import ValidationError

from app.schemas.studio_retirement_anagram import RetirementAnagramRequest
from app.services.studio_retirement_anagram_service import (
    RetirementAnagramGenerationError,
    build_prompt_for_tests,
    generate_retirement_anagram,
    normalize_items_for_tests,
    parse_json_for_tests,
)


def item(word: str, clue: str) -> dict[str, str]:
    return {"word": word, "clue": clue}


VALID_PAYLOAD = {
    "items": [
        item("TRAVEL", "Seeing places far from home"),
        item("PENSION", "Money paid after working life"),
        item("CRUISE", "A holiday spent at sea"),
        item("FAMILY", "Everyone at the Sunday table"),
        item("LEISURE", "Time that is entirely your own"),
        item("MEMORY", "Something you look back on"),
        item("PICNIC", "Lunch on a rug in the park"),
        item("MARKET", "Stalls on a Saturday morning"),
        item("TEAPOT", "It pours the morning brew"),
        item("MEADOW", "A field of wild flowers"),
        item("BLANKET", "Warmth over your knees"),
        item("JOURNEY", "A trip from here to there"),
    ]
}


def request(**overrides: object) -> RetirementAnagramRequest:
    payload: dict[str, object] = {
        "theme": "Retirement Life",
        "count": 12,
        "minLetters": 5,
        "maxLetters": 8,
        "maxClueChars": 42,
        "seed": 1,
    }
    payload.update(overrides)
    return RetirementAnagramRequest(**payload)  # type: ignore[arg-type]


def normalize(raw: list[object], **overrides: int) -> list[str]:
    options = {"min_len": 4, "max_len": 8, "want": 10, "max_clue_chars": 42}
    options.update(overrides)
    return [
        entry.word
        for entry in normalize_items_for_tests(raw, **options)  # type: ignore[arg-type]
    ]


# ------------------------------------------------------------------ parsing


def test_parse_valid_json() -> None:
    assert len(parse_json_for_tests(json.dumps(VALID_PAYLOAD))) == 12


def test_missing_items_raises() -> None:
    with pytest.raises(ValueError, match="missing items"):
        parse_json_for_tests(json.dumps({}))


# --------------------------------------------------------------- the schema


def test_letter_band_must_be_ordered() -> None:
    with pytest.raises(ValidationError, match="maxLetters"):
        request(minLetters=8, maxLetters=5)


# ------------------------------------------------------------- the gate


def test_normalize_filters_length_case_and_dupes() -> None:
    words = normalize(
        [
            item("TRAVEL", "Seeing places far from home"),
            item("travel", "Seeing places far from home"),
            item("AB", "Too short to print"),
            item("TOOLONGWORDXX", "Far too long for the band"),
            item("MEADOW", "A field of wild flowers"),
            "not an object",
        ]
    )
    assert words == ["TRAVEL", "MEADOW"]


def test_normalize_drops_a_clue_that_echoes_its_answer() -> None:
    # A solver who reads the stem has been handed the anagram, not asked it.
    assert normalize([item("TRAVEL", "What a traveller does abroad")]) == []
    assert normalize([item("COOKING", "The art of good COOKING")]) == []


def test_normalize_drops_a_clue_the_column_cannot_hold() -> None:
    assert normalize([item("TRAVEL", "x" * 43)]) == []
    assert normalize([item("TRAVEL", "x" * 43)], max_clue_chars=60) == ["TRAVEL"]


def test_normalize_drops_a_clue_too_short_to_help() -> None:
    assert normalize([item("TRAVEL", "Trip")]) == []


def test_normalize_drops_a_word_with_no_clue() -> None:
    assert normalize([item("TRAVEL", "   ")]) == []


def test_normalize_keeps_one_word_per_letter_set() -> None:
    # Two scrambles a reader cannot tell apart, and a key that can only be right
    # about one of them.
    words = normalize(
        [
            item("TRAVEL", "Seeing places far from home"),
            item("VARLET", "An old word for a servant"),
        ]
    )
    assert words == ["TRAVEL"]


def test_normalize_tidies_the_clue_it_keeps() -> None:
    entries = normalize_items_for_tests(
        [item("TRAVEL", "  seeing   places far from home.  ")],
        min_len=4,
        max_len=8,
        want=5,
        max_clue_chars=42,
    )
    assert entries[0].clue == "Seeing places far from home"


def test_normalize_stops_at_want() -> None:
    assert len(normalize(VALID_PAYLOAD["items"], want=3)) == 3


# ----------------------------------------------------------------- prompt


def test_prompt_carries_the_theme_and_both_budgets() -> None:
    prompt = build_prompt_for_tests(
        request(theme="Gardening", minLetters=4, maxLetters=6, maxClueChars=42, seed=7)
    )
    assert "Gardening" in prompt
    assert "4-6 letters" in prompt
    assert "42 characters" in prompt
    assert '"clue"' in prompt


def test_prompt_rotates_its_angle_with_the_seed() -> None:
    first = build_prompt_for_tests(request(seed=0))
    second = build_prompt_for_tests(request(seed=1))
    assert first != second


# --------------------------------------------------------------- generate


def stub_gemini(monkeypatch: pytest.MonkeyPatch, payload: object) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps(payload)

    monkeypatch.setattr(
        "app.services.studio_retirement_anagram_service._call_gemini",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_retirement_anagram_service._check_rate_limit",
        lambda _uid: None,
    )


def test_generate_returns_words_paired_with_their_clues(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub_gemini(monkeypatch, VALID_PAYLOAD)
    result = asyncio.run(generate_retirement_anagram(request(), user_id="user-1"))

    assert len(result.items) >= 8
    expected = {entry["word"]: entry["clue"] for entry in VALID_PAYLOAD["items"]}
    for entry in result.items:
        assert entry.word.isupper()
        assert 5 <= len(entry.word) <= 8
        assert entry.clue == expected[entry.word]


def test_generate_raises_when_too_few_survive(monkeypatch: pytest.MonkeyPatch) -> None:
    stub_gemini(monkeypatch, {"items": [item("HI", "Too short"), item("BYE", "Also short")]})
    with pytest.raises(RetirementAnagramGenerationError, match="too few"):
        asyncio.run(generate_retirement_anagram(request(), user_id="user-1"))


def test_generate_wraps_a_malformed_reply(monkeypatch: pytest.MonkeyPatch) -> None:
    stub_gemini(monkeypatch, {"words": ["TRAVEL"]})
    with pytest.raises(RetirementAnagramGenerationError, match="valid retirement-anagram"):
        asyncio.run(generate_retirement_anagram(request(), user_id="user-1"))
