from __future__ import annotations

import asyncio
import json

import pytest

from app.schemas.studio_top_five_guess import TopFiveGuessRequest
from app.services.studio_top_five_guess_service import (
    TopFiveGuessGenerationError,
    answers_overlap,
    build_prompt_for_tests,
    filter_sets,
    generate_top_five_guess,
    normalize_answer,
    normalize_question,
    parse_payload_for_tests,
)

SERVICE = "app.services.studio_top_five_guess_service"

VALID_SETS = [
    {
        "question": "Name something you will never miss about the office.",
        "answers": ["The morning commute", "Meetings", "Alarm clocks", "Deadlines", "Office politics"],
    },
    {
        "question": "Name a hobby people finally have time for after they retire.",
        "answers": ["Gardening", "Golf", "Reading", "Painting", "Fishing"],
    },
    {
        "question": "Name something you would pack for a week at the beach.",
        "answers": ["Sunscreen", "Swimsuit", "Towel", "Sunglasses", "A good book"],
    },
    {
        "question": "Name a treat you might enjoy on a lazy Sunday morning.",
        "answers": ["Pancakes", "Fresh coffee", "Croissants", "Bacon and eggs", "Cinnamon rolls"],
    },
]

VALID = {"items": VALID_SETS}


def _req(**overrides) -> TopFiveGuessRequest:
    base = {
        "theme": "Life after work",
        "count": 4,
        "maxQuestionChars": 90,
        "maxAnswerChars": 24,
        "seed": 7,
    }
    base.update(overrides)
    return TopFiveGuessRequest(**base)


def _filter(items, **overrides):
    options = {"question_budget": 90, "answer_budget": 24, "cap": 8}
    options.update(overrides)
    return filter_sets(items, **options)


def _questions(items) -> list[str]:
    return [item.question for item in items]


def test_parse_valid_json() -> None:
    assert len(parse_payload_for_tests(json.dumps(VALID))) == len(VALID_SETS)


def test_parse_invalid_json_raises() -> None:
    with pytest.raises(ValueError, match="valid JSON"):
        parse_payload_for_tests("not json")


def test_parse_missing_items_raises() -> None:
    with pytest.raises(ValueError, match="missing"):
        parse_payload_for_tests(json.dumps({"sets": []}))


def test_valid_sets_survive_with_order_kept() -> None:
    items = _filter(VALID_SETS)
    assert _questions(items) == [s["question"] for s in VALID_SETS]
    assert items[0].answers == VALID_SETS[0]["answers"]
    assert all(len(item.answers) == 5 for item in items)


def test_only_the_first_five_answers_are_read() -> None:
    raw = {**VALID_SETS[1], "answers": [*VALID_SETS[1]["answers"], "Birdwatching"]}
    (item,) = _filter([raw])
    assert item.answers == VALID_SETS[1]["answers"]


def test_a_set_with_fewer_than_five_answers_is_dropped() -> None:
    raw = {**VALID_SETS[1], "answers": VALID_SETS[1]["answers"][:4]}
    assert _filter([raw]) == []


def test_a_bad_answer_drops_the_whole_set_instead_of_promoting_a_sixth() -> None:
    # Promoting "Birdwatching" into fifth place would print a ranking nobody wrote.
    raw = {
        **VALID_SETS[1],
        "answers": ["Gardening", "Golf", "Reading", "Casino trips", "Fishing", "Birdwatching"],
    }
    assert _filter([raw]) == []


def test_overlapping_answers_drop_the_set() -> None:
    raw = {
        "question": "Name something you will never miss about the office.",
        "answers": ["Meetings", "Long meetings", "Too many meetings", "Deadlines", "Commute"],
    }
    assert _filter([raw]) == []


@pytest.mark.parametrize(
    ("first", "second", "expected"),
    [
        ("Meetings", "Too many meetings", True),
        ("Alarm clock", "Early alarms", True),
        ("Rush hour traffic", "Road traffic", True),
        ("Office politics", "Office gossip", False),
        ("The morning commute", "Deadlines", False),
    ],
)
def test_answers_overlap(first: str, second: str, expected: bool) -> None:
    assert answers_overlap(first, second) is expected


def test_answer_repeating_the_question_is_dropped() -> None:
    raw = {
        "question": "Name something you will never miss about the office.",
        "answers": ["The office", "Meetings", "Alarm clocks", "Deadlines", "Commute"],
    }
    assert _filter([raw]) == []


def test_answer_normalisation_strips_ranks_and_stops() -> None:
    assert normalize_answer("1. the morning commute.", budget=24) == "The morning commute"
    assert normalize_answer("#2 Meetings", budget=24) == "Meetings"
    assert normalize_answer("A very long answer that runs well past the budget", budget=24) is None
    assert normalize_answer("Walking the dog in the park", budget=40) is None  # > 4 words


