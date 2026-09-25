from __future__ import annotations

import asyncio
import json
import re
import typing

import pytest

from app.schemas.studio_occupation_trivia import (
    OccupationTriviaQuestion,
    OccupationTriviaRequest,
)
from app.services.studio_occupation_trivia_service import (
    Budgets,
    OccupationTriviaGenerationError,
    _config,
    apply_check,
    build_check_plan,
    build_prompt_for_tests,
    filter_items,
    generate_occupation_trivia,
    label_repeats,
    normalize_choice,
    normalize_explanation,
    normalize_item,
    parse_payload_for_tests,
    question_label,
    questions_repeat,
)
from app.services.studio_variety import reset_memory

SERVICE = "app.services.studio_occupation_trivia_service"
BUDGETS = Budgets(question=120, choice=36, explanation=80)

VALID_ITEMS = [
    {
        "topic": "blackboard chalk",
        "question": "What did teachers write on the blackboard with?",
        "answer": "Chalk",
        "distractors": ["Charcoal", "Crayon", "Graphite"],
        "explanation": "Sticks of chalk left bright white marks on the dark board.",
    },
    {
        "topic": "spirit duplicator ink",
        "question": "Worksheets printed on a spirit duplicator came out in what colour ink?",
        "answer": "Purple",
        "distractors": ["Green", "Brown", "Orange"],
        "explanation": "Spirit duplicators, or ditto machines, printed in a purple ink.",
    },
    {
        "topic": "counting frame",
        "question": "What counting frame with sliding beads was used to teach arithmetic?",
        "answer": "The abacus",
        "distractors": ["The slide rule", "The tally stick", "The protractor"],
        "explanation": "The abacus helped children see numbers as rows of beads.",
    },
    {
        "topic": "school slates",
        "question": "Before paper was cheap, what did pupils write their lessons on?",
        "answer": "A slate",
        "distractors": ["A clay tablet", "A wax board", "A birch bark sheet"],
        "explanation": "Children wrote on small framed slates with slate pencils.",
    },
    {
        "topic": "overhead projector",
        "question": "What machine shone a teacher's writing on clear sheets onto a screen?",
        "answer": "An overhead projector",
        "distractors": ["A slide projector", "A filmstrip viewer", "A microfiche reader"],
        "explanation": "Overhead projectors shone transparencies onto a screen.",
    },
    {
        "topic": "school hand bell",
        "question": "What did a teacher ring by hand to call pupils in from the yard?",
        "answer": "A hand bell",
        "distractors": ["A whistle", "A gong", "A triangle"],
        "explanation": "Before electric bells, teachers rang a brass hand bell.",
    },
    {
        "topic": "cursive penmanship",
        "question": "Penmanship lessons drilled which flowing style of joined-up writing?",
        "answer": "Cursive",
        "distractors": ["Italic print", "Block capitals", "Shorthand"],
        "explanation": "Pupils practised cursive, joining each letter to the next.",
    },
    {
        "topic": "school yearbook",
        "question": "What is the yearly book of class photos and school highlights called?",
        "answer": "A yearbook",
        "distractors": ["A scrapbook", "An almanac", "A day book"],
        "explanation": "A yearbook collects each class's photos from the school year.",
    },
    {
        "topic": "desk inkwell",
        "question": "What were wooden school desks fitted with to hold ink for dip pens?",
        "answer": "An inkwell",
        "distractors": ["A quill rack", "A blotter tray", "A pen drawer"],
        "explanation": "Inkwells set into the desk held ink for dip pens.",
    },
    {
        "topic": "one-room schoolhouse",
        "question": "In a one-room schoolhouse, how many teachers taught every grade?",
        "answer": "One",
        "distractors": ["Two", "Three", "Four"],
        "explanation": "A single teacher taught pupils of every age in one room.",
    },
    {
        "topic": "lesson plan",
        "question": "What is a teacher's written outline for a single class period called?",
        "answer": "A lesson plan",
        "distractors": ["A syllabus", "A timetable", "A curriculum"],
        "explanation": "A lesson plan sets out the aims and activities for one class.",
    },
    {
        "topic": "teacher's edition",
        "question": "What was the desk copy of a textbook with the answers printed in it called?",
        "answer": "The teacher's edition",
        "distractors": ["The answer atlas", "The master file", "The key ledger"],
        "explanation": "A teacher's edition held the answers and notes for each lesson.",
    },
]

