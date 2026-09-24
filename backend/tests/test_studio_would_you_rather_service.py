from __future__ import annotations

import asyncio
import json

import pytest

from app.schemas.studio_would_you_rather import WouldYouRatherRequest
from app.services.studio_would_you_rather_service import (
    WouldYouRatherGenerationError,
    avoid_label,
    build_prompt_for_tests,
    filter_pairs,
    generate_would_you_rather,
    normalize_option,
    options_match,
    pair_problem,
    parse_payload_for_tests,
)
from app.services.studio_variety import reset_memory

SERVICE = "app.services.studio_would_you_rather_service"

VALID_PAIRS = [
    {
        "brief": 1,
        "topic": "short getaways and day trips",
        "setup": "a spring weekend away",
        "dilemma": "the coast vs the countryside",
        "optionA": "spend a spring weekend in a cottage by the sea",
        "optionB": "spend a spring weekend at a farmhouse in the hills",
    },
    {
        "brief": 2,
        "topic": "learning something brand new",
        "setup": "a new skill to learn",
        "dilemma": "music vs language",
        "optionA": "learn to play the piano from scratch",
        "optionB": "learn to hold a conversation in Italian",
    },
    {
        "brief": 3,
        "topic": "cooking, baking and hosting a meal",
        "setup": "the weekly family meal",
        "dilemma": "hosting vs being hosted",
        "optionA": "host a big family dinner every Sunday",
        "optionB": "be treated to a home-cooked meal once a week",
    },
    {
        "brief": 4,
        "topic": "the fun side of having all this free time",
        "setup": "the weekend",
        "dilemma": "more weekends vs longer weekends",
        "optionA": "have every weekday feel like a Saturday",
        "optionB": "have every Saturday last twice as long",
    },
]

VALID = {"items": VALID_PAIRS}


@pytest.fixture(autouse=True)
def _fresh_memory() -> None:
    reset_memory()


def _req(**overrides) -> WouldYouRatherRequest:
    base = {"theme": "Travel Dreams", "count": 7, "maxOptionChars": 60, "seed": 7}
    base.update(overrides)
    return WouldYouRatherRequest(**base)


def _filter(items, **overrides):
    options = {"budget": 60, "cap": 10}
    options.update(overrides)
    return filter_pairs(items, **options)


def _firsts(items) -> list[str]:
    return [item.option_a for item in items]


def test_parse_valid_json() -> None:
    assert len(parse_payload_for_tests(json.dumps(VALID))) == len(VALID_PAIRS)


def test_parse_invalid_json_raises() -> None:
    with pytest.raises(ValueError, match="valid JSON"):
        parse_payload_for_tests("not json")


def test_parse_missing_items_raises() -> None:
    with pytest.raises(ValueError, match="missing"):
        parse_payload_for_tests(json.dumps({"pairs": []}))


def test_valid_pairs_survive_in_order_and_sentence_case() -> None:
    items = _filter(VALID_PAIRS)
    assert _firsts(items) == [
        "Spend a spring weekend in a cottage by the sea",
        "Learn to play the piano from scratch",
        "Host a big family dinner every Sunday",
        "Have every weekday feel like a Saturday",
    ]
    assert items[1].option_b == "Learn to hold a conversation in Italian"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Would you rather spend a week sailing?", "Spend a week sailing"),
        ("A) spend a week sailing", "Spend a week sailing"),
        ("Option B: spend a week sailing.", "Spend a week sailing"),
        ("or spend a week sailing", "Spend a week sailing"),
        ("to spend a week sailing", "Spend a week sailing"),
        ("“Spend a week sailing”", "Spend a week sailing"),
    ],
)
def test_option_labels_and_leads_are_stripped(raw: str, expected: str) -> None:
    assert normalize_option(raw, budget=60) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "sail",  # one word is not a choice
        "the beach house",  # not a verb: does not follow "Would you rather"
        "spending a week sailing",  # -ing does not follow "Would you rather"
        "sail to the islands or the lakes",  # a third choice inside one side
        "sail the islands. Then fly home",  # two sentences
        "sail the islands? Really",
        "SAIL THE ISLANDS ALL SUMMER",
        "spend a week sailing between the islands with old friends and a picnic",
        "visit the doctor twice a week",  # health
        "go to the casino every Friday night",  # gambling
        "win a trip to Disney with the grandchildren",  # brand
        "forget where you parked the car",  # ageist joke
        "pay off every bill before breakfast",  # money worries
    ],
)
def test_bad_options_are_rejected(raw: str) -> None:
    assert normalize_option(raw, budget=60) is None


