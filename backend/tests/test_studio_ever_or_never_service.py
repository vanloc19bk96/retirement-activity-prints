from __future__ import annotations

import asyncio
import json

import pytest

from app.schemas.studio_ever_or_never import EverOrNeverRequest
from app.services.studio_ever_or_never_service import (
    EverOrNeverGenerationError,
    avoid_label,
    build_prompt_for_tests,
    filter_statements,
    generate_ever_or_never,
    is_participle,
    normalize_statement,
    parse_payload_for_tests,
    statements_repeat,
)
from app.services.studio_variety import reset_memory

SERVICE = "app.services.studio_ever_or_never_service"

VALID_ITEMS = [
    {
        "brief": 1,
        "topic": "naps at unexpected times and places",
        "moment": "a nap before lunch on a weekday",
        "statement": "Ever taken a nap before lunch on a Tuesday?",
    },
    {
        "brief": 2,
        "topic": "staying comfy: slippers, pyjamas and lazy clothes",
        "moment": "pyjamas until noon on a Monday",
        "statement": "Ever stayed in your pyjamas until noon on a Monday?",
    },
    {
        "brief": 3,
        "topic": "day trips and spontaneous outings",
        "moment": "a midweek trip booked on a whim",
        "statement": "Ever booked a trip on a Wednesday just because you could?",
    },
    {
        "brief": 4,
        "topic": "the garden and the backyard",
        "moment": "a record tomato",
        "statement": "Ever grown a tomato bigger than your fist?",
    },
]

VALID = {"items": VALID_ITEMS}


@pytest.fixture(autouse=True)
def _fresh_memory() -> None:
    reset_memory()


def _req(**overrides) -> EverOrNeverRequest:
    base = {"theme": "Travel Dreams", "count": 6, "maxStatementChars": 64, "seed": 7}
    base.update(overrides)
    return EverOrNeverRequest(**base)


def _filter(items, **overrides):
    options = {"budget": 64, "cap": 16}
    options.update(overrides)
    return filter_statements(items, **options)


def test_parse_valid_json() -> None:
    assert len(parse_payload_for_tests(json.dumps(VALID))) == len(VALID_ITEMS)


def test_parse_invalid_json_raises() -> None:
    with pytest.raises(ValueError, match="valid JSON"):
        parse_payload_for_tests("not json")


def test_parse_missing_items_raises() -> None:
    with pytest.raises(ValueError, match="missing"):
        parse_payload_for_tests(json.dumps({"questions": []}))


def test_valid_statements_survive_in_order() -> None:
    assert [item.statement for item in _filter(VALID_ITEMS)] == [
        "Ever taken a nap before lunch on a Tuesday?",
        "Ever stayed in your pyjamas until noon on a Monday?",
        "Ever booked a trip on a Wednesday just because you could?",
        "Ever grown a tomato bigger than your fist?",
    ]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Ever taken a nap before lunch?", "Ever taken a nap before lunch?"),
        ("ever taken a nap before lunch", "Ever taken a nap before lunch?"),
        ("1. Ever taken a nap before lunch?", "Ever taken a nap before lunch?"),
        ("- Ever taken a nap before lunch.", "Ever taken a nap before lunch?"),
        ("Have you ever taken a nap before lunch?", "Ever taken a nap before lunch?"),
        ("Ever or Never: taken a nap before lunch?", "Ever taken a nap before lunch?"),
        ("“Ever taken a nap before lunch?”", "Ever taken a nap before lunch?"),
        ("Taken a nap before lunch?", "Ever taken a nap before lunch?"),
        ("Ever sung in the shower at noon?", "Ever sung in the shower at noon?"),
    ],
)
def test_leads_labels_and_marks_are_normalised(raw: str, expected: str) -> None:
    assert normalize_statement(raw, budget=64) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "Ever relaxed?",
        "Ever the best day of the week?",
        "Ever taking a nap before lunch?",
        "Ever napped on the couch or the porch?",
        "Ever not woken up early on a Monday?",
        "Ever woken up early? Then gone back to bed",
        "EVER TAKEN A NAP BEFORE LUNCH?",
        "Ever visited the doctor twice in a week?",
        "Ever been to a casino on a Tuesday?",
        "Ever forgotten what day of the week it is?",
        "Ever binge-watched Netflix until 3 in the morning?",
        "Ever garden in the rain on a Monday?",
        "Ever taken a long lazy nap in a hammock under the apple tree after a big lunch?",
    ],
)
def test_bad_statements_are_rejected(raw: str) -> None:
    assert normalize_statement(raw, budget=64) is None


def test_statement_over_the_budget_is_rejected() -> None:
    raw = "Ever booked a trip on a Wednesday just because you could?"
    assert normalize_statement(raw, budget=64) is not None
    assert normalize_statement(raw, budget=40) is None


def test_participles() -> None:
    for word in ("taken", "napped", "sung", "grown", "been", "tried", "slept"):
        assert is_participle(word), word
    for word in ("garden", "taking", "the", "nap", "kitchen"):
        assert not is_participle(word), word


def test_statement_without_a_named_moment_is_dropped() -> None:
    item = {**VALID_ITEMS[0], "moment": ""}
    assert _filter([item]) == []


