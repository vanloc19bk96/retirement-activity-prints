from __future__ import annotations

import asyncio
import json

import pytest

from app.schemas.studio_retired_name import RetiredNameRequest, RetiredNameResponse
from app.services.studio_retired_name_service import (
    RetiredNameGenerationError,
    build_prompt_for_tests,
    filter_first_names,
    filter_last_names,
    generate_retired_name,
    is_agent_head,
    last_names_repeat,
    names_clash,
    normalize_first_name,
    normalize_last_name,
    parse_payload_for_tests,
)
from app.services.studio_variety import reset_memory

SERVICE = "app.services.studio_retired_name_service"

FIRST_NAMES = [
    "Captain", "Breezy", "Admiral", "Mellow", "Commodore", "Jolly", "Professor", "Sunny",
    "Skipper", "Dapper", "Maestro", "Toasty", "Coach", "Chipper", "Ranger", "Merry",
    "Big Cheese", "Cozy", "Navigator", "Snappy", "Marshal", "Lucky", "Easygoing", "Peppy",
    "Chief", "Nifty", "Rosy", "Zippy",
]
LAST_NAMES = [
    ("napping in a hammock", "Hammock Snoozer"),
    ("rocking on the porch", "Porch Rocker"),
    ("crossword puzzles", "Crossword Champ"),
    ("golf", "Fairway Explorer"),
    ("growing tomatoes", "Tomato Whisperer"),
    ("afternoon tea and biscuits", "Biscuit Dunker"),
    ("growing vegetables", "Garden Putterer"),
    ("cruise ships", "Cruise Hopper"),
    ("watching sunsets", "Sunset Chaser"),
    ("pancake breakfasts", "Pancake Flipper"),
    ("kite flying", "Kite Flyer"),
    ("hiking trails", "Trail Wanderer"),
    ("jigsaw puzzles", "Jigsaw Solver"),
    ("building birdhouses", "Birdhouse Maker"),
]

VALID = {
    "first_names": [{"brief": i + 1, "name": name} for i, name in enumerate(FIRST_NAMES)],
    "last_names": [
        {"brief": i + 1, "pastime": pastime, "name": name}
        for i, (pastime, name) in enumerate(LAST_NAMES)
    ],
}


@pytest.fixture(autouse=True)
def _fresh_memory() -> None:
    reset_memory()


def _req(**overrides) -> RetiredNameRequest:
    base = {"theme": "Life after work", "seed": 7}
    base.update(overrides)
    return RetiredNameRequest(**base)


def _patch(monkeypatch: pytest.MonkeyPatch, fake) -> None:
    monkeypatch.setattr(f"{SERVICE}._call_gemini", fake)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)


# ---------------------------------------------------------------- parsing


def test_parse_valid_json() -> None:
    first, last = parse_payload_for_tests(json.dumps(VALID))
    assert len(first) == len(FIRST_NAMES)
    assert len(last) == len(LAST_NAMES)


def test_parse_accepts_camel_case_keys() -> None:
    first, last = parse_payload_for_tests(
        json.dumps({"firstNames": ["Captain"], "lastNames": ["Porch Rocker"]})
    )
    assert first == ["Captain"] and last == ["Porch Rocker"]


@pytest.mark.parametrize("raw", ["not json", "{}", '{"first_names": "x"}', '{"first_names": []}'])
def test_parse_rejects_malformed(raw: str) -> None:
    with pytest.raises(ValueError):
        parse_payload_for_tests(raw)


def test_response_serialises_camel_case() -> None:
    dumped = RetiredNameResponse(first_names=["Captain"], last_names=["Porch Rocker"]).model_dump(
        by_alias=True
    )
    assert dumped == {"firstNames": ["Captain"], "lastNames": ["Porch Rocker"]}


# ---------------------------------------------------------------- gates