VALID = {"items": [{"brief": i + 1, "area": "the classroom", **item} for i, item in enumerate(VALID_ITEMS)]}
ANSWER_FOR = {item["question"]: item["answer"] for item in VALID_ITEMS}

_QUESTION_RE = re.compile(r"^Q(\d+)\. (.+)$")
_CHOICE_RE = re.compile(r"^   ([A-D])\. (.+)$")
_NOTE_RE = re.compile(r"^Note (\d+)\. (.+)$")


def _read_plan(prompt: str):
    """The questions, their lettered choices, and the notes, as the checker was shown them."""
    questions: list[tuple[int, str, dict[str, str]]] = []
    notes: list[tuple[int, str]] = []
    for line in prompt.splitlines():
        if match := _QUESTION_RE.match(line):
            questions.append((int(match.group(1)), match.group(2), {}))
        elif (match := _CHOICE_RE.match(line)) and questions:
            questions[-1][2][match.group(2)] = match.group(1)
        elif match := _NOTE_RE.match(line):
            notes.append((int(match.group(1)), match.group(2)))
    return questions, notes


def fake_checker(
    *,
    wrong: frozenset = frozenset(),
    uncertain: frozenset = frozenset(),
    false_notes: frozenset = frozenset(),
    seen: list | None = None,
):
    """Answers the blind prompt from a truth table, like a checker that knows every fact."""

    async def check(prompt: str) -> str:
        questions, notes = _read_plan(prompt)
        if seen is not None:
            seen.append([question for _, question, _ in questions])
        items = []
        for index, question, letters in questions:
            answer = ANSWER_FOR[question]
            pick = next(l for text, l in letters.items() if text != answer) if question in wrong else letters[answer]
            items.append(
                {"index": index, "answer": pick, "certain": question not in uncertain, "on_topic": True,
                 "clear": True, "plausible": True, "fair": True, "suitable": True, "duplicate_of": 0}
            )
        verdicts = [{"index": index, "verdict": "false" if note in false_notes else "true"} for index, note in notes]
        return json.dumps({"items": items, "notes": verdicts})

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


def _items(occupation: str = "teacher") -> list[OccupationTriviaQuestion]:
    return filter_items(VALID["items"], budgets=BUDGETS, occupation=occupation, cap=20)


def _item(**change) -> OccupationTriviaQuestion | None:
    return normalize_item({**VALID_ITEMS[0], **change}, budgets=BUDGETS, occupation="teacher")


# ---------------------------------------------------------------- config


def test_every_occupation_in_the_schema_has_a_profile() -> None:
    field = OccupationTriviaRequest.model_fields["occupation"].annotation
    assert sorted(typing.get_args(field)) == sorted(_config()["occupations"])


@pytest.mark.parametrize("occupation", sorted(_config()["occupations"]))
def test_every_profile_is_complete(occupation: str) -> None:
    profile = _config()["occupations"][occupation]
    assert profile["label"] and profile["who"] and profile["care"]
    # Enough areas that a full reply never repeats one.
    assert len(profile["areas"]) >= _config()["limits"]["maxWrite"]
    assert len(set(profile["areas"])) == len(profile["areas"])
    assert profile["blockedTerms"]


# ---------------------------------------------------------------- parsing and gates


def test_parse_valid_json() -> None:
    assert len(parse_payload_for_tests(json.dumps(VALID))) == len(VALID_ITEMS)


def test_parse_invalid_json_raises() -> None:
    with pytest.raises(ValueError):
        parse_payload_for_tests('{"items": []}')


