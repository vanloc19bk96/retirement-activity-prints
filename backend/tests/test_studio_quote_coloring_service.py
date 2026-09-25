from __future__ import annotations

import asyncio
import json
import re

import pytest

from app.schemas.studio_quote_coloring import QuoteColoringRequest
from app.services.studio_quote_coloring_service import (
    CHECK_FLAGS,
    QuoteColoringGenerationError,
    apply_check,
    avoid_label,
    build_check_prompt,
    build_prompt_for_tests,
    filter_sayings,
    generate_quote_coloring,
    is_famous,
    normalize_saying,
    parse_payload_for_tests,
    sayings_repeat,
)
from app.services.studio_variety import reset_memory

SERVICE = "app.services.studio_quote_coloring_service"

VALID_SAYINGS = [
    "My calendar only lists sunsets now",
    "The porch is my new corner office",
    "Every Tuesday feels like a picnic",
    "Plant something new each spring",
    "Less rushing, more wandering down side streets",
    "Today I report to the garden",
]

VALID = {"items": [{"brief": i + 1, "idea": "x", "text": text} for i, text in enumerate(VALID_SAYINGS)]}

_SAYING_RE = re.compile(r"^(\d+)\. (.+)$")


def fake_checker(*, stale: frozenset[str] = frozenset(), awkward: frozenset[str] = frozenset()):
    """Answers the cold read from a truth table."""

    async def check(prompt: str) -> str:
        items = []
        in_list = False
        for line in prompt.splitlines():
            if line.strip() == "SAYINGS":
                in_list = True
                continue
            if in_list and (match := _SAYING_RE.match(line)):
                text = match.group(2)
                entry = {flag: True for flag in CHECK_FLAGS}
                entry["index"] = int(match.group(1))
                entry["original"] = text not in stale
                entry["natural"] = text not in awkward
                items.append(entry)
        return json.dumps({"items": items})

    return check


async def _valid_writer(_prompt: str) -> str:
    return json.dumps(VALID)


def _patch(monkeypatch: pytest.MonkeyPatch, writer, checker) -> None:
    monkeypatch.setattr(f"{SERVICE}._call_writer", writer)
    monkeypatch.setattr(f"{SERVICE}._call_checker", checker)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)


@pytest.fixture(autouse=True)
def _fresh_memory():
    reset_memory()
    yield
    reset_memory()


def _run(req: QuoteColoringRequest):
    return asyncio.run(generate_quote_coloring(req, user_id="u1"))


# ---------------------------------------------------------------- shape


def test_parse_valid_json() -> None:
    assert len(parse_payload_for_tests(json.dumps(VALID))) == len(VALID_SAYINGS)


def test_parse_invalid_json_raises() -> None:
    with pytest.raises(ValueError):
        parse_payload_for_tests("not json")


def test_every_valid_saying_survives_unchanged() -> None:
    for text in VALID_SAYINGS:
        assert normalize_saying(text, max_chars=64) == text


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("1. The porch is my new corner office", "The porch is my new corner office"),
        ("Saying: The porch is my new corner office", "The porch is my new corner office"),
        ("  The porch is my new corner office.  ", "The porch is my new corner office"),
        ("Pack light, wander far - the map can wait", "Pack light, wander far, the map can wait"),
        ("Who needs Mondays? I have mornings!", "Who needs Mondays? I have mornings!"),
        ("Today’s plan is the garden", "Today's plan is the garden"),
        ('"The porch is my new corner office"', "The porch is my new corner office"),
    ],
)
def test_normalize_makes_only_mechanical_edits(raw: str, expected: str) -> None:
    assert normalize_saying(raw, max_chars=64) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "Nap",  # too short
        "Coffee, garden, walk, lunch, nap, book, sunset, stars, dreams, more coffee, tea, cake",
        'The porch is my "new" corner office',  # quotation marks inside
        "The porch is my new corner office - Unknown",  # attributed
        "THE PORCH IS MY NEW CORNER OFFICE",  # shouted
        "the porch is my new corner office",  # no capital
        "Seven days of sunshine, 365 days a year",  # digits
        "The porch is my new office... mostly",  # ellipsis
        "The porch: my new corner office",  # colon
        "Wow!! The porch is my office",  # doubled punctuation
        "The porch ,my new office",  # broken spacing
        "Retirement is extraordinarily wonderful stuff",  # word too long to letter
        "Live laugh love in the garden",  # famous
        "Not all who wander are lost, just retired",  # famous
        "Growing old is a garden party",  # age
        "Retirement means no more doctor visits at lunch",  # health
        "Retirement tastes like Starbucks on a Tuesday",  # brand
        "Good wine and slow mornings",  # alcohol
        "Sunshine is my new schedule",  # the prompt's own example
        "One. Two. Three. The garden awaits",  # too many sentences
    ],
)
def test_unprintable_sayings_are_refused(raw: str) -> None:
    assert normalize_saying(raw, max_chars=64) is None


