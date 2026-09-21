from __future__ import annotations

import asyncio
import json

import pytest
from pydantic import ValidationError

from app.schemas.studio_list import ListRecallRequest
from app.services.studio_list_service import (
    ListGenerationError,
    generate_list_recall,
    parse_list_json_for_tests,
    validate_list_shape_for_tests,
)


VALID_PAYLOAD = {
    "targets": [
        "Whole milk",
        "Bread",
        "Apples",
        "Carrots",
        "Eggs",
        "Cheese",
        "Coffee",
        "Bananas",
    ],
    "distractors": [
        {"label": "Skim milk", "tier": "qualitative"},
        {"label": "Pears", "tier": "category"},
        {"label": "Onions", "tier": "plain"},
        {"label": "Yogurt", "tier": "plain"},
        {"label": "Rice", "tier": "plain"},
        {"label": "Soap", "tier": "plain"},
        {"label": "Tea", "tier": "plain"},
        {"label": "Crackers", "tier": "plain"},
    ],
}


def test_parse_valid_json() -> None:
    data = parse_list_json_for_tests(json.dumps(VALID_PAYLOAD))
    assert len(data["targets"]) == 8
    assert len(data["distractors"]) == 8


def test_parse_markdown_fenced_json() -> None:
    raw = "```json\n" + json.dumps(VALID_PAYLOAD) + "\n```"
    data = parse_list_json_for_tests(raw)
    assert data["targets"][0] == "Whole milk"


def test_missing_targets_raises() -> None:
    with pytest.raises(ValueError, match="missing targets"):
        validate_list_shape_for_tests({"distractors": VALID_PAYLOAD["distractors"]})


def test_accepts_string_distractors() -> None:
    data = validate_list_shape_for_tests(
        {
            "targets": VALID_PAYLOAD["targets"],
            "distractors": ["Dish soap", "Skim milk"],
        }
    )
    assert data["distractors"] == [
        {"label": "Dish soap", "tier": "plain"},
        {"label": "Skim milk", "tier": "plain"},
    ]


def test_prefers_mapping_when_distractors_are_strings() -> None:
    data = validate_list_shape_for_tests(
        {
            "targets": VALID_PAYLOAD["targets"],
            "distractors": ["Dish soap", "Skim milk"],
            "mapping": [
                {"label": "Dish soap", "tier": "plain"},
                {"label": "Skim milk", "tier": "qualitative"},
            ],
        }
    )
    assert data["distractors"][1]["tier"] == "qualitative"


def test_generate_builds_shuffled_options(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps(VALID_PAYLOAD)

    monkeypatch.setattr(
        "app.services.studio_list_service._call_gemini",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_list_service._check_rate_limit",
        lambda _uid: None,
    )

    req = ListRecallRequest(listLength=8, distractorCount=8, seed=7)
    result = asyncio.run(generate_list_recall(req, user_id="user-1"))
    assert len(result.targets) == 8
    assert len(result.options) == 16
    assert sum(1 for o in result.options if o.isTarget) == 8
    assert {o.label for o in result.options if o.isTarget} == set(result.targets)


def test_drops_colliding_distractors(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "targets": ["Apples", "Bread", "Milk", "Eggs", "Cheese"],
        "distractors": [
            {"label": "Apples", "tier": "plain"},
            {"label": "Onions", "tier": "plain"},
            {"label": "Soap", "tier": "plain"},
            {"label": "Rice", "tier": "plain"},
        ],
    }

    async def fake_gemini(_prompt: str) -> str:
        return json.dumps(payload)

    monkeypatch.setattr(
        "app.services.studio_list_service._call_gemini",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_list_service._check_rate_limit",
        lambda _uid: None,
    )

    req = ListRecallRequest(listLength=5, distractorCount=4, seed=1)
    result = asyncio.run(generate_list_recall(req, user_id="user-1"))
    labels = [o.label for o in result.options]
    assert labels.count("Apples") == 1


def test_too_few_targets_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps(
            {
                "targets": ["A", "B", "C"],
                "distractors": [{"label": "D", "tier": "plain"}],
            }
        )

    monkeypatch.setattr(
        "app.services.studio_list_service._call_gemini",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_list_service._check_rate_limit",
        lambda _uid: None,
    )

    req = ListRecallRequest(listLength=5, distractorCount=4, seed=1)
    with pytest.raises(ListGenerationError, match="too few"):
        asyncio.run(generate_list_recall(req, user_id="user-1"))


def test_list_length_out_of_range_rejected() -> None:
    with pytest.raises(ValidationError):
        ListRecallRequest(listLength=4)
    with pytest.raises(ValidationError):
        ListRecallRequest(listLength=21)
    ListRecallRequest(listLength=20)
