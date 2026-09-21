from __future__ import annotations

import asyncio
import json

import pytest
from pydantic import ValidationError

from app.schemas.studio_first_letter_recall import FirstLetterRecallRequest
from app.services.studio_first_letter_recall_service import (
    FirstLetterRecallGenerationError,
    generate_first_letter_recall,
    parse_first_letter_payload_for_tests,
)


VALID_PAYLOAD = {
    "byLetter": {
        "F": [
            "fish",
            "fork",
            "flower",
            "fence",
            "forest",
            "family",
            "friend",
            "finger",
            "feather",
            "fountain",
        ]
    }
}


def test_parse_valid_json() -> None:
    data = parse_first_letter_payload_for_tests(
        json.dumps(VALID_PAYLOAD), ["F"], line_count=10
    )
    assert "F" in data
    assert len(data["F"]) == 10


def test_letters_normalized_and_deduped() -> None:
    req = FirstLetterRecallRequest(letters=["f", "F", "a"], seed=1)
    assert req.letters == ["F", "A"]


def test_invalid_letter_rejected() -> None:
    with pytest.raises(ValidationError):
        FirstLetterRecallRequest(letters=["1"], seed=1)


def test_generate_strips_and_filters(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(*, prompt: str, **_kwargs: object) -> str:
        del prompt
        return json.dumps(
            {
                "byLetter": {
                    "F": [
                        " fish ",
                        "Fork",
                        "FISH",
                        "apple",
                        "flower",
                        "fence",
                        "forest",
                        "family",
                        "friend",
                        "finger",
                        "feather",
                    ]
                }
            }
        )

    monkeypatch.setattr(
        "app.services.studio_first_letter_recall_service.call_gemini_json",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_first_letter_recall_service._check_rate_limit",
        lambda _uid: None,
    )

    req = FirstLetterRecallRequest(letters=["F"], seed=7, lineCount=8)
    result = asyncio.run(generate_first_letter_recall(req, user_id="user-1"))
    assert "F" in result.by_letter
    words = result.by_letter["F"]
    assert "fish" in words
    assert words.count("fish") == 1
    assert "apple" not in words
    assert all(w[:1].upper() == "F" for w in words)
    assert len(words) == 8


def test_returns_exactly_line_count(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(*, prompt: str, **_kwargs: object) -> str:
        del prompt
        return json.dumps(
            {"byLetter": {"F": [f"food-{i}" for i in range(40)]}}
        )

    monkeypatch.setattr(
        "app.services.studio_first_letter_recall_service.call_gemini_json",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_first_letter_recall_service._check_rate_limit",
        lambda _uid: None,
    )

    req = FirstLetterRecallRequest(letters=["F"], seed=1, lineCount=12)
    result = asyncio.run(generate_first_letter_recall(req, user_id="user-1"))
    assert len(result.by_letter["F"]) == 12


def test_too_few_examples_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(*, prompt: str, **_kwargs: object) -> str:
        del prompt
        return json.dumps({"byLetter": {"F": ["fish", "fork"]}})

    monkeypatch.setattr(
        "app.services.studio_first_letter_recall_service.call_gemini_json",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_first_letter_recall_service._check_rate_limit",
        lambda _uid: None,
    )

    req = FirstLetterRecallRequest(letters=["F"], seed=1, lineCount=10)
    with pytest.raises(FirstLetterRecallGenerationError):
        asyncio.run(generate_first_letter_recall(req, user_id="user-1"))


def test_line_count_bounds() -> None:
    with pytest.raises(ValidationError):
        FirstLetterRecallRequest(letters=["F"], lineCount=7)
    with pytest.raises(ValidationError):
        FirstLetterRecallRequest(letters=["F"], lineCount=31)
