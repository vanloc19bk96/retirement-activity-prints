from __future__ import annotations

import asyncio
import json
import math
import re
from collections import Counter

import pytest
from pydantic import ValidationError

from app.schemas.studio_career_numbers import CareerNumbersRequest, CareerNumbersResponse
from app.services.studio_career_numbers_service import (
    CareerNumbersGenerationError,
    anchor_theme,
    briefs,
    build_prompt_for_tests,
    generate_career_numbers,
    group_cap,
    memory_label,
    normalize_question,
    normalize_unit,
    nostalgic_target,
    parse_payload_for_tests,
    plan_slots,
    question_subjects,
    question_tokens,
    questions_repeat,
    shapes,
    themes,
)
from app.services.studio_variety import reset_memory

SERVICE = "app.services.studio_career_numbers_service"

# Thirty-two valid, mutually distinct questions: (question, unit, theme, tone).
# Mirrors CBN_FIXTURE_ITEMS in
# frontend/src/utils/studio/career-by-the-numbers/fixture.ts.
FIXTURE = [
    ("About how many workdays did you put in over your whole career?", "workdays", "finish-line", "playful"),
    ("On a typical workday, how many cups of tea or coffee kept you going?", "cups", "hot-drinks", "playful"),
    ("If you had to guess, how many biscuits or cookies vanished from the shared tin over the years?", "biscuits", "snacks", "playful"),
    ("How many team lunches did you enjoy with coworkers over the years?", "team lunches", "lunch", "nostalgic"),
    ("Roughly how many meetings did you sit through over your whole career?", "meetings", "meetings", "playful"),
    ("In your busiest week, how many emails or messages landed in your inbox?", "emails", "messages", "playful"),
    ("On a typical day, how many times did the phone ring just as you sat down?", "times", "phone", "playful"),
    ("About how many miles did you travel getting to and from work over your career?", "miles", "commute", "playful"),
    ("How many new towns or cities did you get to see thanks to your job over the years?", "towns", "work-travel", "nostalgic"),
    ("At a guess, how many times did you hit snooze before a workday over your career?", "times", "mornings", "playful"),
    ("How many Monday mornings did you face over your whole career?", "mornings", "weekdays", "playful"),
    ("In a typical week, how many hours did you work, give or take?", "hours", "shifts", "playful"),
    ("On a typical workday, how many breaks did you spend laughing with coworkers?", "breaks", "breaks", "nostalgic"),
    ("In a typical week, how many times did you glance at the clock on a slow afternoon?", "times", "clock", "playful"),
    ("Roughly how many projects that made you proud did you finish over your career?", "projects", "projects", "nostalgic"),
    ("How many deadlines did you beat with minutes to spare over the years?", "deadlines", "deadlines", "playful"),
    ("If you had to guess, how many pages did you print or photocopy over your career?", "pages", "paperwork", "playful"),
    ("About how many pens went missing from your desk or pocket over your career?", "pens", "supplies", "playful"),
    ("How many pairs of work shoes or boots did you wear out over your career?", "pairs", "gear", "playful"),
    ("Roughly how many coworkers did you work alongside over your whole career?", "coworkers", "coworkers", "playful"),
    ("How many people did you train or show the ropes over the years?", "people", "helping", "nostalgic"),
    ("In a typical week, how many conversations about the weather did you have?", "conversations", "chats", "playful"),
    ("About how many birthday cakes did you help eat at work over your career?", "birthday cakes", "celebrations", "playful"),
    ("How many passwords did you have to change over the years?", "passwords", "learning", "playful"),
    ("Roughly how many job titles did you hold over your working life?", "job titles", "career-path", "playful"),
    ("At a guess, how many printer jams did you clear over your career?", "printer jams", "tech", "playful"),
    ("How many desk or windowsill plants did you keep alive over your career?", "plants", "workspace", "playful"),
    ("About how many vacation days did you enjoy over your whole career?", "vacation days", "time-off", "nostalgic"),
    ("How many coworkers do you think will miss seeing you every day?", "coworkers", "finish-line", "nostalgic"),
    ("On a typical day, how many questions did you answer for someone else?", "questions", "helping", "nostalgic"),
    ("How many sunrises did you see on the way to work over the years?", "sunrises", "commute", "nostalgic"),
    ("How many farewell cards did you sign for coworkers over the years?", "cards", "celebrations", "nostalgic"),
]
QUESTIONS = [question for question, _, _, _ in FIXTURE]

BRIEF_RE = re.compile(r"^(\d+)\. \[", re.MULTILINE)


def _req(**overrides) -> CareerNumbersRequest:
    return CareerNumbersRequest(**{"workplace": "any", "questions": 10, "seed": 7, **overrides})


