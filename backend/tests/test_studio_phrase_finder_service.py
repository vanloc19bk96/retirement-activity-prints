from __future__ import annotations

import asyncio
import json

import pytest

from app.schemas.studio_phrase_finder import PhraseFinderRequest
from app.services.studio_phrase_finder_service import (
    PhraseFinderGenerationError,
    build_prompt_for_tests,
    generate_phrase_finder,
    normalize_items_for_tests,
    parse_phrase_finder_json_for_tests,
)

# 40 letters in 13 words — inside the medium band on every count the page cares
# about, and with no word over four letters, which is the shape the long-word
# line in the prompt asks against and the normalizer deliberately still keeps.
GOOD = "the best part of the day is the one you did not plan"
GOOD_UPPER = "THE BEST PART OF THE DAY IS THE ONE YOU DID NOT PLAN"
GOOD_CLUE = "An hour nobody wrote in the diary"


def item(text: str, clue: str = GOOD_CLUE) -> dict[str, str]:
    return {"text": text, "clue": clue}


VALID_ITEMS = [
    item(GOOD, GOOD_CLUE),
    item(
        "a kind word costs you little and is kept for years",
        "Why a small gesture outlasts its moment",
    ),
    item(
        "the long way round is the only way worth taking now",
        "Why the scenic route beats the quick one",
    ),
    item(
        "a garden asks only that you turn up and then sit down",
        "What the vegetable patch expects of you",
    ),
    item(
        "count the mornings that begin with no plan at all",
        "Keeping score of empty diary pages",
    ),
    item(
        "the alarm clock has gone and the kettle has not",
        "One machine retired, the other did not",
    ),
]


def texts(items) -> list[str]:
    return [entry.text for entry in items]


def test_parse_markdown_fenced_json() -> None:
    raw = "```json\n" + json.dumps({"items": VALID_ITEMS}) + "\n```"
    data = parse_phrase_finder_json_for_tests(raw)
    assert len(data["items"]) == 6


def test_normalize_uppercases_and_keeps_the_marks_the_page_can_set() -> None:
    items = normalize_items_for_tests(
        [item("Don't rush the morning; the kettle is already on", "Take the day slowly")],
        length="medium",
        want=5,
    )
    assert texts(items) == ["DON'T RUSH THE MORNING, THE KETTLE IS ALREADY ON"]


def test_normalize_folds_the_typography_a_writer_reaches_for() -> None:
    items = normalize_items_for_tests(
        [
            item(
                "It’s a well—earned rest and the garden is waiting for you",
                "Payment for forty years of alarm clocks",
            )
        ],
        length="medium",
        want=5,
    )
    assert texts(items) == [
        "IT'S A WELL-EARNED REST AND THE GARDEN IS WAITING FOR YOU"
    ]


def test_normalize_drops_digits_by_splitting_rather_than_welding() -> None:
    items = normalize_items_for_tests(
        [item("the best part of the 2 day is the one you did not plan")],
        length="medium",
        want=5,
    )
    assert texts(items) == [GOOD_UPPER]


def test_normalize_drops_out_of_range_lengths() -> None:
    # 10 words, 26 letters: inside the medium word band, under its letter floor.
    too_short = item("it is a fine day to go for a walk", "A short stroll somewhere")
    items = normalize_items_for_tests([too_short, item(GOOD)], length="medium", want=5)
    assert texts(items) == [GOOD_UPPER]


def test_normalize_drops_duplicates_however_they_punctuate() -> None:
    items = normalize_items_for_tests(
        [item(GOOD), item(GOOD_UPPER + "!", "Another way of saying the same")],
        length="medium",
        want=5,
    )
    assert texts(items) == [GOOD_UPPER]


def test_normalize_drops_words_past_the_column_width() -> None:
    """A word is never broken across rows, so it cannot outrun the narrowest column."""
    # 39 letters in 9 words, squarely inside the band — and one 11-letter word,
    # which is one more than the narrowest column can set.
    too_wide = item(
        "the celebration is over and the years are yours",
        "What the leaving party hands you",
    )
    items = normalize_items_for_tests([too_wide, item(GOOD)], length="medium", want=5)
    assert texts(items) == [GOOD_UPPER]


def test_normalize_keeps_a_phrase_of_short_words() -> None:
    """The long-word line in the prompt is a request, not a gate.

    GOOD has no word over four letters and is one of the better phrases this
    game prints; dropping it to satisfy a heuristic would cost more content
    than the heuristic is worth. The browser runs the gate that actually
    measures where the given letters can go.
    """
    assert texts(normalize_items_for_tests([item(GOOD)], length="medium", want=5)) == [
        GOOD_UPPER
    ]


def test_normalize_caps_the_punctuation_one_phrase_may_carry() -> None:
    marky = item(
        "it's a rest, a walk, a garden, and a morning for you",
        "How the hours fill themselves up now",
    )
    items = normalize_items_for_tests([marky, item(GOOD)], length="medium", want=5)
    assert texts(items) == [GOOD_UPPER]


def test_normalize_respects_the_band_it_is_given() -> None:
    """Valid for medium, too long for short."""
    assert normalize_items_for_tests([item(GOOD)], length="short", want=5) == []
    assert texts(normalize_items_for_tests([item(GOOD)], length="medium", want=5)) == [
        GOOD_UPPER
    ]


def test_normalize_stops_at_want() -> None:
    items = normalize_items_for_tests(VALID_ITEMS, length="medium", want=2)
    assert len(items) == 2


