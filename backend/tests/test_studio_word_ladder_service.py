from __future__ import annotations

import asyncio
import json

import pytest

from app.schemas.studio_word_ladder import WordLadderRequest
from app.services.studio_gemini import StudioGenerationError
from app.services.studio_word_ladder_service import (
    WordLadderGenerationError,
    build_prompt_for_tests,
    generate_word_ladder,
    normalize_pairs_for_tests,
)

SHAPE = {"length": 4, "steps": 4, "want": 6}

VALID_PAIRS = [
    {"start": "cold", "target": "warm", "path": ["cold", "cord", "word", "ward", "warm"]},
    {"start": "head", "target": "tail", "path": []},
    {"start": "milk", "target": "malt", "path": []},
    {"start": "sand", "target": "sail", "path": []},
    {"start": "boat", "target": "bear", "path": []},
    {"start": "rain", "target": "raft", "path": []},
]


def _pairs(raw: list[dict[str, object]], **overrides: int) -> list:
    return normalize_pairs_for_tests(raw, **{**SHAPE, **overrides})


def test_normalize_uppercases_and_drops_non_letters() -> None:
    pairs = _pairs([{"start": "co-ld", "target": "wa rm"}])
    assert [(p.start, p.target) for p in pairs] == [("COLD", "WARM")]


def test_normalize_drops_wrong_length_words() -> None:
    pairs = _pairs([{"start": "cold", "target": "warmer"}, {"start": "milk", "target": "malt"}])
    assert [p.start for p in pairs] == ["MILK"]


def test_normalize_drops_pairs_further_apart_than_the_step_count() -> None:
    # Four differing letters cannot be walked in three moves.
    assert _pairs([{"start": "cold", "target": "warm"}], steps=3) == []
    assert len(_pairs([{"start": "cold", "target": "warm"}], steps=4)) == 1


def test_normalize_drops_identical_and_reused_words() -> None:
    pairs = _pairs(
        [
            {"start": "milk", "target": "milk"},
            {"start": "cold", "target": "cord"},
            {"start": "cord", "target": "ward"},
        ]
    )
    assert [(p.start, p.target) for p in pairs] == [("COLD", "CORD")]


def test_normalize_keeps_a_chain_whose_every_rung_moves_one_letter() -> None:
    pairs = _pairs([VALID_PAIRS[0]])
    assert pairs[0].path == ["COLD", "CORD", "WORD", "WARD", "WARM"]


def test_normalize_drops_a_broken_chain_but_keeps_the_pair() -> None:
    """A model chain is a shortcut, never a requirement — the client can solve it."""
    broken = [
        # Two letters change between CORD and WARM.
        {"start": "cold", "target": "warm", "path": ["cold", "cord", "warm", "ward", "warm"]},
        # Right shape, wrong length.
        {"start": "milk", "target": "malt", "path": ["milk", "malk", "malt"]},
        # Ends do not match the pair.
        {"start": "sand", "target": "sail", "path": ["sand", "band", "bail", "sail", "salt"]},
    ]
    pairs = _pairs(broken)
    assert len(pairs) == 3
    assert all(pair.path == [] for pair in pairs)


def test_normalize_stops_at_the_requested_count() -> None:
    assert len(_pairs(VALID_PAIRS, want=3)) == 3


def test_prompt_carries_the_shape_and_theme() -> None:
    prompt = build_prompt_for_tests(
        WordLadderRequest(theme="things in a kitchen", wordLength=5, steps=3, seed=2)
    )
    assert "things in a kitchen" in prompt
    assert "EXACTLY 5 letters" in prompt
    assert "AT MOST 3 positions" in prompt
    # path length = steps + 1
    assert "as 4 words of 5 letters" in prompt


def test_prompt_rotates_variety_with_seed() -> None:
    first = build_prompt_for_tests(WordLadderRequest(theme="weather", seed=0))
    second = build_prompt_for_tests(WordLadderRequest(theme="weather", seed=1))
    assert first != second


def test_generate_returns_pairs(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps({"pairs": VALID_PAIRS})

    monkeypatch.setattr(
        "app.services.studio_word_ladder_service._call_gemini", fake_gemini
    )
    monkeypatch.setattr(
        "app.services.studio_word_ladder_service._check_rate_limit", lambda _uid: None
    )

    req = WordLadderRequest(theme="weather", wordLength=4, steps=4, pairCount=4, seed=5)
    result = asyncio.run(generate_word_ladder(req, user_id="user-1"))
    assert len(result.pairs) == 4
    assert all(
        pair.start.isalpha() and pair.start.isupper() for pair in result.pairs
    )


def test_generate_raises_when_too_few_usable(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps({"pairs": [{"start": "kettle", "target": "teapot"}]})

    monkeypatch.setattr(
        "app.services.studio_word_ladder_service._call_gemini", fake_gemini
    )
    monkeypatch.setattr(
        "app.services.studio_word_ladder_service._check_rate_limit", lambda _uid: None
    )

    req = WordLadderRequest(theme="kitchen", pairCount=3, seed=1)
    with pytest.raises(WordLadderGenerationError, match="enough themed words"):
        asyncio.run(generate_word_ladder(req, user_id="user-1"))


def test_generate_keeps_the_upstream_message(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        raise StudioGenerationError("model refused the prompt")

    monkeypatch.setattr(
        "app.services.studio_word_ladder_service._call_gemini", fake_gemini
    )
    monkeypatch.setattr(
        "app.services.studio_word_ladder_service._check_rate_limit", lambda _uid: None
    )

    req = WordLadderRequest(theme="kitchen", seed=1)
    with pytest.raises(WordLadderGenerationError, match="model refused the prompt"):
        asyncio.run(generate_word_ladder(req, user_id="user-1"))
