from __future__ import annotations

import asyncio
import json
import re
from collections import Counter

import pytest

from app.schemas.studio_bucket_list import BucketListRequest
from app.services.studio_bucket_list_service import (
    BucketListGenerationError,
    SectionPlan,
    batches,
    briefs,
    build_prompt_for_tests,
    generate_bucket_list,
    ideas_repeat,
    normalize_idea,
    normalize_item,
    parse_payload_for_tests,
    plan_sections,
    section_count,
    spares_for,
    themes,
)
from app.services.studio_variety import reset_memory

SERVICE = "app.services.studio_bucket_list_service"

ADJECTIVES = [
    "amber", "copper", "crimson", "golden", "silver", "velvet", "misty", "sunlit", "frosty", "breezy",
    "quiet", "rustic", "coastal", "painted", "wooden", "marble", "glass", "cobbled", "leafy", "starry",
]
NOUNS = [
    "lighthouse", "bridge", "orchard", "harbour", "meadow", "windmill", "cathedral", "canal", "vineyard", "pier",
    "lantern", "teapot", "quilt", "fountain", "greenhouse", "boathouse", "bandstand", "archway", "clocktower", "mill",
]
DISTINCT_IDEAS = [f"Photograph a {adj} {noun}" for noun in NOUNS for adj in ADJECTIVES]
_BRIEF_RE = re.compile(r"^(\d+)\. \[", re.MULTILINE)


@pytest.fixture(autouse=True)
def _fresh_memory() -> None:
    reset_memory()


def _req(**overrides) -> BucketListRequest:
    base = {"count": 50, "seed": 7}
    base.update(overrides)
    return BucketListRequest(**base)


def _numbers(prompt: str) -> list[int]:
    return [int(n) for n in _BRIEF_RE.findall(prompt)]


def _item(brief: int, idea: str) -> dict:
    return {"brief": brief, "concept": idea.lower(), "idea": idea}


def _fake(ideas_iter, calls: list[str], *, drop: int = 0):
    """A model that answers every brief in the prompt with the next distinct idea."""

    async def fake_gemini(prompt: str) -> str:
        calls.append(prompt)
        items = []
        for n in _numbers(prompt):
            idea = next(ideas_iter)
            items.append({"brief": n, "concept": idea.lower(), "idea": idea})
        return json.dumps({"items": items[drop:]})

    return fake_gemini


# ---------------------------------------------------------------- gates


def test_parse_valid_and_invalid_json() -> None:
    assert len(parse_payload_for_tests(json.dumps({"items": [{"idea": "x"}]}))) == 1
    with pytest.raises(ValueError, match="valid JSON"):
        parse_payload_for_tests("not json")
    with pytest.raises(ValueError, match="missing items"):
        parse_payload_for_tests(json.dumps({"items": []}))


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Take a scenic train journey", "Take a scenic train journey"),
        ("12. Take a scenic train journey.", "Take a scenic train journey"),
        ("☐ grow a pot of herbs on a windowsill", "Grow a pot of herbs on a windowsill"),
        ('"Learn to cook a dish from another country"', "Learn to cook a dish from another country"),
        ("- Watch a sunrise from the top of a hill!", "Watch a sunrise from the top of a hill"),
        ("Learn calligraphy", "Learn calligraphy"),
        ("Taste a real crème brûlée", "Taste a real crème brûlée"),
    ],
)
def test_ideas_are_normalised(raw: str, expected: str) -> None:
    assert normalize_idea(raw, budget=52) == expected


