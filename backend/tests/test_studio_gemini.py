from __future__ import annotations

import json

import pytest

from app.services.studio_gemini import (
    StudioGenerationError,
    _thinking_config,
    coerce_json_text,
    parse_string_items,
    repair_truncated_json,
    response_text,
    strip_json_fences,
)


def test_strip_fences() -> None:
    assert strip_json_fences('```json\n{"a": 1}\n```') == '{"a": 1}'
    assert strip_json_fences('{"a": 1}') == '{"a": 1}'


def test_intact_json_passes_through() -> None:
    raw = '{"items": ["one", "two"]}'
    assert json.loads(coerce_json_text(raw)) == {"items": ["one", "two"]}


def test_repair_string_cut_mid_value() -> None:
    """The exact shape that used to raise `Unterminated string` and 502."""
    truncated = '{\n "items": [\n  "APPLE",\n  "BREAD",\n  "CAND'
    data = json.loads(repair_truncated_json(truncated) or "")
    assert data == {"items": ["APPLE", "BREAD"]}


def test_repair_object_cut_mid_row() -> None:
    """Rewinds to the last complete field, so the tail row can lose keys.

    That is fine: every service normaliser drops rows missing a required field.
    """
    truncated = (
        '{"items": [{"word": "TIGER", "hint": "big cat"}, '
        '{"word": "EAGLE", "hint": "bird of'
    )
    data = json.loads(repair_truncated_json(truncated) or "")
    assert data["items"][0] == {"word": "TIGER", "hint": "big cat"}
    assert "hint" not in data["items"][-1]


def test_repair_keeps_row_completed_before_the_cut() -> None:
    truncated = '{"clues": [{"word": "A", "clue": "x"},{"word": "B", "clue": "y"}'
    data = json.loads(repair_truncated_json(truncated) or "")
    assert len(data["clues"]) == 2


def test_repair_survives_escaped_quote_before_cut() -> None:
    truncated = '{"items": ["a \\"quoted\\" word", "next one'
    data = json.loads(repair_truncated_json(truncated) or "")
    assert data == {"items": ['a "quoted" word']}


def test_repair_gives_up_when_nothing_is_complete() -> None:
    assert repair_truncated_json('{"items": ["parti') is None
    assert repair_truncated_json("not json at all") is None


def test_coerce_repairs_truncated_and_parse_items_reads_it() -> None:
    truncated = '{"items": ["ONE", "TWO", "THR'
    assert parse_string_items(truncated) == ["ONE", "TWO"]


def test_coerce_raises_on_unsalvageable() -> None:
    with pytest.raises(StudioGenerationError):
        coerce_json_text("the model wrote prose instead")


class _Part:
    def __init__(self, text: str, thought: bool = False) -> None:
        self.text = text
        self.thought = thought


class _Candidate:
    def __init__(self, *parts: _Part) -> None:
        self.content = type("C", (), {"parts": list(parts)})()


class _Resp:
    def __init__(self, *candidates: _Candidate) -> None:
        self.candidates = list(candidates)

    @property
    def text(self) -> str:
        raise ValueError("blocked response")


def test_response_text_skips_thought_parts() -> None:
    resp = _Resp(_Candidate(_Part("reasoning...", thought=True), _Part('{"a": 1}')))
    assert response_text(resp) == '{"a": 1}'


def test_response_text_survives_raising_text_property() -> None:
    assert response_text(_Resp()) == ""


class _TypesStub:
    class ThinkingConfig:
        def __init__(self, **kwargs: object) -> None:
            self.kwargs = kwargs


def test_thinking_config_latest_alias_uses_level() -> None:
    """gemini-flash-lite-latest rejects thinking_budget with 400 INVALID_ARGUMENT."""
    cfg = _thinking_config(_TypesStub, "gemini-flash-lite-latest", "minimal")
    assert cfg is not None
    assert cfg.kwargs == {"thinking_level": "minimal"}


def test_thinking_config_gemini3_uses_level() -> None:
    cfg = _thinking_config(_TypesStub, "gemini-3-flash-preview", "minimal")
    assert cfg is not None
    assert cfg.kwargs == {"thinking_level": "minimal"}


def test_thinking_config_explicit_2x_uses_budget() -> None:
    cfg = _thinking_config(_TypesStub, "gemini-2.5-flash-lite", "minimal")
    assert cfg is not None
    assert cfg.kwargs == {"thinking_budget": 0}


def test_thinking_config_unknown_model_omits_thinking() -> None:
    assert _thinking_config(_TypesStub, "gemini-pro", "minimal") is None
