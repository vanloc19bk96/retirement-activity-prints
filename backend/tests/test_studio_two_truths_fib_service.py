from __future__ import annotations

import asyncio
import json
import re

import pytest

from app.schemas.studio_two_truths_fib import TwoTruthsFibItem, TwoTruthsFibRequest
from app.services.studio_two_truths_fib_service import (
    Budgets,
    TwoTruthsFibGenerationError,
    apply_check,
    avoid_label,
    build_check_plan,
    build_prompt_for_tests,
    filter_sets,
    generate_two_truths_fib,
    normalize_set,
    normalize_statement,
    parse_payload_for_tests,
    statements_repeat,
)
from app.services.studio_variety import reset_memory

SERVICE = "app.services.studio_two_truths_fib_service"
BUDGETS = Budgets(statement=96, title=28, fact=110)

VALID_SETS = [
    {
        "title": "Early Telephones",
        "truths": [
            "Alexander Graham Bell was granted a patent for the telephone in 1876.",
            "Early telephone exchanges connected calls by hand using switchboard operators.",
        ],
        "fib": "The first telephone directory was printed in London in 1920.",
        "fact": "The first telephone directory was printed in New Haven, Connecticut, in 1878.",
    },
    {
        "title": "Tea Time",
        "truths": [
            "Afternoon tea became fashionable in England in the 1840s.",
            "Green tea and black tea are made from the leaves of the same plant.",
        ],
        "fib": "Tea was first brought to Europe by Spanish traders in the 1800s.",
        "fact": "Dutch traders brought tea to Europe in the early 1600s.",
    },
    {
        "title": "Steam Railways",
        "truths": [
            "The Stockton and Darlington Railway opened in England in 1825.",
            "Steam locomotives had to stop regularly to take on water for their boilers.",
        ],
        "fib": "The famous Rocket steam locomotive was built in 1869.",
        "fact": "The Rocket locomotive won the Rainhill Trials in 1829.",
    },
    {
        "title": "The Zip Fastener",
        "truths": [
            "Gideon Sundback patented an improved zip fastener in 1917.",
            "Before zips became common, many clothes fastened with buttons or hooks and eyes.",
        ],
        "fib": "The first zip fasteners were made of plastic in the 1890s.",
        "fact": "Early zip fasteners from the 1890s were made of metal.",
    },
    {
        "title": "Remarkable Birds",
        "truths": [
            "Hummingbirds can hover in place by beating their wings very rapidly.",
            "Owls can turn their heads much further round than people can.",
        ],
        "fib": "Flamingos are born with bright pink feathers.",
        "fact": "Flamingo chicks hatch with grey feathers and turn pink from their diet.",
    },
]

VALID = {"items": [{"brief": i + 1, **s} for i, s in enumerate(VALID_SETS)]}

TRUE_CLAIMS = {
    statement
    for s in VALID_SETS
    for statement in (*s["truths"], s["fact"])
}
FALSE_CLAIMS = {s["fib"] for s in VALID_SETS}

_SET_RE = re.compile(r"^Set (\d+) -- ")
_STATEMENT_RE = re.compile(r"^\s+[A-C]\. (.+)$")
_FACT_RE = re.compile(r"^Fact (\d+)\. (.+)$")


def fake_checker(
    *,
    unsure: frozenset[str] = frozenset(),
    wrong: frozenset[str] = frozenset(),
    coherent: bool = True,
):
    """Answers the blind prompt from a truth table, like a checker that knows the facts."""

    def verdict(claim: str) -> str:
        if claim in unsure:
            return "unsure"
        assert claim in TRUE_CLAIMS or claim in FALSE_CLAIMS, claim
        truth = claim in TRUE_CLAIMS
        if claim in wrong:
            truth = not truth
        return "true" if truth else "false"

    async def check(prompt: str) -> str:
        sets: list[dict] = []
        facts: list[dict] = []
        for line in prompt.splitlines():
            if match := _SET_RE.match(line):
                sets.append(
                    {"index": int(match.group(1)), "verdicts": [], "coherent": coherent,
                     "plausible": True, "suitable": True}
                )
            elif (match := _STATEMENT_RE.match(line)) and sets:
                sets[-1]["verdicts"].append(verdict(match.group(1)))
            elif match := _FACT_RE.match(line):
                facts.append({"index": int(match.group(1)), "verdict": verdict(match.group(2))})
        return json.dumps({"sets": sets, "facts": facts})

    return check