def test_option_over_the_budget_is_rejected() -> None:
    option = "spend a week in a cabin by a quiet lake"
    assert normalize_option(option, budget=60) is not None
    assert normalize_option(option, budget=30) is None


@pytest.mark.parametrize(
    ("a", "b"),
    [
        ("Travel the world by train", "Travel the world by train"),
        ("Travel the world by train", "Travel all the world by trains"),
        ("Retire to the coast", "Never retire to the coast"),
        ("Bake bread", "Spend every afternoon in a sunny workshop building a boat"),
    ],
)
def test_unfair_pairs_are_rejected(a: str, b: str) -> None:
    assert pair_problem(a, b) is not None


def test_a_fair_pair_passes() -> None:
    assert pair_problem("Spend a week at the beach", "Spend a week in the mountains") is None


def test_pair_without_a_dilemma_is_dropped() -> None:
    raw = {**VALID_PAIRS[0], "dilemma": "  "}
    assert _filter([raw]) == []


@pytest.mark.parametrize(
    ("setup", "dilemma"),
    [
        ("", "the coast vs the countryside"),
        ("a spring weekend away", "coast and countryside"),
        ("a spring weekend away", "the coast vs"),
        ("a spring weekend away", "the coast vs the coast"),
        ("a spring weekend away", "the coast vs hills vs lakes"),
    ],
)
def test_pair_without_a_shared_setup_and_two_ends_is_dropped(setup: str, dilemma: str) -> None:
    raw = {**VALID_PAIRS[0], "setup": setup, "dilemma": dilemma}
    assert _filter([raw]) == []


def test_versus_is_accepted_in_any_spelling() -> None:
    raw = {**VALID_PAIRS[0], "dilemma": "The coast VERSUS the countryside"}
    assert len(_filter([raw])) == 1
    raw = {**VALID_PAIRS[0], "dilemma": "the coast vs. the countryside"}
    assert len(_filter([raw])) == 1


@pytest.mark.parametrize(
    ("first", "second", "expected"),
    [
        ("Sail the quiet islands", "Sail between quiet islands in summer", True),
        ("Spend a week at the beach", "Spend a whole week on the beaches", True),
        ("Spend a week at the beach", "Spend a week in the mountains", False),
        ("Learn the piano", "Learn to paint", False),
    ],
)
def test_options_match(first: str, second: str, expected: bool) -> None:
    assert options_match(first, second) is expected


def test_swapped_pair_is_a_repeat() -> None:
    swapped = {
        **VALID_PAIRS[1],
        "optionA": VALID_PAIRS[1]["optionB"],
        "optionB": VALID_PAIRS[1]["optionA"],
    }
    assert _firsts(_filter([VALID_PAIRS[1], swapped])) == ["Learn to play the piano from scratch"]


def test_a_reused_side_is_a_repeat() -> None:
    reuse = {
        **VALID_PAIRS[0],
        "optionB": "spend a spring weekend touring old castles",
    }
    assert len(_filter([VALID_PAIRS[0], reuse])) == 1


def test_avoid_list_blocks_pairs_the_book_already_prints() -> None:
    printed = avoid_label(_filter([VALID_PAIRS[2]])[0])
    assert " / " in printed and len(printed) <= 60
    items = _filter(VALID_PAIRS, avoid=[printed])
    assert "Host a big family dinner every Sunday" not in _firsts(items)
    assert len(items) == 3


def test_cap_is_respected() -> None:
    assert len(_filter(VALID_PAIRS, cap=2)) == 2


