from __future__ import annotations

import asyncio
import json
import re

import pytest

from app.schemas.studio_retiree_quiz import (
    RetireeQuizQuestion,
    RetireeQuizRequest,
    RetireeQuizResults,
)
from app.services.studio_retiree_quiz_service import (
    OUTCOMES,
    Budgets,
    RetireeQuizGenerationError,
    apply_check,
    build_check_plan,
    build_prompt_for_tests,
    filter_questions,
    generate_retiree_quiz,
    normalize_answer,
    normalize_description,
    normalize_item,
    normalize_question,
    parse_payload_for_tests,
    texts_match,
)
from app.services.studio_variety import reset_memory

SERVICE = "app.services.studio_retiree_quiz_service"
BUDGETS = Budgets(question=84, answer=36, description=150)

VALID_ITEMS = [
    {
        "brief": 1,
        "topic": "a free weekday with nothing on the calendar",
        "question": "It's a free Tuesday with nothing planned. What sounds best?",
        "explorer": "A bus ride to a brand-new town",
        "tinkerer": "Building a birdhouse from scratch",
        "social": "Round up friends for a long lunch",
        "napper": "A slow breakfast and a comfy chair",
    },
    {
        "brief": 2,
        "topic": "gifts, big and small",
        "question": "Which gift would make you grin from ear to ear?",
        "explorer": "A ticket to somewhere unknown",
        "tinkerer": "A shiny new set of tools",
        "social": "A party with all your people",
        "napper": "The softest blanket money can buy",
    },
    {
        "brief": 3,
        "topic": "the kitchen and cooking",
        "question": "A new recipe book lands in your lap. What happens next?",
        "explorer": "Cook a dish from far away",
        "tinkerer": "Tweak each recipe to perfection",
        "social": "Host a tasting night for neighbors",
        "napper": "Read it in bed with tea",
    },
    {
        "brief": 4,
        "topic": "clubs, groups and classes",
        "question": "Which flyer on the library noticeboard catches your eye?",
        "explorer": "Guided walks through hidden corners",
        "tinkerer": "A beginner's woodworking workshop",
        "social": "A weekly coffee morning",
        "napper": "Gentle stretching, then a long rest",
    },
]

VALID_RESULTS = {
    "explorer": "Curiosity is your compass. A new town, a new taste or a new trail is all it takes to brighten your day.",
    "tinkerer": "Your head is always full of plans. Building, fixing or learning, you love the glow of a job well done.",
    "social": "You bring people together wherever you go. A shared meal or a good chat is your idea of a perfect day.",
    "napper": "You have mastered the art of the unhurried day. A comfy chair and nowhere to be is well-earned bliss.",
}

VALID = {"items": VALID_ITEMS, "results": VALID_RESULTS}


@pytest.fixture(autouse=True)
def _fresh_memory() -> None:
    reset_memory()


def _req(**overrides) -> RetireeQuizRequest:
    base = {"theme": "Life after work", "count": 14, "seed": 7}
    base.update(overrides)
    return RetireeQuizRequest(**base)


def _filter(items, **overrides):
    options = {"budgets": BUDGETS, "cap": 16}
    options.update(overrides)
    return filter_questions(items, **options)


def _check_reply_for(prompt: str, *, flags: dict | None = None, break_first: bool = False) -> str:
    """A checker that sorts each shown answer back to the style that wrote it."""
    by_text = {}
    for item in VALID_ITEMS:
        for style in OUTCOMES:
            by_text[normalize_answer(item[style], budget=36)] = style
    questions = []
    for index, block in enumerate(re.findall(r"Question \d+\..*?(?=\n\nQuestion|\n\nWRITE-UPS)", prompt, re.S)):
        entry: dict = {"index": index + 1, "clear": True, "balanced": True, "suitable": True}
        for letter, text in re.findall(r"^\s+([A-D])\. (.+)$", block, re.M):
            entry[letter] = by_text.get(text.strip(), "")
        if break_first and index == 0:
            entry["A"], entry["B"] = entry["B"], entry["A"]
        entry.update(flags or {})
        questions.append(entry)
    results = []
    for pos, text in re.findall(r"^Write-up (\d+)\. (.+)$", prompt, re.M):
        style = next(s for s, v in VALID_RESULTS.items() if v == text.strip())
        results.append({"index": int(pos), "style": style, "suitable": True})
    return json.dumps({"questions": questions, "results": results})