@pytest.fixture(autouse=True)
def _clean_memory():
    reset_memory()
    yield
    reset_memory()


def _req(**overrides) -> TwoTruthsFibRequest:
    base = {"subject": "mixed", "level": "classic", "count": 5, "seed": 7}
    base.update(overrides)
    return TwoTruthsFibRequest(**base)


def _item(raw: dict) -> TwoTruthsFibItem:
    item = normalize_set(raw, budgets=BUDGETS)
    assert item is not None, raw
    return item


def _patch(monkeypatch: pytest.MonkeyPatch, writer, checker) -> None:
    monkeypatch.setattr(f"{SERVICE}._call_writer", writer)
    monkeypatch.setattr(f"{SERVICE}._call_checker", checker)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)


async def _valid_writer(_prompt: str) -> str:
    return json.dumps(VALID)


# ---------------------------------------------------------------- parsing & shape


def test_parse_valid_json() -> None:
    assert len(parse_payload_for_tests(json.dumps(VALID))) == len(VALID_SETS)


def test_parse_invalid_json_raises() -> None:
    with pytest.raises(ValueError, match="valid JSON"):
        parse_payload_for_tests("not json")


def test_every_valid_set_is_well_formed_but_not_yet_verified() -> None:
    items = filter_sets(VALID_SETS, budgets=BUDGETS, cap=10)
    assert [i.title for i in items] == [s["title"] for s in VALID_SETS]
    assert all(len(i.truths) == 2 for i in items)
    assert all(i.verified is False for i in items)


def test_input_cannot_claim_to_be_verified() -> None:
    assert _item({**VALID_SETS[0], "verified": True}).verified is False


@pytest.mark.parametrize(
    "change",
    [
        {"truths": VALID_SETS[0]["truths"][:1]},
        {"truths": [*VALID_SETS[0]["truths"], "Telephone wires were once made of iron."]},
        {"fib": ""},
        {"fact": ""},
        {"title": "A Very Long Title About Early Telephones"},
        {"title": "Lighthouse Lights"},
    ],
)
def test_a_set_of_the_wrong_shape_is_dropped(change: dict) -> None:
    assert normalize_set({**VALID_SETS[0], **change}, budgets=BUDGETS) is None


@pytest.mark.parametrize(
    "statement",
    [
        "The telephone was never used in homes before 1900.",  # absolute
        "Only doctors had telephones in 1880.",  # absolute
        "The first telephone call lasted about 3 minutes.",  # approximate
        "Most homes today have a telephone in the kitchen.",  # time-sensitive
        "The smartphone was introduced in 2015.",  # recent
        "It was patented in 1876 by a Scottish-born inventor.",  # leans on another
        "You could send a telegram from most post offices.",  # addresses the reader
        "Was the telephone patented in 1876?",  # question
        'Bell said "Mr Watson, come here" on the first call.',  # quotation
        "Telephones were used during the war to send orders.",  # sensitive
        "Early Kodak cameras were loaded with paper film.",  # brand
        "Bell reportedly disliked having a telephone in his study.",  # hedge
        "The telephone was patented in 1876. Bell was 29.",  # two sentences
        "Operators didn't work at night in small towns.",  # negation
    ],
)
def test_unverifiable_or_unsuitable_statements_are_refused(statement: str) -> None:
    assert normalize_statement(statement, budget=96) is None


def test_normalize_strips_labels_and_adds_the_stop() -> None:
    assert (
        normalize_statement("B. The Rocket locomotive won the Rainhill Trials in 1829", budget=96)
        == "The Rocket locomotive won the Rainhill Trials in 1829."
    )