def test_fixture_passes_every_gate() -> None:
    assert filter_first_names(FIRST_NAMES, budget=10, cap=40) == FIRST_NAMES
    assert filter_last_names([n for _, n in LAST_NAMES], budget=16, cap=20) == [
        n for _, n in LAST_NAMES
    ]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Captain", "Captain"),
        ("captain", "Captain"),
        ("  BREEZY. ", "Breezy"),
        ("big cheese", "Big Cheese"),
        ("Cap'n", "Cap'n"),
        ({"brief": 1, "name": "Commodore"}, "Commodore"),
    ],
)
def test_first_name_normalises(raw, expected: str) -> None:
    assert normalize_first_name(raw, budget=11) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "Sir",
        "Lady Luck",
        "Grandma",
        "Old Timer",
        "Lazy",
        "Grumpy",
        "Golf Pro",
        "Chief Snoozer",
        "Captain Jack Sparrow",
        "Extraordinaire",
        "Sunny2",
        "Xzqrtp",
        "Disney",
        "Tipsy",
    ],
)
def test_first_name_rejects(raw: str) -> None:
    assert normalize_first_name(raw, budget=11) is None


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Hammock Snoozer", "Hammock Snoozer"),
        ("hammock snoozer", "Hammock Snoozer"),
        ("tee-time tinkerer", "Tee-Time Tinkerer"),
        ("Crossword Champ", "Crossword Champ"),
        ("Museum Visitor", "Museum Visitor"),
        ("Book Lover", "Book Lover"),
        ("Porch Rocker!!!!?", "Porch Rocker"),
    ],
)
def test_last_name_normalises(raw: str, expected: str) -> None:
    assert normalize_last_name(raw, budget=18) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "Hammock",
        "Hammock Snoozer Deluxe",
        "Garden Flower",
        "Garden Sunflower",
        "Snoozer Hammock",
        "Wine Sipper",
        "Grumpy Golfer",
        "Hammock Queen",
        "Pill Counter",
        "Birdfeeder Whisperer",
    ],
)
def test_last_name_rejects(raw: str) -> None:
    assert normalize_last_name(raw, budget=18) is None


def test_agent_heads() -> None:
    for word in ["Snoozer", "Collector", "Florist", "Champ", "Whiz", "Tee-Time-Tinkerer"]:
        assert is_agent_head(word), word
    for word in ["Water", "Sunflower", "Hammock", "Winter", "Doctor", "Ever"]:
        assert not is_agent_head(word), word


def test_roots_clash_on_shared_words_only() -> None:
    assert names_clash("Snoozy", "Hammock Snoozer")
    assert names_clash("Garden Putterer", "Gardener Champ")
    assert not names_clash("Sunny", "Sunset Chaser")
    assert not names_clash("Captain", "Porch Rocker")


def test_last_name_repeats_are_whole_names() -> None:
    assert last_names_repeat("Hammock Snoozer", "Hammock Snoozers")
    assert last_names_repeat("Hammock Snoozer", "hammock snoozer")
    assert not last_names_repeat("Hammock Snoozer", "Porch Snoozer")
    assert not last_names_repeat("Hammock Snoozer", "Captain")


def test_filters_drop_near_repeats_within_a_list() -> None:
    assert filter_first_names(["Sunny", "Sunnyside", "Breezy", "Breezier"], budget=11, cap=10) == [
        "Sunny",
        "Breezy",
    ]
    kept = filter_last_names(
        ["Porch Rocker", "Porch Swinger", "Hammock Rocker", "Hammock Snoozer"], budget=18, cap=10
    )
    assert kept == ["Porch Rocker", "Hammock Snoozer"]


def test_last_names_already_printed_are_dropped() -> None:
    kept = filter_last_names(
        ["Porch Rocker", "Hammock Snoozer"], budget=18, cap=10, avoid=["hammock snoozers", "Captain"]
    )
    assert kept == ["Porch Rocker"]


def test_filters_respect_cap_and_budget() -> None:
    assert len(filter_first_names(FIRST_NAMES, budget=11, cap=5)) == 5
    assert "Commodore" not in filter_first_names(FIRST_NAMES, budget=8, cap=40)


