from __future__ import annotations

import asyncio
import json
import re
from collections import Counter

import pytest
from pydantic import ValidationError

from app.schemas.studio_who_knows_best import WhoKnowsBestRequest, WhoKnowsBestResponse
from app.services.studio_variety import reset_memory
from app.services.studio_who_knows_best_service import (
    ANCHOR_TOPIC,
    EXAMPLE_QUESTIONS,
    WhoKnowsBestGenerationError,
    answer_floor,
    briefs,
    build_prompt_for_tests,
    eligible,
    generate_who_knows_best,
    group_max,
    normalize_answer,
    normalize_question,
    parse_payload_for_tests,
    plan_slots,
    questions_repeat,
    topics,
)

SERVICE = "app.services.studio_who_knows_best_service"

# Twenty valid, mutually distinct questions. Mirrors WKB_FIXTURE_ITEMS in
# frontend/src/utils/studio/who-knows-retiree-best/fixture.ts.
FIXTURE = [
    ("What will they do on their very first free Monday?", "phrase"),
    ("What was the very first job they were ever paid to do?", "phrase"),
    ("Tea, coffee or hot chocolate: which would they pick first?", "word"),
    ("What time did they usually arrive on a workday?", "word"),
    ("What do they always say when a plan goes sideways?", "sentence"),
    ("Where in the world would they go if they could leave tomorrow?", "phrase"),
    ("What do they usually order when eating out?", "phrase"),
    ("Which hobby could they talk about for hours?", "phrase"),
    ("If they opened a small shop, what would it sell?", "phrase"),
    ("What role do they always end up playing at a party?", "phrase"),
    ("What did they want to be when they grew up?", "phrase"),
    ("What time do they wake up on a day off?", "word"),
    ("Comedy, thriller or musical: which film would they choose?", "word"),
    ("What is the one thing everyone asks them to fix?", "phrase"),
    ("Which small treat is guaranteed to brighten their day?", "phrase"),
    ("What piece of advice did they give every new starter?", "sentence"),
    ("Which new skill are they most keen to learn now?", "phrase"),
    ("What snack would they pack for a long train journey?", "phrase"),
    ("Beach, mountains or city: where would they rather spend a week?", "word"),
    ("Early bird or night owl: which one are they?", "word"),
]
QUESTIONS = [question for question, _ in FIXTURE]

BRIEF_RE = re.compile(r"^(\d+)\. \[", re.MULTILINE)


def _req(**overrides) -> WhoKnowsBestRequest:
    return WhoKnowsBestRequest(**{"audience": "mixed", "seed": 7, **overrides})


def _reply(prompt: str, pool=FIXTURE, *, start: int = 0) -> str:
    """Answer every brief in the prompt with the next fixture question."""
    numbers = [int(n) for n in BRIEF_RE.findall(prompt)]
    items = []
    for offset, number in enumerate(numbers):
        question, answer = pool[(start + offset) % len(pool)]
        items.append(
            {"brief": number, "concept": f"detail {start + offset}", "question": question, "answer": answer}
        )
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
    for question in QUESTIONS:
        assert normalize_question(question, budget=80) == question
    for i, a in enumerate(QUESTIONS):
        for b in QUESTIONS[:i]:
            assert not questions_repeat(a, b), (a, b)


def test_strips_numbering_and_edge_quotes_only() -> None:
    assert (
        normalize_question('3. "What time did they usually arrive on a workday?"', budget=80)
        == "What time did they usually arrive on a workday?"
    )


@pytest.mark.parametrize(
    "question",
    [
        "What do they enjoy?",
        "Name their first job",
        "What was their first job? Did they like it?",
        "Think back. What was their first job?",
        "What is your favourite memory of them?",
        "What would she order for lunch?",
        "What is the best snack for a road trip?",
        "How old were they when they started here?",
        "Which year were they born?",
        "What would they do with their pension?",
        "Which doctor do they see most often?",
        "How much do they weigh now?",
        "Where did they go on their first date?",
        "What are their grandchildren called?",
        "What was the name of their first pet?",
        "What street did they grow up on?",
        "What is their most embarrassing moment at work?",
        "What secret have they never told anyone?",
        "What wine do they order at dinner?",
        "How do they usually vote?",
        "Which church do they go to?",
        "What do they order at Starbucks?",
        "Which movie quote do they repeat most?",
        "What is their most annoying habit?",
        "How forgetful are they before coffee?",
        'Do they say "right then" or "off we go"?',
        "WHAT WAS THEIR FIRST JOB?",
        "Their job?",
    ],
)
def test_rejects_unprintable_questions(question: str) -> None:
    assert normalize_question(question, budget=80) is None