@pytest.mark.parametrize(
    "raw",
    [
        # Vague or motivational: nothing concrete left.
        "Experience more adventure",
        "Learn new things",
        "Travel somewhere you have never been",
        "Live your best life",
        # Two ideas in one.
        "Bake bread and sell it at a market",
        "Visit Rome or Paris",
        "Take a boat, see the fjords",
        "Plan a trip then book it",
        # Not an action.
        "Visiting a museum",
        "A trip to the seaside",
        "Finally learning the piano",
        # Unsafe, exclusive or time-pressured.
        "Go skydiving over the desert",
        "Take your grandchildren to the zoo",
        "Surprise your wife with a picnic",
        "See the ocean before it's too late",
        "Tour a vineyard for wine tasting",
        "Visit Disneyland",
        "Win big at a casino",
        # Form.
        "TAKE A SCENIC TRAIN JOURNEY",
        "Take a scenic train journey: book early",
        "Go",
        "Take a slow and scenic train journey through the mountain villages of the north",
    ],
)
def test_bad_ideas_are_rejected(raw: str) -> None:
    assert normalize_idea(raw, budget=52) is None


def test_idea_over_the_budget_is_rejected() -> None:
    idea = "Take a scenic train journey through the mountains"
    assert normalize_idea(idea, budget=len(idea)) == idea
    assert normalize_idea(idea, budget=len(idea) - 1) is None


def test_model_item_without_a_concept_is_dropped() -> None:
    assert normalize_item({"idea": "Bake a loaf of sourdough bread", "concept": ""}, budget=52) is None
    item = normalize_item({"idea": "Bake a loaf of sourdough bread", "concept": "Sourdough"}, budget=52)
    assert item is not None and item.concept == "sourdough"
    # Items the client already kept come back without one.
    assert normalize_item({"idea": "Bake a loaf of sourdough bread"}, budget=52) is not None


@pytest.mark.parametrize(
    "first, second, expected",
    [
        ("Visit a new country", "Take a trip to a country you have never visited", True),
        ("Learn painting", "Try painting", True),
        ("Try painting", "Take a painting class", True),
        ("See the northern lights", "Watch the aurora", True),
        ("Take a scenic train journey", "Go on a scenic railway trip", True),
        ("Learn to knit", "Take up knitting", True),
        ("Grow a pot of herbs on a windowsill", "Grow herbs on your windowsill", True),
        ("Take a painting class", "Paint a portrait of a friend", False),
        ("Take a scenic train journey", "Take a day trip by train on a whim", False),
        ("Walk a trail you have never tried", "Take a woodland walk in autumn", False),
        ("Bake a loaf of sourdough bread", "Make a jar of homemade jam", False),
        ("Join a book club", "Join a walking group", False),
    ],
)
def test_ideas_repeat(first: str, second: str, expected: bool) -> None:
    assert ideas_repeat(first, second) is expected
    assert ideas_repeat(second, first) is expected


# ---------------------------------------------------------------- plan


def test_theme_bank_is_broad_and_well_formed() -> None:
    bank = themes()
    assert len(bank) >= 20
    assert len({theme.key for theme in bank}) == len(bank)
    assert all(len(theme.facets) >= 10 for theme in bank)
    assert all(len(theme.title) <= 24 for theme in bank)
    assert set(Counter(theme.group for theme in bank)) == {"calm", "home", "world", "creative", "people"}


@pytest.mark.parametrize("count", [10, 25, 50, 75, 100, 120])
def test_plan_spreads_the_count_evenly(count: int) -> None:
    plans = plan_sections(_req(count=count))
    assert len(plans) == section_count(count)
    assert sum(plan.target for plan in plans) == count
    targets = [plan.target for plan in plans]
    assert max(targets) - min(targets) <= 1
    assert all(plan.ask == plan.target + spares_for(plan.target) for plan in plans)
    assert len({plan.theme.key for plan in plans}) == len(plans)


def test_plan_always_covers_every_group() -> None:
    for seed in range(40):
        groups = {plan.theme.group for plan in plan_sections(_req(count=50, seed=seed))}
        assert groups == {"calm", "home", "world", "creative", "people"}


def test_focus_weights_its_groups_up() -> None:
    def share(focus: str, group: str) -> float:
        picks = [
            plan.theme.group
            for seed in range(60)
            for plan in plan_sections(_req(count=100, seed=seed, focus=focus))
        ]
        return picks.count(group) / len(picks)

    assert share("adventure", "world") > share("balanced", "world") + 0.1
    assert share("people", "people") > share("balanced", "people") + 0.1