@pytest.mark.parametrize(
    ("first", "second", "expected"),
    [
        ("Ever taken a nap before lunch?", "Ever taken a nap after lunch?", True),
        ("Ever taken a nap before lunch?", "Ever taken naps before lunches?", True),
        ("Ever taken a nap before lunch?", "Ever grown a tomato bigger than your fist?", False),
        ("Ever napped in a hammock?", "Ever baked bread for the whole street?", False),
    ],
)
def test_statements_repeat(first: str, second: str, expected: bool) -> None:
    assert statements_repeat(first, second) is expected


def test_repeat_inside_one_reply_is_dropped() -> None:
    twin = {**VALID_ITEMS[0], "statement": "Ever taken a nap after lunch on a Tuesday?"}
    assert len(_filter([VALID_ITEMS[0], twin])) == 1


def test_avoid_list_blocks_statements_the_book_already_prints() -> None:
    (first, *_rest) = _filter(VALID_ITEMS)
    kept = _filter(VALID_ITEMS, avoid=[avoid_label(first)])
    assert first.statement not in [item.statement for item in kept]
    assert len(kept) == len(VALID_ITEMS) - 1


def test_avoid_label_stays_inside_the_cap() -> None:
    for item in _filter(VALID_ITEMS):
        label = avoid_label(item)
        assert 0 < len(label) <= 60
        assert "ever" not in label.split()


def test_cap_is_respected() -> None:
    assert len(_filter(VALID_ITEMS, cap=2)) == 2


def test_prompt_carries_one_brief_per_statement_and_the_rules() -> None:
    prompt = build_prompt_for_tests(_req(mixedTopics=True, count=6))
    for index in range(1, 7):
        assert f"\n{index}. topic: " in prompt
    assert "\n7. " not in prompt.split("How to build")[0]
    assert "past participle" in prompt
    assert "at most 64 characters" in prompt
    assert "everyday retirement life" in prompt


def test_prompt_for_a_chosen_theme_stays_on_it() -> None:
    prompt = build_prompt_for_tests(_req(theme="Gardening", mixedTopics=False))
    assert "Every statement is about Gardening" in prompt
    assert "topic: " not in prompt.split("How to build")[0]


def test_briefs_change_with_the_seed() -> None:
    head = lambda seed: build_prompt_for_tests(_req(mixedTopics=True), seed=seed).split(  # noqa: E731
        "How to build"
    )[0]
    assert head(1) != head(2)
    assert head(3) == head(3)


def test_style_controls_the_tone_of_every_brief() -> None:
    playful = build_prompt_for_tests(_req(style="playful"))
    gentle = build_prompt_for_tests(_req(style="gentle"))
    assert "Warm and gentle" not in playful.split("How to build")[0]
    assert "Light and funny" not in gentle.split("How to build")[0]


def test_generate_retries_invalid_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    async def fake_gemini(_prompt: str) -> str:
        calls["n"] += 1
        return "not json" if calls["n"] == 1 else json.dumps(VALID)

    monkeypatch.setattr(f"{SERVICE}._call_gemini", fake_gemini)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)

    result = asyncio.run(generate_ever_or_never(_req(), user_id="user-1"))
    assert len(result.items) == 4
    assert calls["n"] == 2


def test_generate_keeps_statements_across_attempts(monkeypatch: pytest.MonkeyPatch) -> None:
    replies = iter([{"items": VALID_ITEMS[:1]}, {"items": VALID_ITEMS[1:]}])
    prompts: list[str] = []

    async def fake_gemini(prompt: str) -> str:
        prompts.append(prompt)
        return json.dumps(next(replies))

    monkeypatch.setattr(f"{SERVICE}._call_gemini", fake_gemini)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)

    result = asyncio.run(generate_ever_or_never(_req(seed=3), user_id="user-2"))
    assert len(result.items) == 4
    # The retry is told what the first attempt already kept.
    assert "taken nap before lunch" in prompts[1]


def test_generate_remembers_what_it_wrote(monkeypatch: pytest.MonkeyPatch) -> None:
    prompts: list[str] = []

    async def fake_gemini(prompt: str) -> str:
        prompts.append(prompt)
        return json.dumps(VALID)

    monkeypatch.setattr(f"{SERVICE}._call_gemini", fake_gemini)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)

    asyncio.run(generate_ever_or_never(_req(seed=5), user_id="user-5"))
    with pytest.raises(EverOrNeverGenerationError):
        # Same reply again: every statement now repeats the first page.
        asyncio.run(generate_ever_or_never(_req(seed=6), user_id="user-5"))
    assert "tomato" in prompts[-1]


def test_generate_gives_up_after_three_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    async def fake_gemini(_prompt: str) -> str:
        calls["n"] += 1
        return json.dumps({"items": [{"statement": "Ever relaxed?"}]})

    monkeypatch.setattr(f"{SERVICE}._call_gemini", fake_gemini)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)

    with pytest.raises(EverOrNeverGenerationError):
        asyncio.run(generate_ever_or_never(_req(seed=1), user_id="user-4"))
    assert calls["n"] == 3


def test_response_serialises_statement_and_topic() -> None:
    (item,) = _filter(VALID_ITEMS[:1])
    assert set(item.model_dump(by_alias=True)) == {"statement", "topic"}


def test_request_bounds_are_validated() -> None:
    with pytest.raises(ValueError):
        _req(count=40)
    with pytest.raises(ValueError):
        _req(maxStatementChars=10)
    with pytest.raises(ValueError):
        _req(style="spicy")