def test_every_valid_item_is_well_formed_but_not_yet_verified() -> None:
    items = _items()
    assert [item.question for item in items] == [item["question"] for item in VALID_ITEMS]
    assert all(item.verified is False for item in items)


def test_input_cannot_claim_to_be_verified() -> None:
    item = _item(verified=True)
    assert item is not None and item.verified is False


def test_the_example_in_the_prompt_passes_its_own_gates() -> None:
    example = dict(_config()["example"])
    assert normalize_item(example, budgets=BUDGETS, occupation="teacher") is not None


@pytest.mark.parametrize(
    "change",
    [
        {"question": "What did teachers write on the blackboard with"},  # no question mark
        {"question": "Chalk or pencil? What did teachers write on the blackboard with?"},
        {"question": "What did you write on the blackboard with?"},  # addresses the reader
        {"question": "Do teachers still remember what they wrote on blackboards with?"},
        {"question": "Which of these was not used to write on a blackboard?"},  # negative
        {"question": "What do teachers use today to write on the blackboard?"},  # time-sensitive
        {"question": "What did teachers reportedly write on the blackboard with?"},  # hedge
        {"question": "In 2019, what did teachers write on the blackboard with?"},  # too recent
        {"question": "What did lazy teachers write on the blackboard with?"},  # mocking
        {"distractors": ["Charcoal", "Crayon"]},  # three wrong answers, not two
        {"distractors": ["Charcoal", "Crayon", "Chalk"]},  # the answer twice
        {"distractors": ["Coloured chalk", "Crayon", "Graphite"]},  # one inside another
        {"distractors": ["Charcoal", "Crayon", "All of the above"]},
        {"distractors": ["Charcoal", "Crayon", "A long pointed wooden stick"]},  # length gives it away
        {"answer": "Blackboard"},  # the question already holds its answer
        {"explanation": "Classroom lessons ran from nine until three each day."},  # not about this question
        {"explanation": "Chalk was cheap. It was white."},  # two sentences
        {"distractors": ["Charcoal", "Crayon", "Crayola"]},  # a brand
        {"topic": ""},
        {"question": ""},
        {"answer": None},
    ],
)
def test_malformed_items_are_dropped_not_repaired(change) -> None:
    assert _item(**change) is None


def test_occupation_care_blocks_what_the_shared_list_allows() -> None:
    nurse = {
        "topic": "thermometer dose",
        "question": "What did nurses check before giving a dose to a patient?",
        "answer": "The chart",
        "distractors": ["The clock", "The window", "The ward list"],
        "explanation": "Nurses read the chart before giving a dose.",
    }
    police = {
        "topic": "police revolver",
        "question": "What kind of revolver did beat officers carry in the 1950s?",
        "answer": "A six-shot model",
        "distractors": ["A two-shot model", "A ten-shot model", "A four-shot model"],
        "explanation": "Beat officers carried a six-shot revolver.",
    }
    assert normalize_item(nurse, budgets=BUDGETS, occupation="nurse") is None
    assert normalize_item(police, budgets=BUDGETS, occupation="police") is None
    # The words are a problem for those jobs, not for the shared gate.
    assert normalize_item(nurse, budgets=BUDGETS, occupation="teacher") is not None


def test_ordinary_words_are_not_mistaken_for_labels_or_extra_sentences() -> None:
    assert normalize_choice("A-frame", budget=36, occupation="engineer") == "A-frame"
    assert normalize_choice("B. Chalk", budget=36, occupation="teacher") == "Chalk"
    note = normalize_explanation(
        "The U.S. Postal Service introduced ZIP codes in 1963.", budget=80, occupation="postal"
    )
    assert note == "The U.S. Postal Service introduced ZIP codes in 1963."


def test_budgets_are_hard_limits() -> None:
    assert _item(question="What " + "very " * 25 + "old tool wrote on a blackboard?") is None
    tight = Budgets(question=120, choice=6, explanation=80)
    assert normalize_item(VALID_ITEMS[0], budgets=tight, occupation="teacher") is None


