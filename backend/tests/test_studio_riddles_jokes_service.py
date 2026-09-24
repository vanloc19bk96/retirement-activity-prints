from __future__ import annotations

import asyncio
import json
import re

import pytest

from app.schemas.studio_riddles_jokes import RiddlesJokesItem, RiddlesJokesRequest
from app.services.studio_riddles_jokes_service import (
    Budgets,
    RiddlesJokesGenerationError,
    answers_repeat,
    apply_check,
    avoid_label,
    build_check_plan,
    build_prompt_for_tests,
    filter_items,
    generate_riddles_jokes,
    normalize_answer,
    normalize_item,
    normalize_setup,
    parse_payload_for_tests,
    setups_repeat,
)
from app.services.studio_variety import reset_memory

SERVICE = "app.services.studio_riddles_jokes_service"
BUDGETS = Budgets(setup=100, answer=64)

VALID_ITEMS = [
    {
        "kind": "riddle",
        "setup": "I have a face that used to shout at dawn, but now I let you sleep till nine. What am I?",
        "answer": "The alarm clock.",
    },
    {
        "kind": "joke",
        "setup": "What do you call a gardener who finally has time for every weed?",
        "answer": "A mulch-tasker.",
    },
    {
        "kind": "riddle",
        "setup": "I have a trunk but never pack for a holiday. What am I?",
        "answer": "An oak tree.",
    },
    {
        "kind": "joke",
        "setup": "Why was the hammock so popular on a Tuesday afternoon?",
        "answer": "Everyone wanted to hang out.",
    },
    {
        "kind": "riddle",
        "setup": "I get emptier every morning while your day gets brighter. What am I?",
        "answer": "Your coffee pot.",
    },
    {
        "kind": "joke",
        "setup": "What's the best thing about a calendar with no meetings on it?",
        "answer": "Every square is a day off.",
    },
]

VALID = {"items": [{"brief": i + 1, "idea": "x", **item} for i, item in enumerate(VALID_ITEMS)]}
ANSWER_FOR = {item["setup"]: item["answer"] for item in VALID_ITEMS}

_SETUP_RE = re.compile(r"^(\d+)\. \((riddle|joke)\) (.+)$")
_ANSWER_RE = re.compile(r"^([A-Z])\. (.+)$")