def _reply(prompt: str, pool=FIXTURE, *, start: int = 0) -> str:
    """Answer every brief in the prompt with the next fixture question."""
    numbers = [int(n) for n in BRIEF_RE.findall(prompt)]
    items = []
    for offset, number in enumerate(numbers):
        question, unit, _, _ = pool[(start + offset) % len(pool)]
        items.append({"brief": number, "concept": f"count {start + offset}", "question": question, "unit": unit})
    return json.dumps({"items": items})


def _patch(monkeypatch: pytest.MonkeyPatch, fake) -> None:
    monkeypatch.setattr(f"{SERVICE}._call_gemini", fake)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)


@pytest.fixture(autouse=True)
def _clean_memory():
    reset_memory()
    yield
    reset_memory()


# ---------------------------------------------------------------- gates


def test_fixture_is_valid_and_distinct() -> None:
    for question, unit, _, _ in FIXTURE:
        assert normalize_question(question, budget=110) == question
        assert normalize_unit(unit, question=question, budget=16) == unit
    for i, a in enumerate(QUESTIONS):
        for b in QUESTIONS[:i]:
            assert not questions_repeat(a, b), (a, b)


def test_sets_curly_apostrophes_and_a_capital_only() -> None:
    assert (
        normalize_question("3. about how many of your coworkers' birthdays did you celebrate over the years?", budget=110)
        == "About how many of your coworkers’ birthdays did you celebrate over the years?"
    )
    assert (
        normalize_question('"On a typical day, how many times did you check the rota?"', budget=110)
        == "On a typical day, how many times did you check the rota?"
    )


@pytest.mark.parametrize(
    "question",
    [
        # Not one clear estimate.
        "How much work did you do over your career?",
        "How busy were you over your whole career?",
        "How many emails did you send and how many did you read each day?",
        "About how many meetings did you attend over your career.",
        "How many meetings did you attend over your career!",
        "Did you ever count how many meetings you attended over your career?",
        # No time frame: a day, a year or a lifetime?
        "About how many meetings did you attend?",
        # Numbers are the retiree's to write, never the model's.
        "You attended 14,782 meetings over your career, didn't you?",
        "About how many cups of coffee did you drink in 1987?",
        # Not about you, or not kind.
        "How many coffees did I drink over my career?",
        "How many times did he lose his keys over the years?",
        "About how many sick days did you take over your career?",
        "How many times did your boss yell at you over the years?",
        "How many pay rises did you get over your career?",
        "How many times did you forget a password over your career?",
        "How many beers did you have after work over the years?",
        "How many mistakes did you make in a typical week?",
        # Only padding left: nothing to count.
        "In a typical week, how many hours did you spend, give or take?",
        # Shouting, quotations, too short.
        "HOW MANY MEETINGS DID YOU ATTEND OVER YOUR CAREER?",
        '"How many meetings" did you attend over your career?',
        "How many, your career?",
        # The prompt's own example, copied.
        "How many Monday mornings did you show up for over the years?",
    ],
)
def test_rejects_unprintable_questions(question: str) -> None:
    assert normalize_question(question, budget=110) is None


def test_distance_follows_the_seller() -> None:
    km = "About how many kilometres did you drive for work over your career?"
    assert normalize_question(km, budget=110, distance="miles") is None
    assert normalize_question(km, budget=110, distance="km") == km
    assert normalize_unit("kilometres", question=km, budget=16, distance="km") == "kilometres"
    assert normalize_unit("miles", question=QUESTIONS[7], budget=16, distance="km") is None


def test_unit_comes_from_the_question() -> None:
    question = "About how many cups of coffee did you drink over your career?"
    assert normalize_unit("cups", question=question, budget=16) == "cups"
    assert normalize_unit("Cups.", question=question, budget=16) == "cups"
    for unit in ["mugs", "cups of coffee", "things", "total", "dollars", "cups!", "2 cups"]:
        assert normalize_unit(unit, question=question, budget=16) is None, unit
    # "Times" the phone rang, not "calls": the unit names what the question counts.
    assert normalize_unit("calls", question=QUESTIONS[6], budget=16) is None
    assert normalize_unit("conversations", question=QUESTIONS[21], budget=12) is None


def test_budget_is_the_page_limit() -> None:
    question = QUESTIONS[2]
    assert normalize_question(question, budget=110) == question
    assert normalize_question(question, budget=80) is None


def test_folds_questions_to_what_they_count() -> None:
    assert questions_repeat(
        "About how many meetings did you attend over your career?",
        "Roughly how many meetings were you in over the years?",
    )
    assert questions_repeat(
        "On a typical workday, how many cups of coffee did you drink?",
        "About how many coffee breaks did you take over your career?",
    )
    assert not questions_repeat(QUESTIONS[0], QUESTIONS[27])
    assert question_tokens("In a typical week, how many hours did you spend at work?") == frozenset()