def test_a_fib_that_restates_a_truth_is_dropped() -> None:
    raw = {
        **VALID_SETS[0],
        "fib": "Alexander Graham Bell was granted a patent for the telephone in 1896.",
    }
    assert normalize_set(raw, budgets=BUDGETS) is None


def test_a_fib_far_shorter_than_the_truths_is_dropped() -> None:
    raw = {**VALID_SETS[0], "fib": "Phones were once blue.", "fact": "Phones were once black and heavy."}
    assert normalize_set(raw, budgets=BUDGETS) is None


def test_a_correction_about_something_else_is_dropped() -> None:
    raw = {**VALID_SETS[0], "fact": "Afternoon tea became popular in the 1840s in England."}
    assert normalize_set(raw, budgets=BUDGETS) is None


# ---------------------------------------------------------------- repeats


@pytest.mark.parametrize(
    ("first", "second", "expected"),
    [
        ("Telephones existed before television.", "Telephones were invented earlier than television.", True),
        ("The telephone was patented in 1876.", "The telephone was patented in the year 1876.", True),
        ("The telephone was patented in 1876.", "The first telephone directory was printed in 1878.", False),
        ("Afternoon tea became fashionable in the 1840s.", "Dutch traders brought tea to Europe in the 1600s.", False),
    ],
)
def test_statements_repeat(first: str, second: str, expected: bool) -> None:
    assert statements_repeat(first, second) is expected


def test_a_set_repeating_any_statement_of_another_is_dropped() -> None:
    echo = {
        **VALID_SETS[1],
        "title": "Telephone Talk",
        "truths": [
            "Bell was granted the telephone patent in 1876 as Alexander Graham Bell.",
            VALID_SETS[1]["truths"][1],
        ],
    }
    items = filter_sets([VALID_SETS[0], echo], budgets=BUDGETS, cap=5)
    assert [i.title for i in items] == ["Early Telephones"]


def test_the_book_history_is_enforced_through_compact_labels() -> None:
    printed = [avoid_label(VALID_SETS[2]["truths"][0]), "Tea Time"]
    items = filter_sets(VALID_SETS, budgets=BUDGETS, cap=10, avoid=printed)
    assert "Steam Railways" not in [i.title for i in items]
    assert "Tea Time" not in [i.title for i in items]
    assert len(items) == len(VALID_SETS) - 2


# ---------------------------------------------------------------- the blind check


def test_the_check_prompt_never_names_the_fib() -> None:
    candidates = [_item(s) for s in VALID_SETS]
    plan = build_check_plan(candidates, seed=3)
    assert "fib" not in plan.prompt.lower()
    for item in candidates:
        assert item.fib in plan.prompt
        assert item.fact in plan.prompt
    # Shuffled per set: the fib does not always sit in the last position.
    fib_positions = {order.index(2) for order in plan.orders}
    assert len(fib_positions) > 1


def test_only_sets_the_checker_confirms_are_verified() -> None:
    candidates = [_item(s) for s in VALID_SETS]
    plan = build_check_plan(candidates, seed=11)
    raw = json.loads(asyncio.run(fake_checker()(plan.prompt)))
    kept = apply_check(candidates, plan, raw)
    assert [i.title for i in kept] == [s["title"] for s in VALID_SETS]
    assert all(i.verified for i in kept)


@pytest.mark.parametrize(
    "checker",
    [
        # One truth the checker cannot confirm.
        fake_checker(unsure=frozenset({VALID_SETS[1]["truths"][0]})),
        # A "truth" the checker reads as false: two falses in one set.
        fake_checker(wrong=frozenset({VALID_SETS[1]["truths"][1]})),
        # The fib reads as true: no false statement at all.
        fake_checker(wrong=frozenset({VALID_SETS[1]["fib"]})),
        # The correction itself is wrong.
        fake_checker(wrong=frozenset({VALID_SETS[1]["fact"]})),
    ],
)
def test_any_doubt_drops_the_set(checker) -> None:
    candidates = [_item(s) for s in VALID_SETS]
    plan = build_check_plan(candidates, seed=5)
    kept = apply_check(candidates, plan, json.loads(asyncio.run(checker(plan.prompt))))
    titles = [i.title for i in kept]
    assert "Tea Time" not in titles
    assert len(titles) == len(VALID_SETS) - 1


