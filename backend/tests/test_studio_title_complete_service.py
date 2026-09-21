from __future__ import annotations

from app.schemas.studio_title_complete import TitleCompleteRequest
from app.services.studio_title_complete_service import (
    blank_out_for_tests,
    has_visible_cue_for_tests,
    parse_titles_json_for_tests,
    restore_for_tests,
    top_up_from_curated_for_tests,
    validate_title_items_for_tests,
)


def _req(**overrides: object) -> TitleCompleteRequest:
    payload = {
        "category": "mixed",
        "era": "any",
        "difficulty": "standard",
        "itemCount": 12,
        "seed": 1,
    }
    payload.update(overrides)
    return TitleCompleteRequest.model_validate(payload)


def test_restore_equals_full_title() -> None:
    full = "Singin' in the Rain"
    answer = "Rain"
    display = blank_out_for_tests(full, answer)
    assert display == "Singin' in the ______"
    assert restore_for_tests(display or "", answer) == full


def test_rejects_blank_only_display() -> None:
    items = [
        {
            "fullTitle": "Gunsmoke",
            "answer": "Gunsmoke",
            "category": "tv",
            "confidence": 0.99,
        }
    ]
    assert validate_title_items_for_tests(items, _req()) == []
    assert has_visible_cue_for_tests("______") is False
    assert has_visible_cue_for_tests("Leave It to ______") is True


def test_rejects_titles_longer_than_word_cap() -> None:
    items = [
        {
            "fullTitle": "One Two Three Four Five Six Seven Eight Nine",
            "answer": "Nine",
            "category": "song",
            "confidence": 0.99,
        }
    ]
    assert validate_title_items_for_tests(items, _req()) == []


def test_rejects_lyric_shaped_content() -> None:
    items = [
        {
            "fullTitle": "Somewhere over the rainbow...",
            "answer": "rainbow",
            "category": "song",
            "confidence": 0.99,
        },
        {
            "fullTitle": "What is the next line of Happy Birthday",
            "answer": "Birthday",
            "category": "song",
            "confidence": 0.99,
        },
    ]
    assert validate_title_items_for_tests(items, _req()) == []


def test_rejects_answer_not_in_title() -> None:
    items = [
        {
            "fullTitle": "The Sound of Music",
            "answer": "Rain",
            "category": "film",
            "confidence": 0.99,
        }
    ]
    assert validate_title_items_for_tests(items, _req()) == []


def test_rejects_stopword_answers() -> None:
    items = [
        {
            "fullTitle": "The Sound of Music",
            "answer": "The",
            "category": "film",
            "confidence": 0.99,
        }
    ]
    assert validate_title_items_for_tests(items, _req()) == []


def test_rejects_low_confidence() -> None:
    items = [
        {
            "fullTitle": "Hotel California",
            "answer": "Hotel",
            "category": "song",
            "confidence": 0.5,
        }
    ]
    assert validate_title_items_for_tests(items, _req()) == []


def test_keeps_valid_item() -> None:
    items = [
        {
            "fullTitle": "Hotel California",
            "answer": "Hotel",
            "category": "song",
            "year": 1977,
            "confidence": 0.95,
        }
    ]
    clean = validate_title_items_for_tests(items, _req())
    assert len(clean) == 1
    assert clean[0].display_title == "______ California"
    assert clean[0].answer == "Hotel"
    assert clean[0].full_title == "Hotel California"


def test_standard_rejects_two_blanks() -> None:
    items = [
        {
            "fullTitle": "Bridge Over Troubled Water",
            "answer": "Bridge / Water",
            "category": "song",
            "confidence": 0.95,
        }
    ]
    assert validate_title_items_for_tests(items, _req(difficulty="standard")) == []


def test_tops_up_from_curated_bank() -> None:
    req = _req(itemCount=12, category="songs")
    filled = top_up_from_curated_for_tests([], req)
    assert len(filled) == 12
    assert all(item.full_title for item in filled)
    assert all(
        restore_for_tests(item.display_title, item.answer) == item.full_title
        for item in filled
    )


def test_tops_up_to_item_count_when_era_slice_is_short() -> None:
    # Mixed 1990s bank has only 19 titles — must widen era to fill 20.
    req = _req(itemCount=20, category="mixed", era="1990s")
    filled = top_up_from_curated_for_tests([], req)
    assert len(filled) == 20


def test_parse_fenced_json() -> None:
    raw = """```json
{"items":[{"fullTitle":"Jaws","answer":"Jaws","category":"film","confidence":0.9}]}
```"""
    items = parse_titles_json_for_tests(raw)
    assert len(items) == 1
    assert items[0]["fullTitle"] == "Jaws"


def test_accepts_custom_decade_era() -> None:
    assert _req(era="2010s").era == "2010s"
    assert _req(era="any").era == "any"
    assert _req(era="ANY").era == "any"


def test_rejects_malformed_era() -> None:
    import pytest

    with pytest.raises(Exception):
        _req(era="the 2010s")


def test_accepts_custom_category_phrase() -> None:
    assert _req(category="Broadway musicals").category == "Broadway musicals"
    assert _req(category="SONGS").category == "songs"
    assert _req(category="mixed").category == "mixed"