def test_spots_what_a_question_is_really_about() -> None:
    assert question_subjects(QUESTIONS[1]) == {"drinks"}
    assert question_subjects(QUESTIONS[30]) == {"commute"}
    assert question_subjects(QUESTIONS[25]) == {"tech"}
    assert question_subjects(QUESTIONS[20]) == frozenset()


def test_memory_labels_keep_what_is_counted() -> None:
    # The time frame goes first; what is left is cut on a word.
    assert memory_label(QUESTIONS[12]) == "How many breaks did you spend laughing with coworkers?"
    assert memory_label(QUESTIONS[23]) == QUESTIONS[23]
    for question in QUESTIONS:
        label = memory_label(question)
        assert len(label) <= 60
        assert label.lower()[:-1] in question.lower() or label.lower() in question.lower()
        assert questions_repeat(label, question), question


# ---------------------------------------------------------------- data


def test_every_theme_is_well_formed() -> None:
    groups = {theme.group for theme in themes()}
    for group in groups:
        assert group_cap(group, 20) >= 1
    assert anchor_theme() in {theme.key for theme in themes()}
    assert sum(len(t.facets["playful"]) + len(t.facets["nostalgic"]) for t in themes()) >= 150
    for theme in themes():
        assert theme.tones == ("playful", "nostalgic"), theme.key
        for tone in theme.tones:
            for facet in theme.facets[tone]:
                assert facet.strip() == facet and facet, (theme.key, facet)


def test_group_caps_scale_with_the_set() -> None:
    assert group_cap("drinks", 6) == 1
    assert group_cap("drinks", 20) == 1
    assert group_cap("routine", 10) == 2
    assert group_cap("routine", 20) == 3


# ---------------------------------------------------------------- plan


@pytest.mark.parametrize("size", [6, 8, 10, 12, 15, 20])
def test_plans_a_balanced_set_plus_spares(size: int) -> None:
    slots = plan_slots(_req(questions=size, seed=11))
    main = slots[:size]
    assert len(slots) == size + 8
    assert main[0].theme.key == anchor_theme()
    assert Counter(slot.tone for slot in main)["nostalgic"] == nostalgic_target(size)
    groups = Counter(slot.theme.group for slot in main)
    for group, count in groups.items():
        assert count <= group_cap(group, size), group
    assert Counter(slot.theme.key for slot in main).most_common(1)[0][1] == 1
    assert max(Counter(slot.shape for slot in main).values()) <= math.ceil(size / len(shapes()))
    for slot in slots:
        assert slot.facet_text()


def test_plan_follows_the_seed() -> None:
    first = [(s.theme.key, s.tone, s.facet_text(), s.shape) for s in plan_slots(_req(seed=3))]
    again = [(s.theme.key, s.tone, s.facet_text(), s.shape) for s in plan_slots(_req(seed=3))]
    other = [(s.theme.key, s.tone, s.facet_text(), s.shape) for s in plan_slots(_req(seed=4))]
    assert first == again
    assert first != other


def test_distance_reaches_the_briefs() -> None:
    commute = next(theme for theme in themes() if theme.key == "commute")
    facets = [i for i, text in enumerate(commute.facets["playful"]) if "{distance}" in text]
    assert facets
    slots = plan_slots(_req(themes=["commute"], count=len(commute.facets["playful"]), tone="playful"))
    texts_km = [slot.facet_text("km") for slot in slots]
    texts_mi = [slot.facet_text("miles") for slot in slots]
    assert any("kilometres" in text for text in texts_km)
    assert any("miles" in text for text in texts_mi)
    assert not any("{distance}" in text for text in texts_km + texts_mi)


def test_top_up_asks_only_for_the_named_themes_and_tone() -> None:
    slots = plan_slots(_req(themes=["helping", "tech", "nope"], count=5, tone="nostalgic"))
    assert len(slots) == 5
    assert {slot.theme.key for slot in slots} == {"helping", "tech"}
    assert all(slot.tone == "nostalgic" for slot in slots)
    assert plan_slots(_req(themes=["nope"])) == []


def test_request_bounds() -> None:
    with pytest.raises(ValidationError):
        CareerNumbersRequest(questions=40)
    with pytest.raises(ValidationError):
        CareerNumbersRequest(maxQuestionChars=200)
    with pytest.raises(ValidationError):
        CareerNumbersRequest(workplace="moon base")
    with pytest.raises(ValidationError):
        CareerNumbersRequest(distance="leagues")
    assert CareerNumbersRequest(maxQuestionChars=90, maxUnitChars=12).max_question_chars == 90


