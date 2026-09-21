from __future__ import annotations

import asyncio
import json

import pytest

from app.schemas.studio_sequence import SequenceRequest
from app.services.studio_sequence_service import (
    generate_sequences,
    parse_sequence_json_for_tests,
    top_up_from_bank_for_tests,
    validate_sequences_for_tests,
)


VALID_PAYLOAD = {
    "sequences": [
        {
            "items": [
                {"text": "Apple"},
                {"text": "Chair"},
                {"text": "Kite"},
                {"text": "Drum"},
                {"text": "Ladder"},
            ]
        },
        {
            "title": "Making a cup of tea",
            "items": [
                {"text": "Boil the kettle"},
                {"text": "Warm the pot"},
                {"text": "Add the tea"},
                {"text": "Pour the water"},
                {"text": "Let it brew"},
            ],
        },
    ]
}


def test_parse_valid_json() -> None:
    req = SequenceRequest(itemCount=5, sequenceCount=2, seed=1)
    data = parse_sequence_json_for_tests(json.dumps(VALID_PAYLOAD), req)
    assert len(data) == 2
    assert data[0].items[0].text == "Apple"


def test_parse_markdown_fenced_json() -> None:
    req = SequenceRequest(
        sequenceType="steps", itemCount=5, sequenceCount=2, seed=1
    )
    raw = "```json\n" + json.dumps(VALID_PAYLOAD) + "\n```"
    data = parse_sequence_json_for_tests(raw, req)
    assert data[1].title == "Making a cup of tea"


def test_strips_title_for_arbitrary() -> None:
    payload = {
        "sequences": [
            {
                "title": "Unrelated Objects",
                "items": [
                    {"text": "Apple"},
                    {"text": "Chair"},
                    {"text": "Kite"},
                    {"text": "Drum"},
                    {"text": "Ladder"},
                ],
            }
        ]
    }
    req = SequenceRequest(
        sequenceType="arbitrary", itemCount=5, sequenceCount=1, seed=1
    )
    data = parse_sequence_json_for_tests(json.dumps(payload), req)
    assert len(data) == 1
    assert data[0].title is None


def test_rejects_overlong_items() -> None:
    req = SequenceRequest(itemCount=4, sequenceCount=1, seed=1)
    bad = [
        {
            "items": [
                {"text": "one two three four five six"},
                {"text": "Chair"},
                {"text": "Kite"},
                {"text": "Drum"},
            ]
        }
    ]
    assert validate_sequences_for_tests(bad, req) == []


def test_rejects_duplicate_items() -> None:
    req = SequenceRequest(itemCount=4, sequenceCount=1, seed=1)
    bad = [
        {
            "items": [
                {"text": "Apple"},
                {"text": "apple"},
                {"text": "Kite"},
                {"text": "Drum"},
            ]
        }
    ]
    assert validate_sequences_for_tests(bad, req) == []


def test_top_up_from_bank() -> None:
    req = SequenceRequest(
        sequenceType="arbitrary", itemCount=5, sequenceCount=5, seed=3
    )
    filled = top_up_from_bank_for_tests([], req, seed=3)
    assert len(filled) == 5
    assert all(len(s.items) == 5 for s in filled)


def test_generate_uses_model_then_top_up(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps(VALID_PAYLOAD)

    monkeypatch.setattr(
        "app.services.studio_sequence_service._call_gemini",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_sequence_service._check_rate_limit",
        lambda _uid: None,
    )

    req = SequenceRequest(
        sequenceType="arbitrary", itemCount=5, sequenceCount=4, seed=7
    )
    result = asyncio.run(generate_sequences(req, user_id="user-1"))
    assert len(result.sequences) == 4
    assert result.sequences[0].items[0].text == "Apple"