# ---------------------------------------------------------------- prompt


def test_prompt_carries_budgets_and_one_brief_per_name() -> None:
    prompt = build_prompt_for_tests(_req(maxFirstChars=10, maxLastChars=16))
    assert "most 10 characters" in prompt
    assert "At most 16 characters" in prompt
    assert "F34." in prompt and "F35." not in prompt
    assert "L16." in prompt and "L17." not in prompt
    assert "pastime:" in prompt


def test_prompt_themed_uses_the_theme() -> None:
    prompt = build_prompt_for_tests(_req(theme="Golf", mixedTopics=False))
    assert "Theme: Golf." in prompt
    assert "part of Golf" in prompt


def test_prompt_briefs_change_with_seed() -> None:
    a = build_prompt_for_tests(_req(), seed=1)
    b = build_prompt_for_tests(_req(), seed=2)
    assert a != b


def test_prompt_can_ask_for_one_list_only() -> None:
    prompt = build_prompt_for_tests(_req(), want_first=0, want_last=4)
    assert '"first_names": []' in prompt
    assert "L4." in prompt and "F1." not in prompt


# ---------------------------------------------------------------- generate


def test_generate_returns_full_pools_in_one_call(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    async def fake(_prompt: str) -> str:
        calls["n"] += 1
        return json.dumps(VALID)

    _patch(monkeypatch, fake)
    result = asyncio.run(generate_retired_name(_req(), user_id="user-1"))
    assert result.first_names == FIRST_NAMES
    assert result.last_names == [n for _, n in LAST_NAMES]
    assert calls["n"] == 1


def test_generate_retries_invalid_json(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    async def fake(_prompt: str) -> str:
        calls["n"] += 1
        return "not json" if calls["n"] == 1 else json.dumps(VALID)

    _patch(monkeypatch, fake)
    result = asyncio.run(generate_retired_name(_req(), user_id="user-2"))
    assert len(result.first_names) == len(FIRST_NAMES)
    assert calls["n"] == 2


def test_generate_tops_up_only_what_is_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    replies = iter(
        [
            {"first_names": VALID["first_names"], "last_names": VALID["last_names"][:8]},
            {"first_names": [], "last_names": VALID["last_names"][8:]},
        ]
    )
    prompts: list[str] = []

    async def fake(prompt: str) -> str:
        prompts.append(prompt)
        return json.dumps(next(replies))

    _patch(monkeypatch, fake)
    result = asyncio.run(generate_retired_name(_req(seed=3), user_id="user-3"))
    assert len(result.last_names) == len(LAST_NAMES)
    # The retry asks for no first names, the shortfall of last names plus
    # spares, and is told what the first attempt already kept.
    assert '"first_names": []' in prompts[1]
    assert "L6." in prompts[1] and "L7." not in prompts[1]
    assert "Hammock Snoozer" in prompts[1]


def test_generate_drops_last_names_the_seller_already_printed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    prompts: list[str] = []

    async def fake(prompt: str) -> str:
        prompts.append(prompt)
        return json.dumps(VALID)

    _patch(monkeypatch, fake)
    asyncio.run(generate_retired_name(_req(seed=5), user_id="user-5"))
    again = asyncio.run(generate_retired_name(_req(seed=6), user_id="user-5"))
    # First names may recur across tables; last names are the page's content.
    assert again.first_names == FIRST_NAMES
    assert again.last_names == []
    assert "Hammock Snoozer" in prompts[-1]


def test_generate_gives_up_after_three_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    async def fake(_prompt: str) -> str:
        calls["n"] += 1
        return json.dumps({"first_names": ["Sir"], "last_names": ["Wine Sipper"]})

    _patch(monkeypatch, fake)
    with pytest.raises(RetiredNameGenerationError):
        asyncio.run(generate_retired_name(_req(seed=1), user_id="user-4"))
    assert calls["n"] == 3
