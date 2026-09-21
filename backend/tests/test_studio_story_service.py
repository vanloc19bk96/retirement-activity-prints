from __future__ import annotations

import asyncio
import json

import pytest
from pydantic import ValidationError

from app.schemas.studio_story import StoryRecallRequest
from app.services.studio_story_service import (
    StoryGenerationError,
    count_words_for_tests,
    generate_story_recall,
    is_passage_too_short_for_tests,
    parse_story_json_for_tests,
    validate_story_shape_for_tests,
)


VALID_PAYLOAD = {
    "title": "The Lost Umbrella",
    "passage": "On Tuesday, Mara left her blue umbrella on the bus.",
    "questions": [
        {"wh": "when", "question": "What day?", "answer": "Tuesday"},
        {"wh": "what", "question": "What color?", "answer": "Blue"},
        {"wh": "where", "question": "Where?", "answer": "On the bus"},
        {"wh": "who", "question": "Who?", "answer": "Mara"},
        {"wh": "howmany", "question": "How many?", "answer": "One"},
    ],
}


def test_parse_valid_json() -> None:
    raw = json.dumps(
        {
            "title": "T",
            "passage": "P",
            "questions": [
                {"wh": "who", "question": "Q1", "answer": "A1"},
                {"wh": "what", "question": "Q2", "answer": "A2"},
                {"wh": "where", "question": "Q3", "answer": "A3"},
            ],
        }
    )
    data = parse_story_json_for_tests(raw)
    assert data["passage"] == "P"
    assert len(data["questions"]) == 3


def test_parse_markdown_fenced_json() -> None:
    raw = (
        "```json\n"
        + json.dumps(
            {
                "title": "T",
                "passage": "P",
                "questions": [
                    {"wh": "who", "question": "Q1", "answer": "A1"},
                    {"wh": "what", "question": "Q2", "answer": "A2"},
                    {"wh": "where", "question": "Q3", "answer": "A3"},
                ],
            }
        )
        + "\n```"
    )
    data = parse_story_json_for_tests(raw)
    assert data["title"] == "T"


def test_missing_passage_raises() -> None:
    with pytest.raises(ValueError, match="missing passage"):
        validate_story_shape_for_tests(
            {"title": "T", "questions": VALID_PAYLOAD["questions"]}
        )


def test_generate_caps_question_count(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str, *, max_output_tokens: int) -> str:
        assert max_output_tokens > 0
        # Long enough to skip the length-retry path for short.
        long_enough = " ".join(["word"] * 80)
        payload = {**VALID_PAYLOAD, "passage": long_enough}
        return json.dumps(payload)

    monkeypatch.setattr(
        "app.services.studio_story_service._call_gemini",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_story_service._check_rate_limit",
        lambda _uid: None,
    )

    req = StoryRecallRequest(
        theme="everyday life",
        length="short",
        questionCount=3,
        seed=7,
    )
    result = asyncio.run(generate_story_recall(req, user_id="user-1"))
    assert result.title == "The Lost Umbrella"
    assert len(result.questions) == 3
    assert result.questions[0].id == "q1"


def test_too_few_questions_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str, *, max_output_tokens: int) -> str:
        return json.dumps(
            {
                "title": "T",
                "passage": " ".join(["word"] * 80),
                "questions": [
                    {"wh": "who", "question": "Q1", "answer": "A1"},
                    {"wh": "what", "question": "Q2", "answer": "A2"},
                ],
            }
        )

    monkeypatch.setattr(
        "app.services.studio_story_service._call_gemini",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_story_service._check_rate_limit",
        lambda _uid: None,
    )

    req = StoryRecallRequest(questionCount=5, seed=1, length="short")
    with pytest.raises(StoryGenerationError, match="too few"):
        asyncio.run(generate_story_recall(req, user_id="user-1"))


def test_retries_when_medium_passage_too_short(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []

    async def fake_gemini(prompt: str, *, max_output_tokens: int) -> str:
        calls.append(prompt)
        questions = VALID_PAYLOAD["questions"]
        if len(calls) == 1:
            return json.dumps(
                {
                    "title": "Short Draft",
                    "passage": " ".join(["tiny"] * 95),
                    "questions": questions,
                }
            )
        return json.dumps(
            {
                "title": "Expanded Draft",
                "passage": " ".join(["longer"] * 250),
                "questions": questions,
            }
        )

    monkeypatch.setattr(
        "app.services.studio_story_service._call_gemini",
        fake_gemini,
    )
    monkeypatch.setattr(
        "app.services.studio_story_service._check_rate_limit",
        lambda _uid: None,
    )

    req = StoryRecallRequest(length="medium", questionCount=5, seed=3)
    result = asyncio.run(generate_story_recall(req, user_id="user-1"))
    assert len(calls) == 2
    assert "too short" in calls[1].lower()
    assert count_words_for_tests(result.passage) == 250
    assert result.title == "Expanded Draft"


def test_medium_under_95_words_is_too_short() -> None:
    short = " ".join(["word"] * 95)
    assert is_passage_too_short_for_tests(short, "medium") is True
    assert is_passage_too_short_for_tests(" ".join(["word"] * 250), "medium") is False


def test_question_count_out_of_range_rejected() -> None:
    with pytest.raises(ValidationError):
        StoryRecallRequest(questionCount=2)
    with pytest.raises(ValidationError):
        StoryRecallRequest(questionCount=9)