def test_an_incoherent_or_malformed_check_drops_everything() -> None:
    candidates = [_item(s) for s in VALID_SETS]
    plan = build_check_plan(candidates, seed=5)
    incoherent = json.loads(asyncio.run(fake_checker(coherent=False)(plan.prompt)))
    assert apply_check(candidates, plan, incoherent) == []
    assert apply_check(candidates, plan, {"sets": "nope", "facts": None}) == []
    short = json.loads(asyncio.run(fake_checker()(plan.prompt)))
    for entry in short["sets"]:
        entry["verdicts"] = entry["verdicts"][:2]
    assert apply_check(candidates, plan, short) == []


# ---------------------------------------------------------------- prompt


def test_prompt_gives_every_set_its_own_brief_across_subjects() -> None:
    prompt = build_prompt_for_tests(_req(count=6))
    briefs = re.findall(r"^\d+\. subject: ([^;]+);", prompt, flags=re.MULTILINE)
    assert len(briefs) == 10
    assert len(set(briefs)) == len(briefs)
    assert build_prompt_for_tests(_req(seed=1)) != build_prompt_for_tests(_req(seed=2))


def test_prompt_follows_a_chosen_or_typed_subject() -> None:
    assert "inventions and everyday technology" in build_prompt_for_tests(_req(subject="inventions"))
    typed = build_prompt_for_tests(_req(subject="custom", customSubject="lighthouses and the sea"))
    assert "lighthouses and the sea" in typed
    assert "subject:" not in typed.split("in this order:")[1].split("For each puzzle")[0]


# ---------------------------------------------------------------- generate


def test_generate_returns_only_checked_sets(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(monkeypatch, _valid_writer, fake_checker())
    result = asyncio.run(generate_two_truths_fib(_req(), user_id="user-1"))
    assert len(result.items) == 5
    assert all(item.verified for item in result.items)


def test_generate_never_ships_unchecked_sets_when_the_check_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def broken_checker(_prompt: str) -> str:
        raise RuntimeError("checker down")

    _patch(monkeypatch, _valid_writer, broken_checker)
    with pytest.raises(TwoTruthsFibGenerationError, match="fact-check"):
        asyncio.run(generate_two_truths_fib(_req(), user_id="user-2"))


def test_generate_tops_up_across_attempts(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    async def writer(_prompt: str) -> str:
        calls["n"] += 1
        chunk = VALID_SETS[:1] if calls["n"] == 1 else VALID_SETS
        return json.dumps({"items": chunk})

    _patch(monkeypatch, writer, fake_checker())
    result = asyncio.run(generate_two_truths_fib(_req(count=5), user_id="user-3"))
    assert calls["n"] == 2
    titles = [item.title for item in result.items]
    assert len(titles) == len(set(titles)) == 5


def test_generate_remembers_what_it_printed(monkeypatch: pytest.MonkeyPatch) -> None:
    prompts: list[str] = []

    async def writer(prompt: str) -> str:
        prompts.append(prompt)
        return json.dumps(VALID)

    _patch(monkeypatch, writer, fake_checker())
    asyncio.run(generate_two_truths_fib(_req(seed=5), user_id="user-5"))
    with pytest.raises(TwoTruthsFibGenerationError):
        # Same reply again: every set now repeats the first page.
        asyncio.run(generate_two_truths_fib(_req(seed=6), user_id="user-5"))
    assert "Early Telephones" in prompts[-1]


def test_generate_fails_clearly_on_garbage(monkeypatch: pytest.MonkeyPatch) -> None:
    async def writer(_prompt: str) -> str:
        return "not json"

    _patch(monkeypatch, writer, fake_checker())
    with pytest.raises(TwoTruthsFibGenerationError):
        asyncio.run(generate_two_truths_fib(_req(), user_id="user-6"))