def test_plans_differ_by_seed_and_repeat_for_the_same_seed() -> None:
    keys = lambda seed: [plan.theme.key for plan in plan_sections(_req(count=100, seed=seed))]
    assert keys(3) == keys(3)
    assert len({tuple(keys(seed)) for seed in range(30)}) >= 28


def test_top_up_plans_only_the_named_headings() -> None:
    req = _req(sections=[{"key": "travel", "count": 3}, {"key": "nope", "count": 2}, {"key": "travel", "count": 5}])
    plans = plan_sections(req)
    assert [(plan.theme.key, plan.target) for plan in plans] == [("travel", 3)]


def test_batches_keep_headings_whole_and_small() -> None:
    plans = plan_sections(_req(count=100))
    groups = batches([(plan, plan.ask) for plan in plans])
    assert [plan for batch in groups for plan, _ in batch] == plans
    assert all(sum(want for _, want in batch) <= 36 for batch in groups)
    assert len(groups) >= 3


def test_briefs_number_every_idea_and_name_its_heading() -> None:
    plans = plan_sections(_req(count=20))[:2]
    batch = [(plans[0], 4), (plans[1], 3)]
    lines, owners = briefs(batch, seed=5)
    assert len(lines) == 7
    assert list(owners) == list(range(1, 8))
    assert [owners[n] for n in owners] == [plans[0].theme.key] * 4 + [plans[1].theme.key] * 3
    assert lines[0].startswith(f"1. [{plans[0].theme.title}]")
    assert "flavour:" in lines[0]
    assert briefs(batch, seed=6)[0] != lines


def test_prompt_carries_briefs_headings_and_rules() -> None:
    plans = plan_sections(_req(count=20))
    batch = [(plans[0], 5)]
    prompt = build_prompt_for_tests(batch, others=["Travel"])
    assert f'"{plans[0].theme.title}"' in prompt
    assert 'Other headings in the same list (leave their ground to them): "Travel"' in prompt
    assert "Write exactly 5 ideas" in prompt
    assert len(_numbers(prompt)) == 5
    for rule in ("grandchildren", "before it's too late", "brand names", "at most 52 characters"):
        assert rule in prompt


# ---------------------------------------------------------------- generate


def test_generate_fills_every_heading_with_spares(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(f"{SERVICE}._call_gemini", _fake(iter(DISTINCT_IDEAS), calls))
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)

    result = asyncio.run(generate_bucket_list(_req(count=100), user_id="user-1"))
    plans = plan_sections(_req(count=100))
    assert [s.key for s in result.sections] == [p.theme.key for p in plans]
    for section, plan in zip(result.sections, plans):
        assert section.title == plan.theme.title
        assert section.target == plan.target
        assert len(section.items) == plan.ask
    # Batches run side by side, one round only when nothing was short.
    assert len(calls) == len(batches([(p, p.ask) for p in plans]))


