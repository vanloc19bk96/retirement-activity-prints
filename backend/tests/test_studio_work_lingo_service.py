from __future__ import annotations

import asyncio
import json
import re

import pytest

from app.schemas.studio_work_lingo import WorkLingoPair, WorkLingoRequest
from app.services.studio_work_lingo_service import (
    Budgets,
    WorkLingoGenerationError,
    apply_check,
    build_check_plan,
    build_prompt_for_tests,
    filter_pairs,
    generate_work_lingo,
    meanings_clash,
    normalize_meaning,
    normalize_pair,
    normalize_phrase,
    parse_payload_for_tests,
    phrase_label,
    phrases_related,
    phrases_repeat,
)
from app.services.studio_variety import reset_memory

SERVICE = "app.services.studio_work_lingo_service"
BUDGETS = Budgets(phrase=28, meaning=50)

VALID_PAIRS = [
    {"phrase": "Circle back", "meaning": "Return to the topic later"},
    {"phrase": "Touch base", "meaning": "Briefly check in with someone"},
    {"phrase": "Low-hanging fruit", "meaning": "Easy wins to go after first"},
    {"phrase": "Move the needle", "meaning": "Make a noticeable difference"},
    {"phrase": "Think outside the box", "meaning": "Come up with fresh, unusual ideas"},
    {"phrase": "Keep me in the loop", "meaning": "Keep me informed as things change"},
    {"phrase": "Hit the ground running", "meaning": "Start a new job at full speed"},
    {"phrase": "Ballpark figure", "meaning": "A rough estimate of a number"},
]

VALID = {
    "items": [{"brief": i + 1, "area": "meetings", **pair} for i, pair in enumerate(VALID_PAIRS)]
}
MEANING_FOR = {pair["phrase"]: pair["meaning"] for pair in VALID_PAIRS}

_PHRASE_RE = re.compile(r"^(\d+)\. (.+)$")
_MEANING_RE = re.compile(r"^([A-Z])\. (.+)$")


def _read_plan(prompt: str) -> tuple[list[tuple[int, str]], dict[str, str]]:
    phrases: list[tuple[int, str]] = []
    letters: dict[str, str] = {}
    section = ""
    for line in prompt.splitlines():
        if line.strip() in ("PHRASES", "MEANINGS"):
            section = line.strip()
            continue
        if section == "PHRASES" and (match := _PHRASE_RE.match(line)):
            phrases.append((int(match.group(1)), match.group(2)))
        elif section == "MEANINGS" and (match := _MEANING_RE.match(line)):
            letters[match.group(2)] = match.group(1)
    return phrases, letters


def fake_checker(
    *,
    mismatch: frozenset[str] = frozenset(),
    invented: frozenset[str] = frozenset(),
    seen: list[list[str]] | None = None,
):
    """Answers the blind prompt from a truth table, like a checker that knows every phrase."""

    async def check(prompt: str) -> str:
        phrases, letters = _read_plan(prompt)
        if seen is not None:
            seen.append([phrase for _, phrase in phrases])
        items = []
        for index, phrase in phrases:
            meaning = MEANING_FOR[phrase]
            letter = "none" if phrase in mismatch else letters[meaning]
            items.append(
                {"index": index, "match": letter, "real": phrase not in invented,
                 "accurate": True, "one_meaning": True, "familiar": True, "suitable": True}
            )
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


def _pairs() -> list[WorkLingoPair]:
    return filter_pairs(VALID["items"], budgets=BUDGETS, cap=20)


def test_parse_valid_json() -> None:
    assert len(parse_payload_for_tests(json.dumps(VALID))) == len(VALID_PAIRS)


def test_parse_invalid_json_raises() -> None:
    with pytest.raises(ValueError):
        parse_payload_for_tests('{"items": []}')


def test_every_valid_pair_is_well_formed_but_not_yet_verified() -> None:
    pairs = _pairs()
    assert [pair.phrase for pair in pairs] == [pair["phrase"] for pair in VALID_PAIRS]
    assert all(pair.verified is False for pair in pairs)


def test_input_cannot_claim_to_be_verified() -> None:
    pair = normalize_pair({**VALID_PAIRS[0], "verified": True}, budgets=BUDGETS)
    assert pair is not None and pair.verified is False