def test_respects_the_page_budget() -> None:
    question = "Where in the world would they go if they could leave tomorrow?"
    assert normalize_question(question, budget=80) == question
    assert normalize_question(question, budget=50) is None


def test_rejects_the_prompts_own_examples_word_for_word() -> None:
    for example in EXAMPLE_QUESTIONS:
        assert normalize_question(example, budget=80) is None


def test_a_saying_or_story_always_gets_two_lines() -> None:
    assert answer_floor("What do they always say when a plan goes sideways?") == "sentence"
    assert normalize_answer("word", "What piece of advice did they give every new starter?") == "sentence"
    assert normalize_answer("word", "What time did they usually arrive on a workday?") == "word"
    assert normalize_answer("essay", "What time did they usually arrive on a workday?") is None


@pytest.mark.parametrize(
    "a,b",
    [
        ("What was their first job?", "Where did they work first?"),
        ("What food do they like most?", "What is their favourite food?"),
        ("Where would they most like to travel?", "What place will they finally have time to visit?"),
        ("What would their perfect day off look like?", "What would they do with a completely free day?"),
        ("What was the very first job they were ever paid to do?", "Where did they first work for pay?"),
    ],
)
def test_repeats_are_caught_by_meaning(a: str, b: str) -> None:
    assert questions_repeat(a, b)


def test_different_details_stay_apart() -> None:
    assert not questions_repeat("What was their first job?", "What time did they usually arrive at work?")
    assert not questions_repeat("What was their first job?", "What did they want to be when they grew up?")


# ---------------------------------------------------------------- plan


@pytest.mark.parametrize("audience", ["mixed", "work", "family"])
@pytest.mark.parametrize("seed", [1, 2, 3, 99])
def test_full_plan_is_twelve_balanced_topics_plus_spares(audience: str, seed: int) -> None:
    slots = plan_slots(_req(audience=audience, seed=seed))
    assert len(slots) == 20
    primary = slots[:12]
    assert primary[0].topic.key == ANCHOR_TOPIC
    assert len({slot.topic.key for slot in primary}) == 12
    for group, count in Counter(slot.topic.group for slot in primary).items():
        assert count <= group_max(group), group
    assert max(Counter(slot.shape for slot in primary).values()) <= 3
    for slot in slots:
        assert slot.topic.weight(audience) > 0
        assert slot.shape in slot.topic.shapes
    # A topic asked twice asks about two different facets.
    seen = Counter((slot.topic.key, slot.facet_text) for slot in slots)
    assert max(seen.values()) == 1


def test_family_sets_never_ask_about_the_office() -> None:
    for seed in range(10):
        assert "office" not in {slot.topic.group for slot in plan_slots(_req(audience="family", seed=seed))}
    assert all(topic.group != "office" for topic in eligible("family"))


def test_seed_changes_the_set() -> None:
    plans = {
        tuple((slot.topic.key, slot.facet, slot.shape) for slot in plan_slots(_req(seed=seed)))
        for seed in range(20)
    }
    assert len(plans) == 20


def test_top_up_plans_only_named_topics() -> None:
    slots = plan_slots(_req(topics=["travel", "hobbies", "desk", "nonsense"], count=6, audience="family"))
    assert len(slots) == 6
    # "desk" is an office topic: family players cannot answer it.
    assert {slot.topic.key for slot in slots} == {"travel", "hobbies"}


def test_every_topic_is_rich_enough() -> None:
    for topic in topics():
        assert len(topic.facets) >= 10, topic.key
        assert topic.shapes, topic.key


# ---------------------------------------------------------------- prompt