def test_generate_tops_up_short_headings(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    ideas = iter(DISTINCT_IDEAS)
    first_round = {"n": 0}

    async def fake_gemini(prompt: str) -> str:
        calls.append(prompt)
        numbers = _numbers(prompt)
        first_round["n"] += 1
        # The first reply answers only half its briefs.
        keep = numbers[: len(numbers) // 2] if first_round["n"] == 1 else numbers
        return json.dumps({"items": [_item(n, next(ideas)) for n in keep]})

    monkeypatch.setattr(f"{SERVICE}._call_gemini", fake_gemini)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)

    result = asyncio.run(generate_bucket_list(_req(count=20), user_id="user-2"))
    assert all(len(s.items) >= s.target for s in result.sections)
    assert len(calls) == 2
    # The retry is told what the first round already wrote.
    assert DISTINCT_IDEAS[0] in calls[1]


def test_generate_drops_repeats_of_the_book(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(f"{SERVICE}._call_gemini", _fake(iter(DISTINCT_IDEAS), calls))
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)

    avoid = [DISTINCT_IDEAS[0], "Photograph the golden lighthouse"]
    result = asyncio.run(generate_bucket_list(_req(count=20, avoid=avoid), user_id="user-3"))
    printed = [item.idea for section in result.sections for item in section.items]
    assert DISTINCT_IDEAS[0] not in printed
    assert "Photograph a golden lighthouse" not in printed
    assert DISTINCT_IDEAS[0] in calls[0]


def test_generate_remembers_what_it_wrote(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(f"{SERVICE}._call_gemini", _fake(iter(DISTINCT_IDEAS * 2), calls))
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)

    first = asyncio.run(generate_bucket_list(_req(count=10, seed=1), user_id="user-4"))
    written = {item.idea for s in first.sections for item in s.items}
    reset_calls = len(calls)
    # A fresh model that starts the bank over: everything it offers was printed.
    monkeypatch.setattr(f"{SERVICE}._call_gemini", _fake(iter(DISTINCT_IDEAS), calls))
    second = asyncio.run(generate_bucket_list(_req(count=10, seed=2), user_id="user-4"))
    assert not written & {item.idea for s in second.sections for item in s.items}
    assert DISTINCT_IDEAS[0] in calls[reset_calls]


def test_generate_survives_a_failed_batch(monkeypatch: pytest.MonkeyPatch) -> None:
    ideas = iter(DISTINCT_IDEAS)
    seen = {"n": 0}

    async def fake_gemini(prompt: str) -> str:
        seen["n"] += 1
        if seen["n"] == 1:
            raise RuntimeError("upstream timeout")
        return json.dumps({"items": [_item(n, next(ideas)) for n in _numbers(prompt)]})

    monkeypatch.setattr(f"{SERVICE}._call_gemini", fake_gemini)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)

    result = asyncio.run(generate_bucket_list(_req(count=100), user_id="user-5"))
    assert all(len(s.items) >= s.target for s in result.sections)


def test_generate_gives_up_when_nothing_is_usable(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    async def fake_gemini(prompt: str) -> str:
        calls["n"] += 1
        return json.dumps(
            {"items": [{"brief": n, "concept": "adventure", "idea": "Experience more adventure"} for n in _numbers(prompt)]}
        )

    monkeypatch.setattr(f"{SERVICE}._call_gemini", fake_gemini)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)

    with pytest.raises(BucketListGenerationError):
        asyncio.run(generate_bucket_list(_req(count=20), user_id="user-6"))
    assert calls["n"] >= 2


def test_ideas_answering_unknown_briefs_are_ignored(monkeypatch: pytest.MonkeyPatch) -> None:
    ideas = iter(DISTINCT_IDEAS)

    async def fake_gemini(prompt: str) -> str:
        items = [_item(n, next(ideas)) for n in _numbers(prompt)]
        items.append({"brief": 999, "concept": "stray", "idea": "Photograph a stray kite"})
        return json.dumps({"items": items})

    monkeypatch.setattr(f"{SERVICE}._call_gemini", fake_gemini)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)

    result = asyncio.run(generate_bucket_list(_req(count=10), user_id="user-7"))
    assert "Photograph a stray kite" not in {i.idea for s in result.sections for i in s.items}


def test_request_bounds_are_validated() -> None:
    with pytest.raises(ValueError):
        _req(count=500)
    with pytest.raises(ValueError):
        _req(maxIdeaChars=10)
    with pytest.raises(ValueError):
        _req(focus="extreme")
    with pytest.raises(ValueError):
        _req(sections=[{"key": "travel", "count": 99}])


def test_section_plan_is_frozen() -> None:
    plan = plan_sections(_req(count=10))[0]
    assert isinstance(plan, SectionPlan)
    with pytest.raises(Exception):
        plan.target = 3  # type: ignore[misc]
