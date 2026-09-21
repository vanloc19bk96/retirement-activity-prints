from __future__ import annotations

import asyncio
import json

import pytest

from app.schemas.studio_pairs import PairRequest
from app.services.studio_pairs_service import (
    generate_pairs,
    parse_pair_json_for_tests,
    top_up_from_bank_for_tests,
    validate_pairs_for_tests,
)


VALID_PAYLOAD = {
    "sets": [
        {
            "pairs": [
                {"left": "lantern", "right": "biscuit"},
                {"left": "kettle", "right": "feather"},
                {"left": "anchor", "right": "violin"},
                {"left": "mitten", "right": "compass"},
                {"left": "pebble", "right": "ribbon"},
                {"left": "walnut", "right": "scissors"},
            ]
        },
        {
            "pairs": [
                {"left": "teacup", "right": "garden"},
                {"left": "pillow", "right": "staircase"},
                {"left": "button", "right": "window"},
                {"left": "candle", "right": "river"},
                {"left": "hammer", "right": "daisy"},
                {"left": "spoon", "right": "cloud"},
            ]
        },
    ]
}


def test_parse_valid_json() -> None:
    req = PairRequest(pairCount=6, exerciseCount=2, seed=1)
    data = parse_pair_json_for_tests(json.dumps(VALID_PAYLOAD), req)
    assert len(data) == 2
    assert data[0].pairs[0].left == "lantern"


def test_parse_markdown_fenced_json() -> None:
    req = PairRequest(pairCount=6, exerciseCount=2, seed=1)
    raw = "```json\n" + json.dumps(VALID_PAYLOAD) + "\n```"
    data = parse_pair_json_for_tests(raw, req)
    assert data[1].pairs[0].left == "teacup"


def test_rejects_duplicate_words_in_set() -> None:
    req = PairRequest(pairCount=4, exerciseCount=1, seed=1)
    bad = [
        {
            "pairs": [
                {"left": "apple", "right": "chair"},
                {"left": "kite", "right": "apple"},
                {"left": "drum", "right": "ladder"},
                {"left": "cloud", "right": "spoon"},
            ]
        }
    ]
    assert validate_pairs_for_tests(bad, req) == []


def test_arbitrary_rejects_known_collocations() -> None:
    req = PairRequest(pairType="arbitrary", pairCount=4, exerciseCount=1, seed=1)
    bad = [
        {
            "pairs": [
                {"left": "bread", "right": "butter"},
                {"left": "lantern", "right": "biscuit"},
                {"left": "kettle", "right": "feather"},
                {"left": "anchor", "right": "violin"},
            ]
        }
    ]
    assert validate_pairs_for_tests(bad, req) == []


def test_related_allows_collocations() -> None:
    req = PairRequest(pairType="related", pairCount=4, exerciseCount=1, seed=1)
    good = [
        {
            "pairs": [
                {"left": "bread", "right": "butter"},
                {"left": "salt", "right": "pepper"},
                {"left": "needle", "right": "thread"},
                {"left": "knife", "right": "fork"},
            ]
        }
    ]
    assert len(validate_pairs_for_tests(good, req)) == 1


def test_top_up_from_bank() -> None:
    req = PairRequest(pairType="arbitrary", pairCount=6, exerciseCount=5, seed=3)
    filled = top_up_from_bank_for_tests([], req, seed=3)
    assert len(filled) == 5
    assert all(len(s.pairs) == 6 for s in filled)


def test_generate_uses_model_then_top_up(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps(VALID_PAYLOAD)

    monkeypatch.setattr(
        "app.services.studio_pairs_service._call_gemini",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_pairs_service._check_rate_limit",
        lambda _uid: None,
    )

    req = PairRequest(pairType="arbitrary", pairCount=6, exerciseCount=4, seed=7)
    result = asyncio.run(generate_pairs(req, user_id="user-1"))
    assert len(result.sets) == 4
    assert result.sets[0].pairs[0].left == "lantern"