def test_the_character_budget_is_the_page_budget() -> None:
    text = "Less rushing, more wandering down side streets"
    assert normalize_saying(text, max_chars=len(text)) == text
    assert normalize_saying(text, max_chars=len(text) - 1) is None


def test_famous_lines_are_caught_with_apostrophes_and_case_folded() -> None:
    assert is_famous("Oh, the places you’ll go this spring")
    assert is_famous("LIVE, LAUGH, LOVE")
    assert not is_famous("The porch is my new corner office")


# ---------------------------------------------------------------- repeats


@pytest.mark.parametrize(
    "first, second, expected",
    [
        (
            "Retirement means more time for what matters",
            "Retirement gives you more time for what really matters",
            True,
        ),
        ("Mornings are for coffee and birdsong", "My mornings are for tea and birdsong", True),
        ("The porch is my new corner office", "The porch is my new corner office!", True),
        ("The porch is my new corner office", "Every Tuesday feels like a picnic", False),
        ("Plant something new each spring", "Pack light and wander far", False),
    ],
)
def test_sayings_repeat(first: str, second: str, expected: bool) -> None:
    assert sayings_repeat(first, second) is expected


def test_a_saying_repeating_another_is_dropped() -> None:
    raw = [*VALID_SAYINGS, "Each spring, plant something new"]
    assert filter_sayings(raw, max_chars=64, cap=20) == VALID_SAYINGS


def test_no_more_than_two_sayings_open_the_same_way() -> None:
    raw = [
        "Retirement is a porch with a view",
        "Retirement is the long way home",
        "Retirement is a garden that keeps growing",
    ]
    assert filter_sayings(raw, max_chars=64, cap=20) == raw[:2]


def test_the_book_history_is_enforced_through_compact_labels() -> None:
    label = avoid_label("The porch is my new corner office")
    kept = filter_sayings(VALID_SAYINGS, max_chars=64, cap=20, avoid=[label])
    assert "The porch is my new corner office" not in kept
    assert len(kept) == len(VALID_SAYINGS) - 1


# ---------------------------------------------------------------- check


def test_the_check_prompt_numbers_every_saying() -> None:
    prompt = build_check_prompt(VALID_SAYINGS)
    for index, text in enumerate(VALID_SAYINGS):
        assert f"{index + 1}. {text}" in prompt


def test_only_sayings_passing_every_flag_are_kept() -> None:
    entries = [{"index": i + 1, **{flag: True for flag in CHECK_FLAGS}} for i in range(3)]
    entries[1]["original"] = False
    kept = apply_check(VALID_SAYINGS[:3], {"items": entries})
    assert kept == [VALID_SAYINGS[0], VALID_SAYINGS[2]]


def test_a_missing_or_duplicated_entry_fails_its_saying() -> None:
    passing = {flag: True for flag in CHECK_FLAGS}
    entries = [{"index": 1, **passing}, {"index": 1, **passing}, {"index": 3, **passing}]
    assert apply_check(VALID_SAYINGS[:3], {"items": entries}) == [VALID_SAYINGS[2]]