def test_normalize_drops_a_saying_that_arrived_without_a_clue() -> None:
    """An unclued saying is not a harder puzzle, it is an unsolvable one."""
    assert normalize_items_for_tests([item(GOOD, "")], length="medium", want=5) == []
    assert normalize_items_for_tests([item(GOOD, "Rest")], length="medium", want=5) == []
    assert normalize_items_for_tests([GOOD], length="medium", want=5) == []


def test_normalize_drops_a_clue_past_the_column_it_prints_in() -> None:
    long_clue = "What a morning feels like when nothing at all is written in the diary"
    assert (
        normalize_items_for_tests(
            [item(GOOD, long_clue)], length="medium", want=5, max_clue_chars=52
        )
        == []
    )


def test_normalize_drops_a_clue_that_hands_its_own_saying_over() -> None:
    """A content word of the saying, echoed in the clue, prints the answer twice."""
    assert (
        normalize_items_for_tests(
            [item("the garden is open all day now that you are home", "Gardening hours")],
            length="medium",
            want=5,
        )
        == []
    )
    # Function words are not protected: THE and NOT mean nothing in a clue.
    kept = normalize_items_for_tests(
        [item(GOOD, "The hour nobody wrote in the diary")], length="medium", want=5
    )
    assert texts(kept) == [GOOD_UPPER]


def test_normalize_sets_the_clue_as_the_page_prints_it() -> None:
    items = normalize_items_for_tests(
        [item(GOOD, '  "an hour nobody wrote in the diary."  ')],
        length="medium",
        want=5,
    )
    assert items[0].clue == "An hour nobody wrote in the diary"


def test_normalize_drops_one_clue_used_for_two_sayings() -> None:
    items = normalize_items_for_tests(
        [
            item(GOOD, GOOD_CLUE),
            item("a kind word costs you little and is kept for years", GOOD_CLUE),
        ],
        length="medium",
        want=5,
    )
    assert len(items) == 1


@pytest.mark.parametrize("length", ["short", "medium", "long"])
def test_prompt_states_the_shape_the_page_can_set(length: str) -> None:
    prompt = build_prompt_for_tests(
        PhraseFinderRequest(theme="gardening", itemCount=3, length=length, seed=1)
    )
    assert "letters in total" in prompt
    assert "words." in prompt
    assert "No word longer than 10 letters" in prompt
    assert "letters or more" in prompt


def test_prompt_asks_for_a_clue_the_printed_column_can_hold() -> None:
    prompt = build_prompt_for_tests(
        PhraseFinderRequest(theme="gardening", itemCount=3, seed=1, maxClueChars=52)
    )
    assert "Give each one a short clue" in prompt
    assert "At most 52 characters" in prompt
    assert "Never reuse a word from the saying" in prompt
    assert '"clue"' in prompt


def test_prompt_names_the_marks_it_allows_and_refuses_the_rest() -> None:
    prompt = build_prompt_for_tests(PhraseFinderRequest(theme="gardening", seed=1))
    assert "apostrophe, hyphen, comma" in prompt
    assert "No digits, quotation marks" in prompt
    assert "at most 3 punctuation marks" in prompt


def test_prompt_refuses_attribution_and_brands() -> None:
    prompt = build_prompt_for_tests(PhraseFinderRequest(theme="gardening", seed=1))
    assert "No attributions" in prompt
    assert "brands" in prompt


def test_prompt_rotates_its_angle_with_the_seed() -> None:
    a = build_prompt_for_tests(PhraseFinderRequest(theme="gardening", seed=1))
    b = build_prompt_for_tests(PhraseFinderRequest(theme="gardening", seed=2))
    assert a != b


def test_prompt_over_requests_so_the_page_can_discard() -> None:
    prompt = build_prompt_for_tests(
        PhraseFinderRequest(theme="gardening", itemCount=3, seed=1)
    )
    assert "Write 14 original retirement sayings" in prompt


def test_generate_returns_usable_phrases(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_call(prompt: str) -> str:
        return json.dumps({"items": VALID_ITEMS})

    monkeypatch.setattr(
        "app.services.studio_phrase_finder_service._call_gemini", fake_call
    )
    result = asyncio.run(
        generate_phrase_finder(
            PhraseFinderRequest(theme="gardening", itemCount=3, seed=1),
            user_id="u1",
        )
    )
    assert len(result.items) >= 3
    assert all(entry.text == entry.text.upper() for entry in result.items)
    assert all(entry.clue.strip() for entry in result.items)


def test_generate_raises_when_a_reply_carries_no_clues(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Phrases alone cannot be printed: the page would have no way in."""

    async def fake_call(prompt: str) -> str:
        return json.dumps({"items": [{"text": entry["text"]} for entry in VALID_ITEMS]})

    monkeypatch.setattr(
        "app.services.studio_phrase_finder_service._call_gemini", fake_call
    )
    with pytest.raises(PhraseFinderGenerationError):
        asyncio.run(
            generate_phrase_finder(
                PhraseFinderRequest(theme="gardening", itemCount=3, seed=1),
                user_id="u3",
            )
        )


def test_generate_raises_when_nothing_is_usable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_call(prompt: str) -> str:
        return json.dumps({"items": [item("no"), item("still no")]})

    monkeypatch.setattr(
        "app.services.studio_phrase_finder_service._call_gemini", fake_call
    )
    with pytest.raises(PhraseFinderGenerationError):
        asyncio.run(
            generate_phrase_finder(
                PhraseFinderRequest(theme="gardening", itemCount=3, seed=1),
                user_id="u2",
            )
        )
