from __future__ import annotations

import pytest

from app.services.studio_crossword_service import parse_clues_json_for_tests


def test_parse_clues_json_accepts_valid_payload() -> None:
    raw = """
    {
      "clues": [
        { "word": "TIGER", "clue": "Big striped cat" },
        { "word": "EAGLE", "clue": "Bird of prey" }
      ]
    }
    """
    clues = parse_clues_json_for_tests(raw, ["TIGER", "EAGLE"])
    assert [c.word for c in clues] == ["TIGER", "EAGLE"]
    assert clues[0].clue == "Big striped cat"


def test_parse_clues_json_drops_echoing_answer() -> None:
    raw = """
    {
      "clues": [
        { "word": "TIGER", "clue": "A tiger in the wild" },
        { "word": "EAGLE", "clue": "An eagle soaring" }
      ]
    }
    """
    with pytest.raises(ValueError, match="too few"):
        parse_clues_json_for_tests(raw, ["TIGER", "EAGLE"])


def test_parse_theme_mode_accepts_open_word_list() -> None:
    raw = """
    {
      "clues": [
        { "word": "SHELL", "clue": "Beach find" },
        { "word": "WAVE", "clue": "Ocean motion" },
        { "word": "SAND", "clue": "Beach ground" },
        { "word": "CRAB", "clue": "Sideways walker" },
        { "word": "TIDE", "clue": "Ocean rise and fall" },
        { "word": "SURF", "clue": "Ride the waves" }
      ]
    }
    """
    clues = parse_clues_json_for_tests(
        raw,
        None,
        min_letters=3,
        max_letters=12,
        want=6,
    )
    assert len(clues) == 6
    assert clues[0].word == "SHELL"
    assert clues[0].clue == "Beach find"


def test_parse_theme_mode_drops_clues_past_the_printed_budget() -> None:
    """The client sizes a clue column before it asks; a clue that would not fit
    it is dropped while substitutes are still available."""
    raw = """
    {
      "clues": [
        { "word": "GARDEN", "clue": "A place to grow flowers and vegetables all summer long" },
        { "word": "CRUISE", "clue": "A vacation taken by ship" },
        { "word": "PICNIC", "clue": "An outdoor meal on a blanket" },
        { "word": "SUNSET", "clue": "Evening colors in the sky" },
        { "word": "MARKET", "clue": "Place where people buy goods" }
      ]
    }
    """
    clues = parse_clues_json_for_tests(
        raw,
        None,
        min_letters=4,
        max_letters=9,
        want=4,
        max_clue_chars=44,
    )
    assert [c.word for c in clues] == ["CRUISE", "PICNIC", "SUNSET", "MARKET"]
    assert all(len(c.clue) <= 44 for c in clues)