def fake_checker(*, mismatch: frozenset[str] = frozenset(), stale: frozenset[str] = frozenset()):
    """Answers the blind prompt from a truth table, like a checker that gets every joke."""

    async def check(prompt: str) -> str:
        setups: list[tuple[int, str]] = []
        letters: dict[str, str] = {}
        section = ""
        for line in prompt.splitlines():
            if line.strip() in ("SETUPS", "ANSWERS"):
                section = line.strip()
                continue
            if section == "SETUPS" and (match := _SETUP_RE.match(line)):
                setups.append((int(match.group(1)), match.group(3)))
            elif section == "ANSWERS" and (match := _ANSWER_RE.match(line)):
                letters[match.group(2)] = match.group(1)
        items = []
        for index, setup in setups:
            answer = ANSWER_FOR[setup]
            letter = "none" if setup in mismatch else letters[answer]
            items.append(
                {"index": index, "match": letter, "clear": True, "payoff": True,
                 "one_answer": True, "fresh": setup not in stale, "suitable": True}
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


def _items() -> list[RiddlesJokesItem]:
    return filter_items(VALID["items"], budgets=BUDGETS, cap=20)


def test_parse_valid_json() -> None:
    assert len(parse_payload_for_tests(json.dumps(VALID))) == len(VALID_ITEMS)


def test_parse_invalid_json_raises() -> None:
    with pytest.raises(ValueError):
        parse_payload_for_tests('{"items": []}')


def test_every_valid_item_is_well_formed_but_not_yet_verified() -> None:
    items = _items()
    assert [item.setup for item in items] == [item["setup"] for item in VALID_ITEMS]
    assert all(item.verified is False for item in items)


def test_input_cannot_claim_to_be_verified() -> None:
    item = normalize_item({**VALID_ITEMS[0], "verified": True}, budgets=BUDGETS)
    assert item is not None and item.verified is False


@pytest.mark.parametrize(
    "change",
    [
        {"kind": "limerick"},
        {"kind": None},
        {"setup": ""},
        {"answer": ""},
        {"answer": None},
        {"setup": "I have a trunk but never pack for a holiday."},  # not a question
        {"setup": "Is it a tree? Or is it a suitcase?"},  # two questions
        {"setup": "I HAVE A TRUNK BUT NEVER PACK FOR A HOLIDAY. WHAT AM I?"},
        {"setup": "Knock knock. Who is there on a free Tuesday?"},
        {"setup": "I have a trunk but never pack, said the \"tree\". What am I?"},
        {"answer": "Is it an oak tree?"},
        {"answer": "An enormous, very old oak tree standing in a field by the lane."},  # riddle answer too long
        {"setup": "I have a trunk and branches but I never pack for a trip. " * 3 + "What am I?"},
    ],
)
def test_an_item_of_the_wrong_shape_is_dropped(change: dict) -> None:
    assert normalize_item({**VALID_ITEMS[2], **change}, budgets=BUDGETS) is None


@pytest.mark.parametrize(
    "setup",
    [
        "Why did the retiree skip the doctor on a sunny Tuesday?",
        "What did the retiree forget at the retirement party?",
        "Why was the old man so slow at the golf course?",
        "What did the wife say when the husband retired?",
        "What do you call a retiree with no pension left?",
        "Why did the retiree order a second beer at lunch?",
        "What is a retiree's favourite Netflix show?",
        "What does a senior do with a free afternoon?",
    ],
)
def test_unsuitable_setups_are_refused(setup: str) -> None:
    assert normalize_setup(setup, budget=100) is None


def test_normalize_strips_labels_and_numbering() -> None:
    assert normalize_setup('2. Q: "What has a trunk but never packs?"', budget=100) == (
        "What has a trunk but never packs?"
    )
    assert normalize_answer("Answer: an oak tree", budget=64, kind="riddle") is None  # lowercase start
    assert normalize_answer("Answer: An oak tree", budget=64, kind="riddle") == "An oak tree."
    assert normalize_answer("A: Loafing around!", budget=64, kind="joke") == "Loafing around!"
    # "A" as an article is part of the answer, not a label.
    assert normalize_answer("A mulch-tasker", budget=64, kind="joke") == "A mulch-tasker."


def test_a_riddle_that_gives_its_answer_away_is_dropped() -> None:
    item = {
        "kind": "riddle",
        "setup": "I am the alarm clock you no longer set. What am I?",
        "answer": "The alarm clock.",
    }
    assert normalize_item(item, budgets=BUDGETS) is None


def test_the_mix_decides_which_kinds_are_kept() -> None:
    riddles = filter_items(VALID["items"], budgets=BUDGETS, cap=20, mix="riddles")
    jokes = filter_items(VALID["items"], budgets=BUDGETS, cap=20, mix="jokes")
    assert riddles and all(item.kind == "riddle" for item in riddles)
    assert jokes and all(item.kind == "joke" for item in jokes)


def test_the_prompt_examples_never_print() -> None:
    copied = {
        "kind": "joke",
        "setup": "What is a retired baker's favourite part of the day?",
        "answer": "Loafing around.",
    }
    assert normalize_item(copied, budgets=BUDGETS) is None


@pytest.mark.parametrize(
    ("first", "second", "expected"),
    [
        # The same joke with the nouns shuffled.
        (
            "Why did the retiree throw away the alarm clock?",
            "Why did the retired man get rid of his alarm clock?",
            True,
        ),
        (
            "What do you call a gardener who naps in the afternoon?",
            "What do you call a gardener who snoozes in the afternoon?",
            True,
        ),
        # Same subject, different jokes.
        (
            "What do you call a retired gardener?",
            "What's a gardener's favourite day of the week?",
            False,
        ),
        (
            "Why was the hammock so popular on a Tuesday afternoon?",
            "What did the coffee pot say to the kettle?",
            False,
        ),
    ],
)
def test_setups_repeat(first: str, second: str, expected: bool) -> None:
    assert setups_repeat(first, second) is expected


def test_the_same_answer_is_one_riddle() -> None:
    assert answers_repeat("The alarm clock.", "Your old alarm clock!")
    assert answers_repeat("An oak tree.", "oak tree")
    assert answers_repeat("A tree.", "An oak tree.")
    assert not answers_repeat("An oak tree.", "A coffee pot.")
    assert not answers_repeat("Day.", "Every square is a day off.")


def test_an_item_repeating_another_is_dropped() -> None:
    twin = {
        "kind": "joke",
        "setup": "Why was the hammock so popular on a Wednesday afternoon?",
        "answer": "Everybody wanted to hang out.",
    }
    kept = filter_items([*VALID["items"], twin], budgets=BUDGETS, cap=20)
    assert len(kept) == len(VALID_ITEMS)


def test_no_more_than_a_few_setups_open_the_same_way() -> None:
    whys = [
        {"kind": "joke", "setup": f"Why did the {noun} {verb}?", "answer": answer}
        for noun, verb, answer in [
            ("kettle", "whistle all morning", "It finally had time to sing."),
            ("hammock", "win an award", "It was outstanding at hanging around."),
            ("bicycle", "stay in the shed", "It was two tired."),
            ("jigsaw", "feel proud", "It finally had all the pieces together."),
        ]
    ]
    kept = filter_items(whys, budgets=BUDGETS, cap=20)
    assert len(kept) == 3


def test_the_book_history_is_enforced_through_compact_labels() -> None:
    printed = [avoid_label(VALID_ITEMS[0]["setup"]), avoid_label(VALID_ITEMS[2]["answer"])]
    kept = filter_items(VALID["items"], budgets=BUDGETS, cap=20, avoid=printed)
    setups = [item.setup for item in kept]
    assert VALID_ITEMS[0]["setup"] not in setups
    assert VALID_ITEMS[2]["setup"] not in setups
    assert len(kept) == len(VALID_ITEMS) - 2


def test_the_check_prompt_never_pairs_setups_with_their_answers() -> None:
    items = _items()
    plan = build_check_plan(items, seed=3)
    assert sorted(plan.answer_order) == list(range(len(items)))
    assert plan.answer_order != tuple(range(len(items)))
    for item in items:
        assert f") {item.setup}\n" in plan.prompt
        assert f". {item.answer}\n" in plan.prompt
        assert f"{item.setup} {item.answer}" not in plan.prompt


def test_only_items_the_checker_matches_and_passes_are_verified() -> None:
    items = _items()
    plan = build_check_plan(items, seed=5)
    letters = {k: chr(65 + pos) for pos, k in enumerate(plan.answer_order)}
    entries = [
        {"index": i + 1, "match": letters[i], "clear": True, "payoff": True,
         "one_answer": True, "fresh": True, "suitable": True}
        for i in range(len(items))
    ]
    entries[1]["payoff"] = False  # a flat joke
    entries[2]["match"] = letters[4]  # matched to the wrong answer
    entries[3]["fresh"] = False  # a well-known joke
    kept = apply_check(items, plan, {"items": entries})
    assert [item.setup for item in kept] == [items[0].setup, items[5].setup]
    assert all(item.verified for item in kept)


def test_an_answer_picked_for_two_setups_fails_both() -> None:
    items = _items()
    plan = build_check_plan(items, seed=5)
    letters = {k: chr(65 + pos) for pos, k in enumerate(plan.answer_order)}
    entries = [
        {"index": i + 1, "match": letters[i], "clear": True, "payoff": True,
         "one_answer": True, "fresh": True, "suitable": True}
        for i in range(len(items))
    ]
    entries[1]["match"] = letters[0]
    kept = apply_check(items, plan, {"items": entries})
    assert items[0].setup not in [item.setup for item in kept]
    assert items[1].setup not in [item.setup for item in kept]
    assert len(kept) == len(items) - 2


def test_a_malformed_check_drops_everything() -> None:
    items = _items()
    plan = build_check_plan(items, seed=5)
    assert apply_check(items, plan, {}) == []
    assert apply_check(items, plan, {"items": [{"index": "x", "match": "A"}]}) == []
    garbage = [{"index": i + 1, "match": "ZZ", "clear": True, "payoff": True,
                "one_answer": True, "fresh": True, "suitable": True} for i in range(len(items))]
    assert apply_check(items, plan, {"items": garbage}) == []


def test_prompt_gives_every_item_its_own_brief_and_alternates_kinds() -> None:
    prompt = build_prompt_for_tests(RiddlesJokesRequest(count=8, seed=11))
    briefs = [line for line in prompt.splitlines() if re.match(r"^\d+\. kind: ", line)]
    assert len(briefs) == 12
    kinds = [re.search(r"kind: (\w+)", line).group(1) for line in briefs]  # type: ignore[union-attr]
    assert all(a != b for a, b in zip(kinds, kinds[1:]))
    formats = [re.search(r"format: ([^;]+)", line).group(1) for line in briefs]  # type: ignore[union-attr]
    assert len(set(formats)) == len(formats)
    assert all("topic: " in line for line in briefs)


def test_prompt_follows_the_mix_and_a_chosen_theme() -> None:
    riddles = build_prompt_for_tests(RiddlesJokesRequest(mix="riddles", seed=2))
    assert "kind: joke" not in riddles and "kind: riddle" in riddles
    themed = build_prompt_for_tests(
        RiddlesJokesRequest(theme="Gardening retirement lifestyle", mixedTopics=False, mix="jokes", seed=2)
    )
    assert "Every item is about Gardening retirement lifestyle" in themed
    assert "topic: " not in themed
    assert "kind: riddle" not in themed


def _run(req: RiddlesJokesRequest):
    return asyncio.run(generate_riddles_jokes(req, user_id="u1"))


def test_generate_returns_only_checked_items(monkeypatch: pytest.MonkeyPatch) -> None:
    stale = VALID_ITEMS[3]["setup"]
    _patch(monkeypatch, _valid_writer, fake_checker(stale=frozenset({stale})))
    result = _run(RiddlesJokesRequest(count=6, seed=4))
    setups = [item.setup for item in result.items]
    assert stale not in setups
    assert len(setups) == len(VALID_ITEMS) - 1
    assert all(item.verified for item in result.items)
    # Every answer is still its own setup's.
    assert all(ANSWER_FOR[item.setup] == item.answer for item in result.items)


def test_generate_never_ships_unchecked_items_when_the_check_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def broken_checker(_prompt: str) -> str:
        raise RuntimeError("model down")

    _patch(monkeypatch, _valid_writer, broken_checker)
    with pytest.raises(RiddlesJokesGenerationError):
        _run(RiddlesJokesRequest(count=6, seed=4))


def test_generate_tops_up_across_attempts(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    async def writer(_prompt: str) -> str:
        calls["n"] += 1
        half = VALID["items"][:3] if calls["n"] == 1 else VALID["items"][3:]
        return json.dumps({"items": half})

    _patch(monkeypatch, writer, fake_checker())
    result = _run(RiddlesJokesRequest(count=6, seed=4))
    assert calls["n"] == 2
    assert len(result.items) == len(VALID_ITEMS)


def test_generate_remembers_what_it_printed(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(monkeypatch, _valid_writer, fake_checker())
    first = _run(RiddlesJokesRequest(count=6, seed=4))
    assert len(first.items) == len(VALID_ITEMS)
    # Same seller, same theme: the same reply is now all repeats.
    with pytest.raises(RiddlesJokesGenerationError):
        _run(RiddlesJokesRequest(count=6, seed=9))


def test_generate_fails_clearly_on_garbage(monkeypatch: pytest.MonkeyPatch) -> None:
    async def writer(_prompt: str) -> str:
        return json.dumps({"items": [{"kind": "joke", "setup": "hello", "answer": ""}]})

    _patch(monkeypatch, writer, fake_checker())
    with pytest.raises(RiddlesJokesGenerationError):
        _run(RiddlesJokesRequest(count=6, seed=4))
