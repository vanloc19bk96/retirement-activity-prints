from __future__ import annotations

import asyncio
import json

import pytest
from pydantic import ValidationError

from app.schemas.studio_riddle_scramble import RiddleScrambleRequest
from app.services.studio_riddle_scramble_service import (
    RiddleScrambleGenerationError,
    build_prompt_for_tests,
    generate_riddle_scramble,
    normalize_riddles_for_tests,
    normalize_words_for_tests,
    parse_payload_for_tests,
)


def riddle(text: str, answer: str) -> dict[str, str]:
    return {"riddle": text, "answer": answer}


def word(text: str, clue: str) -> dict[str, str]:
    return {"word": text, "clue": clue}


VALID_RIDDLES = [
    riddle("Where does a retired sailor drop anchor?", "PORCH"),
    riddle("What does a retired night owl get enough of?", "SLEEP"),
    riddle("What did the old bookkeeper call his seat?", "CHAIR"),
    riddle("What do retired bakers have plenty of?", "SCONE"),
]

VALID_WORDS = [
    word("TRAVEL", "Seeing places far from home"),
    word("CRUISE", "A holiday spent at sea"),
    word("FAMILY", "Everyone at Sunday lunch"),
    word("MEMORY", "Something you look back on"),
    word("PICNIC", "Lunch on a rug in the park"),
    word("MARKET", "Stalls on a Saturday"),
    word("TEAPOT", "It pours the morning brew"),
    word("MEADOW", "A field of wild flowers"),
    word("WINDOW", "You watch the birds from it"),
    word("KETTLE", "It whistles when ready"),
    word("CANDLE", "Soft light on a dark night"),
    word("MUSEUM", "A hall full of old things"),
]

VALID_PAYLOAD = {"riddles": VALID_RIDDLES, "words": VALID_WORDS}


def request(**overrides: object) -> RiddleScrambleRequest:
    payload: dict[str, object] = {
        "theme": "Retirement Life",
        "riddleCount": 8,
        "answerLetters": 5,
        "maxRiddleChars": 72,
        "wordCount": 24,
        "minLetters": 5,
        "maxLetters": 7,
        "maxClueChars": 30,
        "seed": 1,
    }
    payload.update(overrides)
    return RiddleScrambleRequest(**payload)  # type: ignore[arg-type]


def riddle_answers(raw: list[object], **overrides: object) -> list[str]:
    options: dict[str, object] = {
        "answer_letters": 5,
        "want": 8,
        "max_riddle_chars": 72,
    }
    options.update(overrides)
    return [
        entry.answer
        for entry in normalize_riddles_for_tests(raw, **options)  # type: ignore[arg-type]
    ]


def words(raw: list[object], **overrides: int) -> list[str]:
    options = {"min_len": 5, "max_len": 7, "want": 20, "max_clue_chars": 30}
    options.update(overrides)
    return [
        entry.word
        for entry in normalize_words_for_tests(raw, **options)  # type: ignore[arg-type]
    ]


# ------------------------------------------------------------------ parsing


def test_parse_valid_json() -> None:
    riddles, pool = parse_payload_for_tests(json.dumps(VALID_PAYLOAD))
    assert len(riddles) == 4
    assert len(pool) == 12


def test_missing_riddles_raises() -> None:
    with pytest.raises(ValueError, match="missing riddles"):
        parse_payload_for_tests(json.dumps({"words": VALID_WORDS}))


def test_missing_words_raises() -> None:
    with pytest.raises(ValueError, match="missing words"):
        parse_payload_for_tests(json.dumps({"riddles": VALID_RIDDLES}))


# --------------------------------------------------------------- the schema


def test_letter_band_must_be_ordered() -> None:
    with pytest.raises(ValidationError, match="maxLetters"):
        request(minLetters=8, maxLetters=5)


def test_answer_letters_is_bounded_to_what_a_page_prints() -> None:
    with pytest.raises(ValidationError):
        request(answerLetters=9)


# ------------------------------------------------------------- riddle gates


def test_riddle_answer_must_be_the_exact_length_asked_for() -> None:
    assert riddle_answers(
        [
            riddle("Where does a retired sailor drop anchor?", "PORCH"),
            riddle("What does a retired postman look forward to?", "NAPS"),
            riddle("What does a retired banker do all afternoon?", "SNOOZE"),
        ]
    ) == ["PORCH"]


