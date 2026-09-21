from __future__ import annotations

import asyncio
import json

import pytest
from pydantic import ValidationError

from app.schemas.studio_category_fluency import CategoryFluencyRequest
from app.services.studio_category_fluency_service import (
    CategoryFluencyGenerationError,
    generate_category_fluency,
    parse_category_json_for_tests,
    validate_category_shape_for_tests,
)


VALID_PAYLOAD = {
    "category": "Animals",
    "examples": [
        "dog",
        "cat",
        "horse",
        "tiger",
        "whale",
        "eagle",
        "bee",
        "frog",
        "lion",
        "bear",
    ],
}


def test_parse_valid_json() -> None:
    data = parse_category_json_for_tests(json.dumps(VALID_PAYLOAD))
    assert data["category"] == "Animals"
    assert len(data["examples"]) == 10


def test_parse_markdown_fenced_json() -> None:
    raw = "```json\n" + json.dumps(VALID_PAYLOAD) + "\n```"
    data = parse_category_json_for_tests(raw)
    assert data["category"] == "Animals"


def test_missing_category_raises() -> None:
    with pytest.raises(ValueError, match="missing category"):
        validate_category_shape_for_tests({"examples": VALID_PAYLOAD["examples"]})


def test_generate_strips_and_dedupes(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps(
            {
                "category": "  Fruits  ",
                "examples": [
                    " apple ",
                    "Banana",
                    "APPLE",
                    "pear",
                    "orange",
                    "grape",
                    "kiwi",
                    "mango",
                    "peach",
                    "plum",
                ],
            }
        )

    monkeypatch.setattr(
        "app.services.studio_category_fluency_service._call_gemini",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_category_fluency_service._check_rate_limit",
        lambda _uid: None,
    )

    req = CategoryFluencyRequest(difficulty="easy", seed=7, lineCount=8)
    result = asyncio.run(generate_category_fluency(req, user_id="user-1"))
    assert result.category == "Fruits"
    assert "apple" in result.examples
    assert result.examples.count("apple") == 1
    assert len(result.examples) == 8


def test_returns_exactly_line_count(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps(
            {
                "category": "Colors",
                "examples": [f"color-{i}" for i in range(40)],
            }
        )

    monkeypatch.setattr(
        "app.services.studio_category_fluency_service._call_gemini",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_category_fluency_service._check_rate_limit",
        lambda _uid: None,
    )

    req = CategoryFluencyRequest(seed=1, lineCount=12)
    result = asyncio.run(generate_category_fluency(req, user_id="user-1"))
    assert len(result.examples) == 12


def test_too_few_examples_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps({"category": "Animals", "examples": ["dog", "cat"]})

    monkeypatch.setattr(
        "app.services.studio_category_fluency_service._call_gemini",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_category_fluency_service._check_rate_limit",
        lambda _uid: None,
    )

    req = CategoryFluencyRequest(seed=1, lineCount=10)
    with pytest.raises(CategoryFluencyGenerationError, match="too little"):
        asyncio.run(generate_category_fluency(req, user_id="user-1"))


def test_category_hint_max_length_rejected() -> None:
    with pytest.raises(ValidationError):
        CategoryFluencyRequest(categoryHint="x" * 121)


def test_line_count_bounds() -> None:
    with pytest.raises(ValidationError):
        CategoryFluencyRequest(lineCount=7)
    with pytest.raises(ValidationError):
        CategoryFluencyRequest(lineCount=31)