# ---------------------------------------------------------------- one fact once


def test_a_reworded_question_about_the_same_fact_is_a_repeat() -> None:
    first = _item(question="What tool did teachers commonly use to write on chalkboards?")
    second = _item(
        question="Which item was traditionally used by teachers to write on a blackboard?",
        topic="writing on the board",
        distractors=["Soapstone", "Pastel", "Lead pencil"],
    )
    assert first is not None and second is not None
    assert questions_repeat(first, second)


def test_different_facts_are_not_repeats() -> None:
    items = _items()
    for i, first in enumerate(items):
        for second in items[i + 1 :]:
            assert not questions_repeat(first, second), (first.question, second.question)


def test_one_reply_never_holds_one_fact_twice() -> None:
    doubled = [*VALID["items"], {**VALID["items"][0], "question": "What did teachers use to write on a chalkboard?"}]
    items = filter_items(doubled, budgets=BUDGETS, occupation="teacher", cap=20)
    assert len(items) == len(VALID_ITEMS)


def test_labels_name_the_fact_and_its_occupation() -> None:
    item = _items()[0]
    label = question_label("teacher", item)
    assert label == "teacher: blackboard chalk = chalk"
    assert len(label) <= 60
    assert label_repeats(item, label, "teacher")
    # Another pack's label never rules a question out.
    assert not label_repeats(item, label, "trucker")
    # A different fact with the same answer is still caught by its answer.
    assert label_repeats(item, "teacher: whiteboard marker = chalk", "teacher")


def test_printed_questions_are_never_offered_again() -> None:
    printed = [question_label("teacher", item) for item in _items()[:3]]
    items = filter_items(VALID["items"], budgets=BUDGETS, occupation="teacher", cap=20, avoid=printed)
    assert [item.question for item in items] == [item["question"] for item in VALID_ITEMS[3:]]


# ---------------------------------------------------------------- the blind check


def test_the_check_prompt_never_says_which_choice_is_right() -> None:
    items = _items()
    plan = build_check_plan(items, seed=5, occupation="teacher")
    questions, notes = _read_plan(plan.prompt)
    assert len(questions) == len(items) and len(notes) == len(items)
    for (_, question, letters), item, order in zip(questions, items, plan.orders):
        assert question == item.question
        assert set(letters) == {item.answer, *item.distractors}
        assert letters[item.answer] == "ABCD"[order.index(0)]
    # Shuffled: the answer does not sit at one letter for every question.
    assert len({order.index(0) for order in plan.orders}) > 1
    # Nothing beside a choice marks it: every choice line is its letter and its text.
    for line in plan.prompt.splitlines():
        if line.startswith("   ") and line[3:4] in "ABCD" and line[4:6] == ". ":
            assert _CHOICE_RE.match(line)


def _check_reply(items, plan, override=None):
    override = override or {}
    entries = []
    for index, item in enumerate(items):
        entry = {"index": index + 1, "answer": "ABCD"[plan.orders[index].index(0)], "certain": True,
                 "on_topic": True, "clear": True, "plausible": True, "fair": True, "suitable": True,
                 "duplicate_of": 0}
        entry.update(override.get(index, {}))
        entries.append(entry)
    notes = [{"index": pos + 1, "verdict": "true"} for pos in range(len(items))]
    return {"items": entries, "notes": notes}


def test_apply_check_keeps_only_independently_answered_and_passed_questions() -> None:
    items = _items()[:6]
    plan = build_check_plan(items, seed=9, occupation="teacher")
    wrong_letter = "ABCD"[plan.orders[1].index(1)]
    reply = _check_reply(
        items,
        plan,
        {
            1: {"answer": wrong_letter},  # picked a distractor
            2: {"answer": "several"},  # two choices could be right
            3: {"certain": False},
            4: {"duplicate_of": 1},  # the same fact as question 1
        },
    )
    kept = apply_check(items, plan, reply)
    assert [item.question for item in kept] == [items[0].question, items[5].question]
    assert all(item.verified for item in kept)