def test_awkward_letters_are_rejected() -> None:
    # No everyday retirement word carries a Z, so the browser could never
    # spell this answer out of the pool it is sent.
    assert riddle_answers([riddle("What did the old band play at dusk?", "JAZZY")]) == []


def test_riddle_that_answers_itself_is_rejected() -> None:
    assert riddle_answers([riddle("What is a relaxing sort of chair?", "CHAIR")]) == []


def test_missing_question_mark_is_restored_not_rejected() -> None:
    kept = normalize_riddles_for_tests(
        [riddle("Where does a retired sailor drop anchor", "PORCH")],
        answer_letters=5,
        want=8,
        max_riddle_chars=72,
    )
    assert kept[0].riddle.endswith("?")


def test_riddle_longer_than_the_band_is_dropped() -> None:
    assert riddle_answers([riddle(f"{'Why ' * 30}retire?", "PORCH")]) == []


def test_duplicate_riddle_answers_are_dropped() -> None:
    assert riddle_answers(
        [
            riddle("Where does a retired sailor drop anchor?", "PORCH"),
            riddle("Where does an old dog wait for supper?", "PORCH"),
        ]
    ) == ["PORCH"]


# --------------------------------------------------------------- word gates


def test_normalize_filters_length_case_and_dupes() -> None:
    assert words(
        [
            word("TRAVEL", "Seeing places far from home"),
            word("travel", "Seeing places far from home"),
            word("GO", "Too short to scramble"),
            word("REMINISCENCE", "Too long for the column"),
            word("MEMORY", "Something you look back on"),
        ]
    ) == ["TRAVEL", "MEMORY"]


def test_words_sharing_a_letter_set_are_dropped() -> None:
    # Two scrambles a reader cannot tell apart, and one answer page.
    assert words(
        [
            word("LEMON", "A sharp yellow fruit"),
            word("MELON", "Sweet and full of pips"),
        ]
    ) == ["LEMON"]


def test_clue_longer_than_the_line_is_dropped() -> None:
    assert words([word("TRAVEL", "A" * 31)]) == []


def test_clue_echoing_its_word_is_dropped() -> None:
    assert words([word("TRAVEL", "Where a traveller goes")]) == []


# ------------------------------------------------------------------ prompt


def test_prompt_states_the_exact_answer_length_and_bands() -> None:
    prompt = build_prompt_for_tests(request(answerLetters=6, minLetters=6, maxLetters=9))
    assert "EXACTLY 6 letters" in prompt
    assert "6-9 letters" in prompt
    assert "prints 6 scrambled words" in prompt


def test_prompt_tells_the_model_it_need_not_do_the_arithmetic() -> None:
    prompt = build_prompt_for_tests(request())
    assert "do not have to spell" in prompt


# --------------------------------------------------------------- the floors


def test_too_few_riddles_is_a_failure_not_a_thin_page(monkeypatch) -> None:
    payload = json.dumps({"riddles": VALID_RIDDLES[:1], "words": VALID_WORDS})
    monkeypatch.setattr(
        "app.services.studio_riddle_scramble_service._call_gemini",
        _returning(payload),
    )
    with pytest.raises(RiddleScrambleGenerationError, match="too few usable riddles"):
        asyncio.run(generate_riddle_scramble(request(), user_id="tester"))


def test_too_few_words_is_a_failure(monkeypatch) -> None:
    payload = json.dumps({"riddles": VALID_RIDDLES, "words": VALID_WORDS[:3]})
    monkeypatch.setattr(
        "app.services.studio_riddle_scramble_service._call_gemini",
        _returning(payload),
    )
    with pytest.raises(RiddleScrambleGenerationError, match="too few valid words"):
        asyncio.run(generate_riddle_scramble(request(), user_id="tester"))


def test_a_good_reply_comes_back_whole(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.studio_riddle_scramble_service._call_gemini",
        _returning(json.dumps(VALID_PAYLOAD)),
    )
    result = asyncio.run(generate_riddle_scramble(request(), user_id="tester"))
    assert [entry.answer for entry in result.riddles] == [
        "PORCH",
        "SLEEP",
        "CHAIR",
        "SCONE",
    ]
    assert len(result.words) == 12
    assert all(len(entry.answer) == 5 for entry in result.riddles)


def _returning(payload: str):
    async def _call(prompt: str) -> str:  # noqa: ARG001 - signature match
        return payload

    return _call