@pytest.mark.parametrize(
    "change",
    [
        {"phrase": ""},
        {"phrase": None},
        {"meaning": ""},
        {"phrase": "ASAP"},  # an acronym, not an expression
        {"phrase": "circle back"},  # lowercase start
        {"phrase": "Circle back!"},
        {"phrase": "Let us all circle back to this one later on"},  # too many words
        {"phrase": "Circle back 2"},
        {"meaning": "Later"},  # too short to identify anything
        {"meaning": "return to the topic later"},
        {"meaning": "Return to the topic; later"},
        {"meaning": "Return to the \"topic\" later"},
        {"meaning": "Circle around to the topic later"},  # repeats its own phrase
        {"meaning": "Return to the topic at some later point when everyone is free"},
    ],
)
def test_a_pair_of_the_wrong_shape_is_dropped(change: dict) -> None:
    assert normalize_pair({**VALID_PAIRS[0], **change}, budgets=BUDGETS) is None


@pytest.mark.parametrize(
    "phrase",
    [
        "Drink the Kool-Aid",
        "Low man on the totem pole",
        "Put out to pasture",
        "Kill two birds with one stone",
        "Hail Mary pass",
        "Happy hour",
        "Dead in the water",
        "Xerox it",
    ],
)
def test_unsuitable_phrases_are_refused(phrase: str) -> None:
    assert normalize_phrase(phrase, budget=28) is None


def test_normalize_strips_labels_and_numbering() -> None:
    assert normalize_phrase('1. Phrase: "Circle back"', budget=28) == "Circle back"
    assert normalize_meaning("Meaning: Return to the topic later.", budget=50) == (
        "Return to the topic later"
    )
    assert normalize_meaning("C. Return to the topic later", budget=50) == (
        "Return to the topic later"
    )
    # "A" as an article is part of the meaning, not a letter label.
    assert normalize_meaning("A rough estimate of a number", budget=50) == (
        "A rough estimate of a number"
    )


def test_one_phrase_in_other_words_is_a_repeat() -> None:
    assert phrases_repeat("Back burner", "Put it on the back burner")
    assert phrases_repeat("Circling back", "Circle back")
    assert phrases_repeat("Touching base", "touch base")
    assert not phrases_repeat("Touch base", "Circle back")


def test_phrases_sharing_a_word_are_one_family() -> None:
    assert phrases_related("Circle back", "Back burner")
    assert phrases_related("Loop someone in", "Keep me in the loop")
    assert not phrases_related("Touch base", "Move the needle")


def test_meanings_that_read_alike_clash() -> None:
    assert meanings_clash("Return to the topic later", "Return to this topic at a later time")
    assert not meanings_clash("Return to the topic later", "Briefly check in with someone")


def test_a_pair_conflicting_with_the_pool_is_dropped() -> None:
    extra = [
        {"phrase": "Back burner", "meaning": "Set aside as a low priority"},  # family of "Circle back"
        {"phrase": "Put a pin in it", "meaning": "Return to that topic later"},  # meaning clashes
        {"phrase": "Game plan", "meaning": "A strategy to touch every goal"},  # echoes "Touch base"
        {"phrase": "Circle back", "meaning": "Discuss this again at a later time"},  # same phrase
    ]
    kept = filter_pairs([*VALID["items"], *extra], budgets=BUDGETS, cap=20)
    assert [pair.phrase for pair in kept] == [pair["phrase"] for pair in VALID_PAIRS]


def test_the_book_history_is_enforced_through_compact_labels() -> None:
    avoid = [phrase_label("Circling back"), "Put it on the back burner", "touch base"]
    kept = filter_pairs(VALID["items"], budgets=BUDGETS, cap=20, avoid=avoid)
    phrases = [pair.phrase for pair in kept]
    assert "Circle back" not in phrases and "Touch base" not in phrases
    assert len(phrases) == len(VALID_PAIRS) - 2


def test_the_check_prompt_never_pairs_phrases_with_their_meanings() -> None:
    pairs = _pairs()
    plan = build_check_plan(pairs, seed=7)
    phrases, letters = _read_plan(plan.prompt)
    assert [phrase for _, phrase in phrases] == [pair.phrase for pair in pairs]
    assert sorted(letters) == sorted(pair.meaning for pair in pairs)
    assert list(plan.meaning_order) != list(range(len(pairs)))
    # The level's familiarity bar reaches the checker.
    assert "brand-new slang" in build_check_plan(pairs, seed=7, level="challenging").prompt


def _check_reply(pairs: list[WorkLingoPair], plan, overrides: dict[int, dict] | None = None) -> dict:
    letter_of = {k: chr(65 + pos) for pos, k in enumerate(plan.meaning_order)}
    items = []
    for index in range(len(pairs)):
        entry = {"index": index + 1, "match": letter_of[index], "real": True, "accurate": True,
                 "one_meaning": True, "familiar": True, "suitable": True}
        entry.update((overrides or {}).get(index, {}))
        items.append(entry)
    return {"items": items}


