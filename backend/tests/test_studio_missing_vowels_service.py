from __future__ import annotations

import asyncio
import json

import pytest

from app.schemas.studio_missing_vowels import MissingVowelsRequest
from app.services.studio_missing_vowels_service import (
    MissingVowelsGenerationError,
    build_prompt_for_tests,
    generate_missing_vowels,
    mask_vowels_for_tests,
    normalize_items_for_tests,
    parse_mv_json_for_tests,
)


def item(answer: str, clue: str) -> dict[str, str]:
    return {"answer": answer, "clue": clue}


VALID_ITEMS = {
    "items": [
        item("SUNSET", "The sky at the end of the day"),
        item("PICNIC", "Lunch on a rug in the park"),
        item("TRAVEL", "Seeing places far from home"),
        item("FAMILY", "Everyone at the Sunday table"),
        item("MEMORY", "Something you look back on"),
        item("RETIRE", "Leave working life behind"),
        item("MEADOW", "A field of wild flowers"),
        item("MARKET", "Stalls on a Saturday morning"),
        item("MUSEUM", "Rooms full of old things"),
        item("RAMBLE", "A long wander in the hills"),
        item("TEAPOT", "It pours the morning brew"),
        item("PUZZLE", "A pastime with pieces or clues"),
    ]
}


def test_parse_valid_json() -> None:
    assert len(parse_mv_json_for_tests(json.dumps(VALID_ITEMS))) == 12


def test_parse_markdown_fenced_json() -> None:
    raw = "```json\n" + json.dumps(VALID_ITEMS) + "\n```"
    assert len(parse_mv_json_for_tests(raw)) == 12


def test_missing_items_raises() -> None:
    with pytest.raises(ValueError, match="missing items"):
        parse_mv_json_for_tests(json.dumps({}))


def test_mask_keeps_y_and_spaces() -> None:
    assert mask_vowels_for_tests("RETIREMENT") == "R_T_R_M_NT"
    assert mask_vowels_for_tests("BOOK CLUB") == "B__K CL_B"
    assert mask_vowels_for_tests("HAPPY") == "H_PPY"


def answers(items) -> list[str]:
    return [entry.answer for entry in items]


def test_normalize_drops_entries_the_page_cannot_print() -> None:
    items = normalize_items_for_tests(
        [
            item("PICNIC", "Lunch on a rug in the park"),
            item("AB", "Far too short to print"),
            item("RHYTHM", "A beat you can clap along to"),  # no vowels at all
            item("SUNSET", "The sky at the end of the day"),
            item("MEADOW", ""),  # no clue
            item("ORCHARD", "An orchard full of apple trees"),  # clue gives it away
            item("MARKET", "Stalls " * 12),  # clue longer than the column
            item("TOOLONGWORDXYZ", "Well past the letter band"),
        ],
        min_len=5,
        max_len=8,
        want=10,
    )
    assert answers(items) == ["PICNIC", "SUNSET"]


def test_normalize_respects_the_word_limit() -> None:
    pool = [
        item("BOOK CLUB", "Monthly meeting over a novel"),
        item("A LONG WAY ROUND", "Not the direct route"),
    ]
    two = normalize_items_for_tests(pool, min_len=5, max_len=10, want=10, max_words=2)
    assert answers(two) == ["BOOK CLUB"]

    one = normalize_items_for_tests(pool, min_len=5, max_len=10, want=10, max_words=1)
    assert answers(one) == []


def test_normalize_drops_a_row_that_blanks_to_one_already_taken() -> None:
    items = normalize_items_for_tests(
        [
            item("PICNIC", "Lunch on a rug in the park"),
            item("PICNIC", "The same word a second time"),
        ],
        min_len=5,
        max_len=8,
        want=10,
    )
    assert answers(items) == ["PICNIC"]


def test_normalize_uppercases_and_strips_punctuation() -> None:
    items = normalize_items_for_tests(
        [item(" road-trip! ", "  a drive with no hurry.  ")],
        min_len=5,
        max_len=10,
        want=10,
    )
    assert answers(items) == ["ROAD TRIP"]
    assert items[0].clue == "A drive with no hurry"


def test_prompt_carries_the_band_the_page_fixed() -> None:
    req = MissingVowelsRequest(
        theme="Travel Dreams",
        count=24,
        minLetters=6,
        maxLetters=9,
        maxWords=2,
        maxClueChars=42,
        seed=7,
    )
    prompt = build_prompt_for_tests(req)
    assert "Travel Dreams" in prompt
    assert "6-9 letters" in prompt
    assert "at most 2 words" in prompt
    assert "At most 42 characters" in prompt
    assert "24" in prompt
    # The page does the blanking; a pre-blanked answer cannot be checked.
    assert "G_RD_N_NG" in prompt


def test_prompt_forbids_phrases_when_the_level_allows_one_word() -> None:
    req = MissingVowelsRequest(theme="Gardening", count=20, maxWords=1, seed=3)
    assert "One word only" in build_prompt_for_tests(req)


def test_band_must_be_ordered() -> None:
    with pytest.raises(ValueError, match="maxLetters"):
        MissingVowelsRequest(minLetters=9, maxLetters=6)


def test_generate_returns_answers_with_their_clues(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps(VALID_ITEMS)

    monkeypatch.setattr(
        "app.services.studio_missing_vowels_service._call_gemini", fake_gemini
    )
    monkeypatch.setattr(
        "app.services.studio_missing_vowels_service._check_rate_limit", lambda _uid: None
    )

    req = MissingVowelsRequest(
        theme="Hobbies & Leisure", count=12, minLetters=5, maxLetters=8, seed=7
    )
    result = asyncio.run(generate_missing_vowels(req, user_id="user-1"))
    assert len(result.items) == 12
    assert result.items[0].answer == "SUNSET"
    assert all(entry.clue for entry in result.items)


def test_too_few_items_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps({"items": [item("PICNIC", "Lunch on a rug in the park")]})

    monkeypatch.setattr(
        "app.services.studio_missing_vowels_service._call_gemini", fake_gemini
    )
    monkeypatch.setattr(
        "app.services.studio_missing_vowels_service._check_rate_limit", lambda _uid: None
    )

    req = MissingVowelsRequest(count=24, seed=1)
    with pytest.raises(MissingVowelsGenerationError, match="too few"):
        asyncio.run(generate_missing_vowels(req, user_id="user-1"))