def test_prompt_carries_one_brief_per_question_and_the_rules() -> None:
    prompt = build_prompt_for_tests(_req(count=5, mixedTopics=True))
    for n in range(1, 6):
        assert f"\n{n}. topic: " in prompt
    assert "\n6. " not in prompt
    assert "at most 60 characters" in prompt
    assert "Brand names" in prompt
    assert '"dilemma"' in prompt
    assert '"setup"' in prompt


def test_prompt_for_a_chosen_theme_stays_on_it() -> None:
    prompt = build_prompt_for_tests(_req(count=3, mixedTopics=False, theme="Gardening"))
    assert "Theme: Gardening" in prompt
    assert "topic: " not in prompt
    assert "\n3. shape: " in prompt


def test_briefs_change_with_the_seed() -> None:
    req = _req(count=6, mixedTopics=True)
    assert build_prompt_for_tests(req, seed=1) != build_prompt_for_tests(req, seed=2)
    assert build_prompt_for_tests(req, seed=1) == build_prompt_for_tests(req, seed=1)


def test_style_controls_the_tone_of_every_brief() -> None:
    playful = build_prompt_for_tests(_req(count=6, style="playful"))
    thoughtful = build_prompt_for_tests(_req(count=6, style="thoughtful"))
    assert "tone: Warm and thoughtful" not in playful
    assert "tone: Light and funny" not in thoughtful
    balanced = build_prompt_for_tests(_req(count=6, style="balanced"))
    assert "tone: Warm and thoughtful" in balanced and "tone: Light and funny" in balanced


def test_generate_retries_invalid_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    async def fake_gemini(_prompt: str) -> str:
        calls["n"] += 1
        return "not json" if calls["n"] == 1 else json.dumps(VALID)

    monkeypatch.setattr(f"{SERVICE}._call_gemini", fake_gemini)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)

    result = asyncio.run(generate_would_you_rather(_req(), user_id="user-1"))
    assert len(result.items) == 4
    assert calls["n"] == 2


def test_generate_keeps_pairs_across_attempts(monkeypatch: pytest.MonkeyPatch) -> None:
    replies = iter([{"items": VALID_PAIRS[:1]}, {"items": VALID_PAIRS[1:]}])
    prompts: list[str] = []

    async def fake_gemini(prompt: str) -> str:
        prompts.append(prompt)
        return json.dumps(next(replies))

    monkeypatch.setattr(f"{SERVICE}._call_gemini", fake_gemini)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)

    result = asyncio.run(generate_would_you_rather(_req(seed=3), user_id="user-2"))
    assert len(result.items) == 4
    # The retry is told what the first attempt already kept.
    assert "cottage sea" in prompts[1]


def test_generate_remembers_what_it_wrote(monkeypatch: pytest.MonkeyPatch) -> None:
    prompts: list[str] = []

    async def fake_gemini(prompt: str) -> str:
        prompts.append(prompt)
        return json.dumps(VALID)

    monkeypatch.setattr(f"{SERVICE}._call_gemini", fake_gemini)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)

    asyncio.run(generate_would_you_rather(_req(seed=5), user_id="user-5"))
    with pytest.raises(WouldYouRatherGenerationError):
        # Same reply again: every pair now repeats the first page.
        asyncio.run(generate_would_you_rather(_req(seed=6), user_id="user-5"))
    assert "piano" in prompts[-1]


def test_generate_gives_up_after_three_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    async def fake_gemini(_prompt: str) -> str:
        calls["n"] += 1
        return json.dumps({"items": [{"optionA": "sail", "optionB": "sail"}]})

    monkeypatch.setattr(f"{SERVICE}._call_gemini", fake_gemini)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)

    with pytest.raises(WouldYouRatherGenerationError):
        asyncio.run(generate_would_you_rather(_req(seed=1), user_id="user-4"))
    assert calls["n"] == 3


def test_response_serialises_with_camel_case_options() -> None:
    (item,) = _filter(VALID_PAIRS[:1])
    dumped = item.model_dump(by_alias=True)
    assert set(dumped) == {"optionA", "optionB", "topic"}


def test_request_bounds_are_validated() -> None:
    with pytest.raises(ValueError):
        _req(count=20)
    with pytest.raises(ValueError):
        _req(maxOptionChars=10)
    with pytest.raises(ValueError):
        _req(style="spicy")