def test_only_pairs_the_checker_matches_and_passes_are_verified() -> None:
    pairs = _pairs()
    plan = build_check_plan(pairs, seed=3)
    reply = _check_reply(pairs, plan, {1: {"match": "none"}, 2: {"real": False}, 3: {"one_meaning": False}})
    kept = apply_check(pairs, plan, reply)
    assert [pair.phrase for pair in kept] == [pairs[i].phrase for i in (0, 4, 5, 6, 7)]
    assert all(pair.verified for pair in kept)


def test_a_meaning_picked_for_two_phrases_fails_both() -> None:
    pairs = _pairs()
    plan = build_check_plan(pairs, seed=3)
    zero = chr(65 + plan.meaning_order.index(0))
    kept = apply_check(pairs, plan, _check_reply(pairs, plan, {1: {"match": zero}}))
    phrases = [pair.phrase for pair in kept]
    assert pairs[0].phrase not in phrases and pairs[1].phrase not in phrases
    assert len(phrases) == len(pairs) - 2


def test_a_malformed_check_drops_everything() -> None:
    pairs = _pairs()
    plan = build_check_plan(pairs, seed=3)
    for raw in ({}, {"items": "nope"}, {"items": [{"index": "x"}, None]}):
        assert apply_check(pairs, plan, raw) == []


def test_prompt_gives_every_pair_its_own_brief_and_level() -> None:
    req = WorkLingoRequest(level="gentle", count=10, seed=5)
    prompt = build_prompt_for_tests(req)
    briefs = re.findall(r"^\d+\. area: ([^;]+);", prompt, flags=re.MULTILINE)
    assert len(briefs) == 14
    assert len(set(briefs)) == 14
    assert "Gentle:" in prompt
    assert build_prompt_for_tests(req, seed=6) != prompt


def _run(req: WorkLingoRequest):
    return asyncio.run(generate_work_lingo(req, user_id="u1"))


def test_generate_returns_only_checked_pairs(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(monkeypatch, _valid_writer, fake_checker(mismatch=frozenset({"Touch base"}), invented=frozenset({"Move the needle"})))
    result = _run(WorkLingoRequest(count=8, seed=1))
    phrases = [pair.phrase for pair in result.pairs]
    assert "Touch base" not in phrases and "Move the needle" not in phrases
    assert len(phrases) == 6
    assert all(pair.verified for pair in result.pairs)
    assert all(MEANING_FOR[pair.phrase] == pair.meaning for pair in result.pairs)


def test_generate_never_ships_unchecked_pairs_when_the_check_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def broken(_prompt: str) -> str:
        raise RuntimeError("checker down")

    _patch(monkeypatch, _valid_writer, broken)
    with pytest.raises(WorkLingoGenerationError):
        _run(WorkLingoRequest(count=8, seed=1))


def test_generate_checks_the_whole_pool_when_it_tops_up(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    async def writer(_prompt: str) -> str:
        calls["n"] += 1
        items = VALID["items"][:3] if calls["n"] == 1 else VALID["items"][3:]
        return json.dumps({"items": items})

    seen: list[list[str]] = []
    _patch(monkeypatch, writer, fake_checker(seen=seen))
    result = _run(WorkLingoRequest(count=8, seed=1))
    assert calls["n"] == 2
    # The second check saw the first round's pairs beside the new ones.
    assert seen[1] == [pair["phrase"] for pair in VALID_PAIRS]
    assert [pair.phrase for pair in result.pairs] == [pair["phrase"] for pair in VALID_PAIRS]


def test_generate_remembers_what_it_printed(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(monkeypatch, _valid_writer, fake_checker())
    first = _run(WorkLingoRequest(count=8, seed=1))
    assert len(first.pairs) == len(VALID_PAIRS)
    # The same reply again: every phrase is already printed, so nothing survives.
    with pytest.raises(WorkLingoGenerationError):
        _run(WorkLingoRequest(count=8, seed=2))


def test_generate_fails_clearly_on_garbage(monkeypatch: pytest.MonkeyPatch) -> None:
    async def garbage(_prompt: str) -> str:
        return "not json"

    _patch(monkeypatch, garbage, fake_checker())
    with pytest.raises(WorkLingoGenerationError):
        _run(WorkLingoRequest(count=8, seed=1))
