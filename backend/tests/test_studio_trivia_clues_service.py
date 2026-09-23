from __future__ import annotations

import asyncio
import json

import pytest

from app.schemas.studio_trivia_clues import TriviaCluesRequest
from app.services.studio_trivia_clues_service import (
    TriviaCluesGenerationError,
    build_prompt_for_tests,
    filter_pairs_for_tests,
    generate_trivia_clues,
    parse_payload_for_tests,
)

# Single A-Z answers of four to seven letters, no palindromes, nothing nested
# inside anything else, and no clue that prints its own answer — a pool shaped
# like the one the classic level asks for.
VALID_ITEMS = [
    {"answer": "GARDEN", "clue": "Where roses and tomatoes are grown"},
    {"answer": "TRAVEL", "clue": "To journey far from home"},
    {"answer": "CRUISE", "clue": "A holiday taken aboard a ship"},
    {"answer": "FAMILY", "clue": "Your relatives, all together"},
    {"answer": "HOBBY", "clue": "A pastime you take up for pleasure"},
    {"answer": "SUNSET", "clue": "The sky at the end of the day"},
    {"answer": "FRIEND", "clue": "Someone you meet for coffee"},
    {"answer": "NATURE", "clue": "Woods, fields and wild things"},
    {"answer": "READING", "clue": "What you do with a good book"},
    {"answer": "SAILING", "clue": "Moving across water by wind"},
    {"answer": "FREEDOM", "clue": "Having no one to answer to"},
    {"answer": "JOURNEY", "clue": "A long trip from place to place"},
    {"answer": "WEEKEND", "clue": "Saturday and Sunday together"},
    {"answer": "PICNIC", "clue": "A meal eaten on a rug outdoors"},
    {"answer": "LEISURE", "clue": "Time that is entirely your own"},
    {"answer": "PENSION", "clue": "Money paid after your working years"},
    {"answer": "HAMMOCK", "clue": "A hanging bed slung between trees"},
    {"answer": "PORCH", "clue": "A covered step at the front door"},
    {"answer": "QUILT", "clue": "A warm cover stitched in patches"},
    {"answer": "BENCH", "clue": "A long seat in a park"},
    {"answer": "WALK", "clue": "A gentle stroll for exercise"},
    {"answer": "LAKE", "clue": "Still water ringed by shore"},
    {"answer": "BIRD", "clue": "It sings in the hedge at dawn"},
    {"answer": "SOFA", "clue": "The soft seat in a living room"},
]

VALID = {"items": VALID_ITEMS}


def _req(**overrides) -> TriviaCluesRequest:
    base = {
        "theme": "Life after work",
        "difficulty": "medium",
        "count": 20,
        "minLetters": 4,
        "maxLetters": 8,
        "maxClueChars": 54,
        "seed": 7,
    }
    base.update(overrides)
    return TriviaCluesRequest(**base)


def _answers(items) -> list[str]:
    return [item.answer for item in items]


def test_parse_valid_json() -> None:
    items = parse_payload_for_tests(json.dumps(VALID))
    assert len(items) == len(VALID_ITEMS)


def test_parse_invalid_json_raises() -> None:
    with pytest.raises(ValueError, match="valid JSON"):
        parse_payload_for_tests("not json")


def test_parse_missing_items_raises() -> None:
    with pytest.raises(ValueError, match="missing"):
        parse_payload_for_tests(json.dumps({"words": ["nope"]}))


def test_letter_band_is_enforced_on_the_answers() -> None:
    items = filter_pairs_for_tests(
        [
            {"answer": "TEA", "clue": "A hot drink poured from a pot"},
            {"answer": "GARDEN", "clue": "Where roses and tomatoes are grown"},
            {"answer": "CONSERVATORY", "clue": "A glass room built onto a house"},
        ],
        low=4,
        high=8,
    )
    answers = _answers(items)
    # Three letters is under the floor; twelve is over the ceiling.
    assert "TEA" not in answers
    assert "CONSERVATORY" not in answers
    assert "GARDEN" in answers


def test_answers_must_be_one_word() -> None:
    # The grid prints one unbroken run of cells, so a phrase would advertise a
    # letter count the puzzle does not have.
    items = filter_pairs_for_tests(
        [
            {"answer": "ROAD TRIP", "clue": "A holiday taken by car"},
            {"answer": "CATCH-UP", "clue": "A chat with an old workmate"},
            {"answer": "GARDEN", "clue": "Where roses and tomatoes are grown"},
        ]
    )
    assert _answers(items) == ["GARDEN"]