# ---------------------------------------------------------------- prompt


def test_prompt_carries_every_brief_the_workplace_and_the_distance() -> None:
    slots = plan_slots(_req(workplace="school"))
    asks = list(enumerate(slots))
    prompt = build_prompt_for_tests(asks, workplace="school", distance="km")
    lines, owners = briefs(asks, "km")
    assert [int(n) for n in BRIEF_RE.findall(prompt)] == list(range(1, len(slots) + 1))
    assert owners == {i + 1: i for i in range(len(slots))}
    assert "staff room" in prompt
    assert "kilometres -- never miles" in prompt
    assert "never an answer, never a number" in prompt
    assert all(line in prompt for line in lines)


def test_parses_items_or_fails_loudly() -> None:
    assert parse_payload_for_tests('{"items": [{"brief": 1}]}') == [{"brief": 1}]
    with pytest.raises(ValueError):
        parse_payload_for_tests('{"items": []}')


# ---------------------------------------------------------------- generate


def test_writes_every_brief_in_one_call(monkeypatch: pytest.MonkeyPatch) -> None:
    prompts: list[str] = []

    async def fake(prompt: str) -> str:
        prompts.append(prompt)
        return _reply(prompt)

    _patch(monkeypatch, fake)
    res = asyncio.run(generate_career_numbers(_req(), user_id="u1"))
    assert isinstance(res, CareerNumbersResponse)
    assert len(prompts) == 1
    assert [item.question for item in res.questions] == QUESTIONS[:18]
    assert [item.unit for item in res.questions] == [unit for _, unit, _, _ in FIXTURE[:18]]
    slots = plan_slots(_req())
    assert [(i.theme, i.tone, i.shape) for i in res.questions] == [
        (s.theme.key, s.tone, s.shape) for s in slots
    ]


def test_retries_only_the_briefs_that_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    prompts: list[str] = []

    async def fake(prompt: str) -> str:
        prompts.append(prompt)
        if len(prompts) == 1:
            # Half the set comes back with a made-up number or a unit that is not in the question.
            numbers = [int(n) for n in BRIEF_RE.findall(prompt)]
            items = []
            for n in numbers:
                question, unit, _, _ = FIXTURE[n - 1]
                if n % 2 == 0:
                    question, unit = "You drank 12,000 cups of coffee over your career?", "cups"
                items.append({"brief": n, "concept": f"count {n}", "question": question, "unit": unit})
            return json.dumps({"items": items})
        return _reply(prompt, start=1)

    _patch(monkeypatch, fake)
    res = asyncio.run(generate_career_numbers(_req(), user_id="u1"))
    assert len(prompts) == 2
    assert len(BRIEF_RE.findall(prompts[1])) == 9
    questions = [item.question for item in res.questions]
    assert not any(ch.isdigit() for q in questions for ch in q)
    for i, a in enumerate(questions):
        for b in questions[:i]:
            assert not questions_repeat(a, b)


def test_drops_a_question_whose_unit_does_not_fit_it(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake(prompt: str) -> str:
        numbers = [int(n) for n in BRIEF_RE.findall(prompt)]
        items = [
            {"brief": n, "concept": f"count {n}", "question": FIXTURE[n - 1][0], "unit": "mugs" if n == 2 else FIXTURE[n - 1][1]}
            for n in numbers
        ]
        return json.dumps({"items": items})

    _patch(monkeypatch, fake)
    res = asyncio.run(generate_career_numbers(_req(), user_id="u1"))
    assert QUESTIONS[1] not in [item.question for item in res.questions]


def test_never_repeats_what_the_seller_printed(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake(prompt: str) -> str:
        return _reply(prompt)

    _patch(monkeypatch, fake)
    res = asyncio.run(
        generate_career_numbers(_req(avoid=["How many biscuits vanished from the tin?", QUESTIONS[1]]), user_id="u1")
    )
    questions = [item.question for item in res.questions]
    assert QUESTIONS[1] not in questions
    assert QUESTIONS[2] not in questions

    # The worker remembers: the same seller's next set drops what it printed.
    again = asyncio.run(generate_career_numbers(_req(seed=8), user_id="u1"))
    assert not {item.question for item in again.questions} & set(questions)


def test_fails_plainly_when_nothing_survives(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake(prompt: str) -> str:
        numbers = [int(n) for n in BRIEF_RE.findall(prompt)]
        items = [{"brief": n, "concept": "x", "question": "How much money did you earn?", "unit": "dollars"} for n in numbers]
        return json.dumps({"items": items})

    _patch(monkeypatch, fake)
    with pytest.raises(CareerNumbersGenerationError):
        asyncio.run(generate_career_numbers(_req(), user_id="u1"))