def test_prompt_carries_briefs_budget_and_rules() -> None:
    slots = plan_slots(_req())
    asks = list(enumerate(slots))
    prompt = build_prompt_for_tests(asks, audience="work")
    lines, owners = briefs(asks)
    assert len(lines) == 20 and owners[1] == 0 and owners[20] == 19
    for line in lines:
        assert line in prompt
    assert "at most 80 characters" in prompt
    assert '"they", "their" or "them"' in prompt
    assert "Players are coworkers" in prompt
    assert "security question" in prompt
    assert "never copy these" in prompt


def test_parse_valid_json_and_reject_malformed() -> None:
    assert parse_payload_for_tests('{"items": [{"brief": 1}]}') == [{"brief": 1}]
    for raw in ("", "{}", '{"items": []}', "not json"):
        with pytest.raises(ValueError):
            parse_payload_for_tests(raw)


# ---------------------------------------------------------------- generate


def test_generates_the_set_with_spares(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake(prompt: str) -> str:
        return _reply(prompt)

    _patch(monkeypatch, fake)
    res = asyncio.run(generate_who_knows_best(_req(), user_id="u1"))
    assert isinstance(res, WhoKnowsBestResponse)
    assert [item.question for item in res.questions] == QUESTIONS
    slots = plan_slots(_req())
    for item, slot in zip(res.questions, slots):
        assert item.topic == slot.topic.key and item.shape == slot.shape
    assert res.questions[4].answer == "sentence"


def test_drops_questions_the_book_already_prints(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake(prompt: str) -> str:
        return _reply(prompt)

    _patch(monkeypatch, fake)
    res = asyncio.run(generate_who_knows_best(_req(avoid=["Where did they first work for pay?"]), user_id="u1"))
    assert QUESTIONS[1] not in [item.question for item in res.questions]


def test_rewrites_only_the_briefs_that_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[int] = []
    bad = [("How old are they?", "word")] * 20

    async def fake(prompt: str) -> str:
        calls.append(len(BRIEF_RE.findall(prompt)))
        if len(calls) == 1:
            # Half the set comes back unprintable.
            return _reply(prompt, pool=FIXTURE[:10] + bad[:10])
        return _reply(prompt, start=10)

    _patch(monkeypatch, fake)
    res = asyncio.run(generate_who_knows_best(_req(), user_id="u1"))
    assert calls == [20, 10]
    assert len(res.questions) == 20


def test_raises_when_nothing_usable_comes_back(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake(prompt: str) -> str:
        return json.dumps({"items": [{"brief": 1, "concept": "x", "question": "What do they enjoy?", "answer": "word"}]})

    _patch(monkeypatch, fake)
    with pytest.raises(WhoKnowsBestGenerationError):
        asyncio.run(generate_who_knows_best(_req(), user_id="u1"))


def test_survives_a_failed_call(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[int] = []

    async def flaky(prompt: str) -> str:
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("model timed out")
        return _reply(prompt)

    _patch(monkeypatch, flaky)
    res = asyncio.run(generate_who_knows_best(_req(), user_id="u1"))
    assert len(res.questions) == 20


def test_remembers_what_it_wrote_for_this_seller(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake(prompt: str) -> str:
        return _reply(prompt)

    _patch(monkeypatch, fake)
    asyncio.run(generate_who_knows_best(_req(), user_id="u1"))

    # The same seller, same audience: nothing written last time may come back.
    with pytest.raises(WhoKnowsBestGenerationError):
        asyncio.run(generate_who_knows_best(_req(seed=8), user_id="u1"))
    # Another seller, or another audience, starts fresh.
    assert asyncio.run(generate_who_knows_best(_req(seed=8), user_id="u2")).questions
    assert asyncio.run(generate_who_knows_best(_req(seed=8, audience="work"), user_id="u1")).questions


def test_request_takes_no_personal_details() -> None:
    fields = set(WhoKnowsBestRequest.model_fields)
    assert fields == {"avoid", "audience", "topics", "count", "max_question_chars", "seed", "locale"}
    with pytest.raises(ValidationError):
        WhoKnowsBestRequest(audience="strangers")
