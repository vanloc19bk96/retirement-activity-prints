from __future__ import annotations

import asyncio
import json

import pytest

from app.schemas.studio_fallen_phrase import FallenPhraseRequest
from app.services.studio_fallen_phrase_service import (
    FallenPhraseGenerationError,
    build_prompt_for_tests,
    generate_fallen_phrase,
    normalize_sayings_for_tests,
    parse_fallen_phrase_json_for_tests,
)

# 40 letters in 13 words — inside the medium band on both counts.
GOOD = "the best part of the day is the one you did not plan"
GOOD_UPPER = "THE BEST PART OF THE DAY IS THE ONE YOU DID NOT PLAN"

VALID_SAYINGS = [
    GOOD,
    "a kind word costs you little and is kept for years",
    "the long way round is the only way worth taking now",
    "a garden asks only that you turn up and then sit down",
    "count the mornings that begin with no plan at all now",
    "the years you gave to work are paid back one day at a time",
]


def test_parse_markdown_fenced_json() -> None:
    raw = "```json\n" + json.dumps({"items": VALID_SAYINGS}) + "\n```"
    data = parse_fallen_phrase_json_for_tests(raw)
    assert len(data["items"]) == 6


def test_normalize_uppercases_and_strips_punctuation() -> None:
    items = normalize_sayings_for_tests(
        ["The best part of the day, is the one you did not plan!"],
        length="medium",
        want=5,
    )
    assert items == [GOOD_UPPER]


def test_normalize_drops_out_of_range_lengths() -> None:
    """Right number of words, too few letters: the grid would come out mostly holes."""
    # 11 words, 28 letters — inside the medium word band, under its letter floor.
    too_short = "it is a fine day to go for a long walk"
    items = normalize_sayings_for_tests([too_short, GOOD], length="medium", want=5)
    assert items == [GOOD_UPPER]


def test_normalize_drops_duplicates() -> None:
    items = normalize_sayings_for_tests(
        [GOOD, GOOD_UPPER], length="medium", want=5
    )
    assert items == [GOOD_UPPER]


def test_normalize_drops_sayings_with_too_few_words() -> None:
    """A row is stretched at its word gaps, so few long words will not wrap."""
    # 39 letters in 10 words: inside the letter band, one word under the floor.
    few_words = "these long slow days belong to you and to nobody"
    items = normalize_sayings_for_tests([few_words, GOOD], length="medium", want=5)
    assert items == [GOOD_UPPER]


def test_normalize_drops_words_past_the_grid_width() -> None:
    """A word is never broken across rows, so it cannot outrun the narrowest grid."""
    # 46 letters in 12 words — inside both bands, but "GRANDCHILDREN" is 13 long.
    over_cap = "we let the grandchildren come to us on a sunday for lunch"
    items = normalize_sayings_for_tests([over_cap, GOOD], length="medium", want=5)
    assert items == [GOOD_UPPER]


def test_normalize_respects_the_band_it_is_given() -> None:
    """The same saying is right for one level and wrong for another."""
    assert normalize_sayings_for_tests([GOOD], length="medium", want=5) == [GOOD_UPPER]
    assert normalize_sayings_for_tests([GOOD], length="short", want=5) == []
    assert normalize_sayings_for_tests([GOOD], length="long", want=5) == []


def test_normalize_stops_at_want() -> None:
    items = normalize_sayings_for_tests(VALID_SAYINGS, length="medium", want=2)
    assert len(items) == 2


@pytest.mark.parametrize("length", ["short", "medium", "long"])
def test_prompt_states_both_letter_and_word_budgets(length: str) -> None:
    prompt = build_prompt_for_tests(
        FallenPhraseRequest(theme="gardening", length=length, seed=3)
    )
    assert "letters in total" in prompt
    assert "words." in prompt
    assert "No word longer than 10 letters" in prompt
    # The shape rules the grid depends on must all reach the model.
    assert "rows of letter boxes" in prompt
    assert "no digits, punctuation, apostrophes" in prompt


def test_prompt_refuses_attribution_and_brands() -> None:
    prompt = build_prompt_for_tests(FallenPhraseRequest(theme="travel", seed=1))
    assert "No attributions" in prompt
    assert "brands" in prompt


def test_prompt_rotates_its_angle_with_the_seed() -> None:
    a = build_prompt_for_tests(FallenPhraseRequest(theme="travel", seed=1))
    b = build_prompt_for_tests(FallenPhraseRequest(theme="travel", seed=2))
    assert a != b


def test_prompt_over_requests_so_the_page_can_discard() -> None:
    prompt = build_prompt_for_tests(FallenPhraseRequest(theme="travel", itemCount=1))
    assert prompt.startswith("Write 10 original retirement sayings")


def test_generate_returns_usable_sayings(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_call(prompt: str) -> str:
        return json.dumps({"items": VALID_SAYINGS})

    monkeypatch.setattr(
        "app.services.studio_fallen_phrase_service._call_gemini", fake_call
    )
    result = asyncio.run(
        generate_fallen_phrase(
            FallenPhraseRequest(theme="gardening", itemCount=1), user_id="u1"
        )
    )
    assert GOOD_UPPER in result.items
    assert all(saying == saying.upper() for saying in result.items)


def test_generate_raises_when_nothing_is_usable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_call(prompt: str) -> str:
        return json.dumps({"items": ["too short", "also far too short"]})

    monkeypatch.setattr(
        "app.services.studio_fallen_phrase_service._call_gemini", fake_call
    )
    with pytest.raises(FallenPhraseGenerationError):
        asyncio.run(
            generate_fallen_phrase(
                FallenPhraseRequest(theme="gardening", itemCount=1), user_id="u2"
            )
        )
