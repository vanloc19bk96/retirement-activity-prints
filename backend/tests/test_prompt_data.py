from __future__ import annotations

import json

import pytest

from app.services import prompt_data as data


def test_every_data_file_is_valid_json() -> None:
    files = sorted(data.APP_DATA_ROOT.rglob("*.json"))
    assert files, "no data files found"
    for path in files:
        json.loads(path.read_text(encoding="utf-8"))


def test_every_prompt_config_declares_limits() -> None:
    for path in sorted(data.DATA_ROOT.glob("*/prompt.json")):
        config = data.load_config(path.parent.name)
        assert isinstance(data.section(config, "limits"), dict)


def test_missing_file_raises_prompt_data_error() -> None:
    with pytest.raises(data.PromptDataError):
        data.load_config("no-such-activity")


def test_typed_accessors_reject_wrong_shapes() -> None:
    config = {"words": ["a"], "count": 2, "ratio": 0.5, "nested": {"k": "v"}}
    assert data.string_list(config, "words") == ("a",)
    assert data.int_value(config, "count") == 2
    assert data.float_value(config, "ratio") == 0.5
    assert data.section(config, "nested") == {"k": "v"}
    with pytest.raises(data.PromptDataError):
        data.string_list(config, "count")
    with pytest.raises(data.PromptDataError):
        data.int_value(config, "ratio")
    with pytest.raises(data.PromptDataError):
        data.require(config, "missing")


def test_rotate_and_sample_are_seed_stable() -> None:
    values = ("a", "b", "c")
    assert [data.rotate(values, seed) for seed in range(4)] == ["a", "b", "c", "a"]
    assert data.sample(values, 7, 2) == data.sample(values, 7, 2)


def test_render_template_reports_missing_placeholder() -> None:
    assert data.render_template("hi {name}", name="there") == "hi there"
    with pytest.raises(data.PromptDataError):
        data.render_template("hi {name}")


def test_patterns_match_on_word_boundaries() -> None:
    blocked = data.word_pattern(["care home", "sick"])
    assert blocked.search("moved to a Care Home")
    assert not blocked.search("sickle")
    openers = data.prefix_pattern(["Did", "Do"])
    assert openers.match("Did you ever...")
    assert not openers.match("What did you...")
    raw = data.regex_pattern([r"chart[\s-]?topp"], boundaries=True)
    assert raw.search("a chart topp")


def test_empty_term_lists_are_rejected() -> None:
    with pytest.raises(data.PromptDataError):
        data.word_pattern([])
    with pytest.raises(data.PromptDataError):
        data.regex_pattern([])
    with pytest.raises(data.PromptDataError):
        data.rotate([], 1)


def test_bullet_lines_skips_blanks() -> None:
    assert data.bullet_lines(["one", "", "two"]) == "- one\n- two"


def test_locale_line_switches_on_native_locales() -> None:
    cfg = {
        "nativeLocales": ["en", "en-US"],
        "nativeLine": "- English.",
        "otherLine": "- Locale '{locale}'.",
    }
    assert data.locale_line(cfg, "en-US") == "- English."
    assert data.locale_line(cfg, "") == "- English."
    assert data.locale_line(cfg, "fr") == "- Locale 'fr'."


def test_cover_prompt_uses_data_file_wording() -> None:
    from app.services import cover_prompt

    class _Field:
        def __init__(self, enabled: bool, text: str, position: str) -> None:
            self.enabled = enabled
            self.text = text
            self.position = position

    with_text = cover_prompt.build_prompt(
        "bright retro kitchen",
        _Field(True, "Big Print Puzzles", "top"),
        _Field(True, "Volume 2", "center"),
        _Field(True, "A. Author", "bottom"),
    )
    assert "{" not in with_text and "}" not in with_text
    assert "Big Print Puzzles" in with_text
    assert cover_prompt.position_descriptions()["top"] in with_text

    art_only = cover_prompt.build_prompt(
        "calm blue",
        _Field(False, "", "top"),
        _Field(False, "", "center"),
        _Field(False, "", "bottom"),
    )
    assert "COVER TYPOGRAPHY" not in art_only
    assert "artwork only" in art_only
