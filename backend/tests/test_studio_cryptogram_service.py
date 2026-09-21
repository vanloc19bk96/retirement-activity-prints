from __future__ import annotations

import asyncio
import json

import pytest

from app.schemas.studio_cryptogram import CryptogramRequest
from app.services.studio_cryptogram_service import (
    CryptogramGenerationError,
    build_prompt_for_tests,
    generate_cryptogram,
    normalize_sayings_for_tests,
    parse_cryptogram_json_for_tests,
)

MEDIUM = {"min_letters": 30, "max_letters": 52}

KIND_WORD = "a kind word costs nothing and warms much"
KIND_WORD_UPPER = "A KIND WORD COSTS NOTHING AND WARMS MUCH"

VALID_SAYINGS = [
    KIND_WORD,
    "small steps still carry you forward now",
    "good friends make the longest days feel light",
    "quiet mornings in the garden restore the heart",
    "a shared meal tastes twice as good at home",
    "free time is best spent with people you love",
]


def test_parse_markdown_fenced_json() -> None:
    raw = "```json\n" + json.dumps({"items": VALID_SAYINGS}) + "\n```"
    data = parse_cryptogram_json_for_tests(raw)
    assert len(data["items"]) == 6


def test_normalize_uppercases_and_strips_punctuation() -> None:
    items = normalize_sayings_for_tests(
        ["A kind word, costs nothing — and warms much!"], want=5, **MEDIUM
    )
    assert items == [KIND_WORD_UPPER]


def test_normalize_drops_out_of_range_lengths() -> None:
    items = normalize_sayings_for_tests(["too short", KIND_WORD], want=5, **MEDIUM)
    assert items == [KIND_WORD_UPPER]


def test_normalize_drops_duplicates_and_single_words() -> None:
    items = normalize_sayings_for_tests(
        [KIND_WORD, KIND_WORD_UPPER, "supercalifragilisticexpialidocious"],
        want=5,
        **MEDIUM,
    )
    assert len(items) == 1


def test_normalize_stops_at_want() -> None:
    items = normalize_sayings_for_tests(VALID_SAYINGS, want=2, **MEDIUM)
    assert len(items) == 2


def test_prompt_rotates_angle_with_seed() -> None:
    first = build_prompt_for_tests(CryptogramRequest(theme="patience", seed=0))
    second = build_prompt_for_tests(CryptogramRequest(theme="patience", seed=1))
    assert first != second


def test_prompt_forbids_attributed_quotes() -> None:
    prompt = build_prompt_for_tests(CryptogramRequest(theme="kindness", seed=3))
    assert "No attributions" in prompt
    assert "original retirement sayings" in prompt


def test_prompt_oversamples_candidates_for_two_puzzles() -> None:
    prompt = build_prompt_for_tests(
        CryptogramRequest(theme="travel dreams", itemCount=2, seed=3)
    )
    assert "Write 8 original retirement sayings" in prompt


def test_generate_returns_uppercase_items(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps({"items": VALID_SAYINGS})

    monkeypatch.setattr(
        "app.services.studio_cryptogram_service._call_gemini", fake_gemini
    )
    monkeypatch.setattr(
        "app.services.studio_cryptogram_service._check_rate_limit", lambda _uid: None
    )

    req = CryptogramRequest(theme="patience", itemCount=2, length="medium", seed=11)
    result = asyncio.run(generate_cryptogram(req, user_id="user-1"))
    assert len(result.items) >= 2
    assert all(item.replace(" ", "").isalpha() for item in result.items)
    assert all(item.isupper() for item in result.items)


def test_generate_raises_when_too_few_usable(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps({"items": ["no", "way"]})

    monkeypatch.setattr(
        "app.services.studio_cryptogram_service._call_gemini", fake_gemini
    )
    monkeypatch.setattr(
        "app.services.studio_cryptogram_service._check_rate_limit", lambda _uid: None
    )

    req = CryptogramRequest(itemCount=2, seed=1)
    with pytest.raises(CryptogramGenerationError, match="too few"):
        asyncio.run(generate_cryptogram(req, user_id="user-1"))