def test_filter_drops_palindrome_nested_and_unsafe_pairs() -> None:
    items = filter_pairs_for_tests(
        [
            {"answer": "LEVEL", "clue": "Flat and even, like good ground"},
            {"answer": "GARDENING", "clue": "Working among the flower beds"},
            {"answer": "GARDEN", "clue": "Where roses and tomatoes are grown"},
            {"answer": "DISNEY", "clue": "A famous film studio in California"},
            {"answer": "FRAIL", "clue": "Weak and easily broken"},
        ],
        low=4,
        high=10,
    )
    answers = _answers(items)
    # A palindrome reads both ways, so the key can only circle one of two.
    assert "LEVEL" not in answers
    # Circling GARDENING circles GARDEN, so one mark would answer two clues.
    assert "GARDEN" not in answers
    assert "GARDENING" in answers
    # Neither of these belongs in a book sold on KDP.
    assert "DISNEY" not in answers
    assert "FRAIL" not in answers


def test_filter_drops_a_clue_that_gives_its_answer_away() -> None:
    items = filter_pairs_for_tests(
        [
            {"answer": "GARDEN", "clue": "The garden behind the house"},
            {"answer": "PENSION", "clue": "The pensions paid after work"},
            {"answer": "PICNIC", "clue": "A meal eaten on a rug outdoors"},
        ]
    )
    assert _answers(items) == ["PICNIC"]


def test_filter_drops_recall_trivia_and_duplicate_clues() -> None:
    items = filter_pairs_for_tests(
        [
            {"answer": "SUNSET", "clue": "The sky at the end of the day"},
            {"answer": "CRUISE", "clue": "The sky at the end of the day!"},
            {"answer": "PICNIC", "clue": "How many people fit on one rug"},
            {"answer": "GARDEN", "clue": "A place first planted in 1964"},
        ]
    )
    answers = _answers(items)
    assert answers == ["SUNSET"]


def test_filter_drops_a_clue_too_long_for_the_printed_column() -> None:
    items = filter_pairs_for_tests(
        [
            {
                "answer": "GARDEN",
                "clue": "The patch of ground behind a house where "
                "flowers and vegetables are grown each year",
            },
            {"answer": "PICNIC", "clue": "A meal eaten on a rug outdoors"},
        ],
        budget=54,
    )
    assert _answers(items) == ["PICNIC"]


def test_filter_strips_a_length_hint_the_model_added() -> None:
    items = filter_pairs_for_tests(
        [{"answer": "GARDEN", "clue": "Where roses are grown (6)"}]
    )
    # The page computes its own count from the grid; two disagreeing counts on
    # one line is worse than none.
    assert items[0].clue == "Where roses are grown"


def test_prompt_states_the_bands_the_page_cannot_widen() -> None:
    prompt = build_prompt_for_tests(
        _req(theme="Retiring nurse", minLetters=4, maxLetters=7, maxClueChars=46)
    )
    assert "Retiring nurse" in prompt
    assert "4 to 7 letters" in prompt
    assert "at most 46 characters" in prompt
    assert "ONE English word" in prompt


def test_prompt_demands_one_answer_per_clue() -> None:
    prompt = build_prompt_for_tests(_req())
    assert "Exactly one sensible answer" in prompt
    assert "no answer contained inside another" in prompt
    assert "Never contains the answer" in prompt


def test_band_order_is_validated() -> None:
    with pytest.raises(ValueError, match="maxLetters"):
        _req(minLetters=8, maxLetters=4)


def test_generate_retries_invalid_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    async def fake_gemini(_prompt: str) -> str:
        calls["n"] += 1
        if calls["n"] == 1:
            return "not json"
        if calls["n"] == 2:
            # A pool too thin for the page to fill its clue list from.
            return json.dumps({"items": VALID_ITEMS[:3]})
        return json.dumps(VALID)

    monkeypatch.setattr(
        "app.services.studio_trivia_clues_service._call_gemini", fake_gemini
    )
    monkeypatch.setattr(
        "app.services.studio_trivia_clues_service._check_rate_limit", lambda _uid: None
    )

    result = asyncio.run(generate_trivia_clues(_req(), user_id="user-1"))
    assert len(result.items) >= 14
    assert all(item.answer.isalpha() and item.answer.isupper() for item in result.items)
    assert calls["n"] == 3


def test_generate_gives_up_after_three_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps({"items": VALID_ITEMS[:2]})

    monkeypatch.setattr(
        "app.services.studio_trivia_clues_service._call_gemini", fake_gemini
    )
    monkeypatch.setattr(
        "app.services.studio_trivia_clues_service._check_rate_limit", lambda _uid: None
    )

    with pytest.raises(TriviaCluesGenerationError):
        asyncio.run(generate_trivia_clues(_req(seed=1), user_id="user-1"))