# ---------------------------------------------------------------- parsing


def test_parse_valid_json() -> None:
    items, results = parse_payload_for_tests(json.dumps(VALID))
    assert len(items) == len(VALID_ITEMS)
    assert results["napper"].startswith("You have mastered")


def test_parse_invalid_json_raises() -> None:
    with pytest.raises(ValueError, match="valid JSON"):
        parse_payload_for_tests("not json")


def test_parse_missing_items_raises() -> None:
    with pytest.raises(ValueError, match="missing"):
        parse_payload_for_tests(json.dumps({"questions_list": []}))


# ---------------------------------------------------------------- gates


def test_valid_items_survive_in_order() -> None:
    kept = _filter(VALID_ITEMS)
    assert [item.question for item in kept] == [item["question"] for item in VALID_ITEMS]
    assert kept[0].napper == "A slow breakfast and a comfy chair"
    assert not any(item.verified for item in kept)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("1. Which gift would make you grin?", "Which gift would make you grin?"),
        ("Q3: Which gift would make you grin?", "Which gift would make you grin?"),
        ("“Which gift would make you grin?”", "Which gift would make you grin?"),
    ],
)
def test_question_numbering_and_quotes_are_stripped(raw: str, expected: str) -> None:
    assert normalize_question(raw, budget=84) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "Which gift would make you grin",  # not a question
        "Which gift? Or which trip?",  # two questions
        "It rains. You wake late. The kettle sings. What now?",  # too many sentences
        "WHICH GIFT WOULD MAKE YOU GRIN?",
        "Which gift would your grandchildren pick for you?",  # assumes grandchildren
        "What would your husband say you love most?",  # assumes a spouse
        "Which do you explore first on a free day?",  # names a style
        "Which glass of wine goes with a free afternoon?",  # alcohol
        "Rain is drumming on the window. How do you spend the afternoon?",  # the example
    ],
)
def test_bad_questions_are_dropped(raw: str) -> None:
    assert normalize_question(raw, budget=84) is None


@pytest.mark.parametrize(
    "raw",
    [
        "A) hop a bus to a new town.",
        "Explorer: hop a bus to a new town",
        "- hop a bus to a new town!",
    ],
)
def test_answer_labels_are_stripped(raw: str) -> None:
    assert normalize_answer(raw, budget=36) == "Hop a bus to a new town"


@pytest.mark.parametrize(
    "raw",
    [
        "Be lazy all afternoon",  # put-down
        "Take a nap. Then another",  # two sentences
        "Nap?",
        "Go",  # too short
        "Explore a brand-new hiking trail",  # names a style
        "Spend a week on a luxury yacht",  # assumes wealth
        "Book a seat at the casino",  # gambling
        "Run a marathon along the coast",  # strenuous feat
        "A very long answer that goes on well past the budget",
        "A" * 60,
    ],
)
def test_bad_answers_are_dropped(raw: str) -> None:
    assert normalize_answer(raw, budget=36) is None


def test_item_needs_all_four_styles() -> None:
    item = dict(VALID_ITEMS[0])
    del item["napper"]
    assert normalize_item(item, budgets=BUDGETS) is None


def test_item_with_alike_answers_is_dropped() -> None:
    item = dict(VALID_ITEMS[0], napper="Round up good friends for a long lunch")
    assert normalize_item(item, budgets=BUDGETS) is None