def test_a_note_the_checker_doubts_drops_its_question() -> None:
    items = _items()[:3]
    plan = build_check_plan(items, seed=3, occupation="teacher")
    reply = _check_reply(items, plan)
    doubted = plan.note_order.index(1)
    reply["notes"][doubted]["verdict"] = "unsure"
    kept = apply_check(items, plan, reply)
    assert [item.question for item in kept] == [items[0].question, items[2].question]


def test_a_missing_or_malformed_reply_fails_closed() -> None:
    items = _items()[:3]
    plan = build_check_plan(items, seed=3, occupation="teacher")
    assert apply_check(items, plan, {}) == []
    assert apply_check(items, plan, {"items": [{"index": "x"}], "notes": []}) == []


# ---------------------------------------------------------------- the prompt


@pytest.mark.parametrize("occupation", sorted(_config()["occupations"]))
def test_every_occupation_gets_its_own_areas_and_care(occupation: str) -> None:
    req = OccupationTriviaRequest(occupation=occupation, count=12, seed=4)
    prompt = build_prompt_for_tests(req)
    profile = _config()["occupations"][occupation]
    assert profile["care"] in prompt
    briefs = re.findall(r"^\d+\. area: (.+); shape: ", prompt, re.MULTILINE)
    assert len(briefs) == 16
    assert len(set(briefs)) == len(briefs)
    assert set(briefs) <= set(profile["areas"])


def test_the_seed_moves_the_briefs() -> None:
    req = OccupationTriviaRequest(occupation="postal", count=12)
    assert build_prompt_for_tests(req, seed=1) != build_prompt_for_tests(req, seed=2)


# ---------------------------------------------------------------- the run


def test_generate_returns_only_verified_questions_and_remembers_them(monkeypatch) -> None:
    _patch(monkeypatch, _valid_writer, fake_checker(wrong=frozenset({VALID_ITEMS[2]["question"]})))
    req = OccupationTriviaRequest(occupation="teacher", count=14, seed=11)
    response = asyncio.run(generate_occupation_trivia(req, user_id="u1"))
    assert response.occupation == "teacher"
    questions = [item.question for item in response.questions]
    assert VALID_ITEMS[2]["question"] not in questions
    assert len(questions) == len(VALID_ITEMS) - 1
    assert all(item.verified for item in response.questions)

    # The next pack for this seller and occupation refuses every fact that printed:
    # only the one question that failed the first check is even sent to the checker.
    seen: list = []
    _patch(monkeypatch, _valid_writer, fake_checker(seen=seen))
    again = asyncio.run(generate_occupation_trivia(req, user_id="u1"))
    assert seen == [[VALID_ITEMS[2]["question"]]]
    assert [item.question for item in again.questions] == [VALID_ITEMS[2]["question"]]

    # Another seller, or another occupation, starts fresh.
    other = asyncio.run(generate_occupation_trivia(req, user_id="u9"))
    assert len(other.questions) == len(VALID_ITEMS)


def test_generate_fails_closed_when_the_check_cannot_run(monkeypatch) -> None:
    async def broken(_prompt: str) -> str:
        raise RuntimeError("model down")

    _patch(monkeypatch, _valid_writer, broken)
    with pytest.raises(OccupationTriviaGenerationError):
        asyncio.run(generate_occupation_trivia(OccupationTriviaRequest(count=10), user_id="u2"))


def test_generate_tops_up_a_short_first_round(monkeypatch) -> None:
    calls = {"n": 0}

    async def writer(_prompt: str) -> str:
        calls["n"] += 1
        half = VALID["items"][:5] if calls["n"] == 1 else VALID["items"][5:]
        return json.dumps({"items": half})

    _patch(monkeypatch, writer, fake_checker())
    response = asyncio.run(generate_occupation_trivia(OccupationTriviaRequest(count=12, seed=2), user_id="u3"))
    assert calls["n"] == 2
    assert len(response.questions) == len(VALID_ITEMS)