def test_a_malformed_check_drops_everything() -> None:
    assert apply_check(VALID_SAYINGS, {"items": "nope"}) == []
    assert apply_check(VALID_SAYINGS, {}) == []


# ---------------------------------------------------------------- prompt


def test_prompt_gives_every_saying_its_own_brief() -> None:
    prompt = build_prompt_for_tests(QuoteColoringRequest(count=6, seed=5))
    briefs = [line for line in prompt.splitlines() if re.match(r"^\d+\. topic: ", line)]
    assert len(briefs) == 10
    forms = [line.split("form: ")[1].split(";")[0] for line in briefs]
    assert len(set(forms)) == len(forms)


def test_prompt_follows_the_tone_and_a_chosen_theme() -> None:
    prompt = build_prompt_for_tests(
        QuoteColoringRequest(count=4, seed=5, tone="playful", mixedTopics=False, theme="Garden Days")
    )
    assert "Every saying is about Garden Days" in prompt
    assert "topic:" not in prompt
    assert "calm and unhurried" not in prompt


def test_a_tight_budget_asks_only_for_short_sayings() -> None:
    prompt = build_prompt_for_tests(QuoteColoringRequest(count=4, seed=5, maxChars=26))
    assert "9 to 11 words" not in prompt and "6 to 8 words" not in prompt
    assert "At most 26 characters" in prompt or "at most 26 characters" in prompt.lower()


def test_different_seeds_give_different_briefs() -> None:
    a = build_prompt_for_tests(QuoteColoringRequest(seed=1))
    b = build_prompt_for_tests(QuoteColoringRequest(seed=2))
    assert a != b


# ---------------------------------------------------------------- run


def test_generate_returns_only_checked_sayings(monkeypatch: pytest.MonkeyPatch) -> None:
    stale = VALID_SAYINGS[2]
    _patch(monkeypatch, _valid_writer, fake_checker(stale=frozenset({stale})))
    result = _run(QuoteColoringRequest(count=6, seed=4))
    texts = [item.text for item in result.items]
    assert stale not in texts
    assert len(texts) == len(VALID_SAYINGS) - 1
    assert all(item.verified for item in result.items)


def test_generate_never_ships_unchecked_sayings_when_the_check_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def broken_checker(_prompt: str) -> str:
        raise RuntimeError("model down")

    _patch(monkeypatch, _valid_writer, broken_checker)
    with pytest.raises(QuoteColoringGenerationError):
        _run(QuoteColoringRequest(count=6, seed=4))


def test_generate_tops_up_across_attempts(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    async def writer(_prompt: str) -> str:
        calls["n"] += 1
        half = VALID["items"][:2] if calls["n"] == 1 else VALID["items"][2:]
        return json.dumps({"items": half})

    _patch(monkeypatch, writer, fake_checker())
    result = _run(QuoteColoringRequest(count=6, seed=4))
    assert calls["n"] == 2
    assert len(result.items) == len(VALID_SAYINGS)


def test_generate_remembers_what_it_printed(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(monkeypatch, _valid_writer, fake_checker())
    first = _run(QuoteColoringRequest(count=6, seed=4))
    assert len(first.items) == len(VALID_SAYINGS)
    # Same seller, same theme: the same reply is now all repeats.
    with pytest.raises(QuoteColoringGenerationError):
        _run(QuoteColoringRequest(count=6, seed=9))


def test_generate_fails_clearly_on_garbage(monkeypatch: pytest.MonkeyPatch) -> None:
    async def writer(_prompt: str) -> str:
        return json.dumps({"items": [{"brief": 1, "idea": "x", "text": "hello"}]})

    _patch(monkeypatch, writer, fake_checker())
    with pytest.raises(QuoteColoringGenerationError):
        _run(QuoteColoringRequest(count=6, seed=4))