def test_item_with_unbalanced_answers_is_dropped() -> None:
    item = dict(VALID_ITEMS[0], napper="Doze off")
    assert normalize_item(item, budgets=BUDGETS) is None


def test_descriptions_are_gated() -> None:
    assert normalize_description(VALID_RESULTS["social"], budget=150) == VALID_RESULTS["social"]
    assert normalize_description("You are a true explorer at heart, always looking for somewhere new.", budget=150) is None
    assert normalize_description("Science says you are the calmest person in the room. Relax and enjoy it.", budget=150) is None
    assert normalize_description("Short.", budget=150) is None
    assert normalize_description("You love a lazy day on the sofa with nowhere to go and nothing at all to do.", budget=150) is None


# ---------------------------------------------------------------- repeats


def test_texts_match_catches_paraphrase() -> None:
    assert texts_match("Which gift would make you grin?", "Which gift would make you grin the most?")
    assert not texts_match("Which gift would make you grin?", "Which flyer catches your eye?")


def test_repeated_question_is_dropped() -> None:
    dup = dict(VALID_ITEMS[1], question="Which gift would make you grin the most?", topic="presents")
    kept = _filter([VALID_ITEMS[1], dup])
    assert len(kept) == 1


def test_repeated_topic_is_dropped() -> None:
    other = dict(VALID_ITEMS[2], topic=VALID_ITEMS[0]["topic"])
    assert len(_filter([VALID_ITEMS[0], other])) == 1


def test_same_style_answer_repeated_across_questions_is_dropped() -> None:
    other = dict(VALID_ITEMS[2], napper="A slow breakfast and a comfy seat")
    assert len(_filter([VALID_ITEMS[0], other])) == 1


def test_overused_word_for_one_style_is_dropped() -> None:
    blanket = [
        dict(VALID_ITEMS[0], napper="A blanket and the radio on"),
        dict(VALID_ITEMS[1], napper="A blanket by the window"),
        dict(VALID_ITEMS[2], napper="A blanket over your knees"),
    ]
    kept = _filter(blanket)
    assert len(kept) == 2


def test_avoid_list_blocks_printed_questions() -> None:
    kept = _filter(VALID_ITEMS, avoid=["gift grin ear"])
    assert VALID_ITEMS[1]["question"] not in [item.question for item in kept]


# ---------------------------------------------------------------- the check


def _candidates() -> list[RetireeQuizQuestion]:
    return _filter(VALID_ITEMS)


def test_check_prompt_never_labels_answers() -> None:
    plan = build_check_plan(_candidates(), RetireeQuizResults(**VALID_RESULTS), seed=5)
    for style in OUTCOMES:
        assert f"({style})" not in plan.prompt
        assert f'"{style}": "' not in plan.prompt
    assert all(sorted(order) == sorted(OUTCOMES) for order in plan.orders)


def test_check_keeps_matching_questions_and_results() -> None:
    candidates = _candidates()
    results = RetireeQuizResults(**VALID_RESULTS)
    plan = build_check_plan(candidates, results, seed=5)
    kept, confirmed = apply_check(candidates, results, plan, json.loads(_check_reply_for(plan.prompt)))
    assert len(kept) == len(candidates)
    assert all(item.verified for item in kept)
    assert confirmed.model_dump() == VALID_RESULTS


def test_check_drops_a_question_it_sorts_differently() -> None:
    candidates = _candidates()
    results = RetireeQuizResults(**VALID_RESULTS)
    plan = build_check_plan(candidates, results, seed=5)
    reply = json.loads(_check_reply_for(plan.prompt, break_first=True))
    kept, _ = apply_check(candidates, results, plan, reply)
    assert [item.question for item in kept] == [item.question for item in candidates[1:]]


@pytest.mark.parametrize("flag", ["clear", "balanced", "suitable"])
def test_check_drops_questions_failing_a_flag(flag: str) -> None:
    candidates = _candidates()
    results = RetireeQuizResults(**VALID_RESULTS)
    plan = build_check_plan(candidates, results, seed=5)
    reply = json.loads(_check_reply_for(plan.prompt, flags={flag: False}))
    kept, _ = apply_check(candidates, results, plan, reply)
    assert kept == []