def test_polling_language_and_invented_numbers_are_dropped() -> None:
    assert normalize_question("We asked 100 people to name a hobby they love.", budget=90) is None
    assert normalize_question("Name a hobby most retirees enjoy, per our survey.", budget=90) is None
    assert normalize_answer("Gardening 40%", budget=24) is None
    assert normalize_answer("Golf 25 points", budget=24) is None


@pytest.mark.parametrize(
    "question",
    [
        "Name something people worry about before surgery.",
        "Name a reason retirees go to the hospital.",
        "Name a drink you might order at a casino bar.",
        "Name something that makes old-timers forgetful.",
        "Name a snack you might buy at Starbucks on a trip.",
    ],
)
def test_sensitive_or_branded_questions_are_dropped(question: str) -> None:
    assert normalize_question(question, budget=90) is None


def test_question_budget_and_punctuation() -> None:
    assert normalize_question("name a place you would love to visit", budget=90) == (
        "Name a place you would love to visit?"
    )
    long = "Name something " + "very " * 20 + "nice."
    assert normalize_question(long, budget=90) is None


def test_duplicate_and_near_duplicate_questions_are_dropped() -> None:
    near = {**VALID_SETS[0], "question": "Name something you won't miss about the office."}
    items = _filter([VALID_SETS[0], VALID_SETS[0], near])
    assert _questions(items) == [VALID_SETS[0]["question"]]


def test_questions_with_near_identical_answer_lists_are_dropped() -> None:
    twin = {
        "question": "Name a part of the working week you are glad to leave behind.",
        "answers": ["Commute", "Meetings", "Alarm clocks", "Deadlines", "Dress code"],
    }
    items = _filter([VALID_SETS[0], twin])
    assert _questions(items) == [VALID_SETS[0]["question"]]


def test_avoid_list_drops_questions_the_book_already_printed() -> None:
    items = _filter(VALID_SETS, avoid=[VALID_SETS[0]["question"]])
    assert VALID_SETS[0]["question"] not in _questions(items)


def test_malformed_items_are_ignored() -> None:
    items = _filter(["nope", None, {"question": 5, "answers": "x"}, VALID_SETS[1]])
    assert _questions(items) == [VALID_SETS[1]["question"]]


def test_prompt_states_budgets_and_forbids_polling() -> None:
    prompt = build_prompt_for_tests(_req(maxQuestionChars=80, maxAnswerChars=20))
    assert "at most 80 characters" in prompt
    assert "at most 20 characters" in prompt
    assert "survey" in prompt.lower()
    assert "Exactly five" in prompt


def test_generate_retries_invalid_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    async def fake_gemini(_prompt: str) -> str:
        calls["n"] += 1
        if calls["n"] == 1:
            return "not json"
        return json.dumps(VALID)

    monkeypatch.setattr(f"{SERVICE}._call_gemini", fake_gemini)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)

    result = asyncio.run(generate_top_five_guess(_req(), user_id="user-1"))
    assert len(result.items) == 4
    assert calls["n"] == 2


def test_generate_keeps_sets_across_attempts(monkeypatch: pytest.MonkeyPatch) -> None:
    replies = iter([{"items": VALID_SETS[:1]}, {"items": VALID_SETS[1:]}])

    async def fake_gemini(_prompt: str) -> str:
        return json.dumps(next(replies))

    monkeypatch.setattr(f"{SERVICE}._call_gemini", fake_gemini)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)

    result = asyncio.run(generate_top_five_guess(_req(seed=3), user_id="user-2"))
    assert _questions(result.items) == [s["question"] for s in VALID_SETS]


def test_generate_returns_a_short_pool_rather_than_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps({"items": VALID_SETS[:1]})

    monkeypatch.setattr(f"{SERVICE}._call_gemini", fake_gemini)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)

    result = asyncio.run(generate_top_five_guess(_req(seed=11), user_id="user-3"))
    assert _questions(result.items) == [VALID_SETS[0]["question"]]


def test_generate_gives_up_after_three_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    async def fake_gemini(_prompt: str) -> str:
        calls["n"] += 1
        return json.dumps({"items": [{"question": "Too short?", "answers": []}]})

    monkeypatch.setattr(f"{SERVICE}._call_gemini", fake_gemini)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)

    with pytest.raises(TopFiveGuessGenerationError):
        asyncio.run(generate_top_five_guess(_req(seed=1), user_id="user-4"))
    assert calls["n"] == 3


def test_request_bounds_are_validated() -> None:
    with pytest.raises(ValueError):
        _req(count=20)
    with pytest.raises(ValueError):
        _req(maxAnswerChars=4)