def test_check_empties_a_misread_result() -> None:
    candidates = _candidates()
    results = RetireeQuizResults(**VALID_RESULTS)
    plan = build_check_plan(candidates, results, seed=5)
    reply = json.loads(_check_reply_for(plan.prompt))
    for entry in reply["results"]:
        if entry["style"] == "napper":
            entry["style"] = "social"
    _, confirmed = apply_check(candidates, results, plan, reply)
    assert confirmed.napper == ""
    assert confirmed.explorer == VALID_RESULTS["explorer"]


# ---------------------------------------------------------------- prompt


def test_prompt_gives_every_question_its_own_brief() -> None:
    prompt = build_prompt_for_tests(_req(count=12))
    assert "Write exactly 12 questions" in prompt
    briefs = re.findall(r"^\d+\. topic: (.+?); shape:", prompt, re.M)
    assert len(briefs) == 12
    assert len(set(briefs)) == 12


def test_prompt_briefs_move_with_the_seed() -> None:
    assert build_prompt_for_tests(_req(), seed=1) != build_prompt_for_tests(_req(), seed=2)


def test_themed_prompt_keeps_one_theme() -> None:
    prompt = build_prompt_for_tests(_req(mixedTopics=False, theme="Garden Days"))
    assert "Every question is about Garden Days" in prompt
    assert "topic: " not in prompt.split("Write exactly")[1].split("Each question:")[0]


# ---------------------------------------------------------------- the run


def _patch(monkeypatch: pytest.MonkeyPatch, writer, checker=None) -> None:
    async def default_checker(prompt: str) -> str:
        return _check_reply_for(prompt)

    monkeypatch.setattr(f"{SERVICE}._call_writer", writer)
    monkeypatch.setattr(f"{SERVICE}._call_checker", checker or default_checker)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)


def test_generate_returns_verified_questions_and_results(monkeypatch: pytest.MonkeyPatch) -> None:
    async def writer(_prompt: str) -> str:
        return json.dumps(VALID)

    _patch(monkeypatch, writer)
    result = asyncio.run(generate_retiree_quiz(_req(), user_id="user-1"))
    assert len(result.questions) == len(VALID_ITEMS)
    assert all(item.verified for item in result.questions)
    assert result.results.model_dump() == VALID_RESULTS


def test_generate_retries_invalid_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    async def writer(_prompt: str) -> str:
        calls["n"] += 1
        return "not json" if calls["n"] == 1 else json.dumps(VALID)

    _patch(monkeypatch, writer)
    result = asyncio.run(generate_retiree_quiz(_req(), user_id="user-2"))
    assert len(result.questions) == len(VALID_ITEMS)


def test_generate_returns_nothing_unchecked(monkeypatch: pytest.MonkeyPatch) -> None:
    async def writer(_prompt: str) -> str:
        return json.dumps(VALID)

    async def checker(_prompt: str) -> str:
        raise RuntimeError("checker down")

    _patch(monkeypatch, writer, checker)
    with pytest.raises(RetireeQuizGenerationError, match="check"):
        asyncio.run(generate_retiree_quiz(_req(), user_id="user-3"))


def test_generate_remembers_what_it_wrote(monkeypatch: pytest.MonkeyPatch) -> None:
    prompts: list[str] = []

    async def writer(prompt: str) -> str:
        prompts.append(prompt)
        return json.dumps(VALID)

    _patch(monkeypatch, writer)
    asyncio.run(generate_retiree_quiz(_req(seed=5), user_id="user-5"))
    with pytest.raises(RetireeQuizGenerationError):
        # Same reply again: every question now repeats the first quiz.
        asyncio.run(generate_retiree_quiz(_req(seed=6), user_id="user-5"))
    assert "flyer" in prompts[-1]
