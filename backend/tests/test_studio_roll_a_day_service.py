from __future__ import annotations

import asyncio
import json
import re

import pytest

from app.schemas.studio_roll_a_day import RollADayRequest, RollADayResponse
from app.services.studio_roll_a_day_service import (
    ActivityKey,
    RollADayGenerationError,
    activities_clash,
    activities_repeat,
    briefs,
    build_prompt_for_tests,
    generate_roll_a_day,
    normalize_activity,
    parse_payload_for_tests,
    plan_kinds,
    side_ready,
)
from app.services.studio_variety import reset_memory

SERVICE = "app.services.studio_roll_a_day_service"

# No two share a word of substance, on either side: every pairing is a day of
# two different things. Mirrors RD_FIXTURE in
# frontend/src/utils/studio/roll-a-day/fixture.ts.
MORNING = [
    ("coffee stroll", "Take a slow walk and grab a coffee"),
    ("window sketch", "Sketch the view from a window"),
    ("catch-up call", "Call a friend for a long catch-up"),
    ("song stretch", "Stretch gently to a favourite song"),
    ("bench reading", "Read a chapter on a park bench"),
    ("houseplant repotting", "Repot a leggy houseplant"),
    ("market flowers", "Pick fresh flowers at a market"),
    ("italian words", "Learn five words in Italian"),
    ("crossword and tea", "Solve a crossword with a warm tea"),
    ("duck watching", "Watch the ducks at a nearby pond"),
]
AFTERNOON = [
    ("scone baking", "Bake a small batch of scones"),
    ("library browse", "Browse the shelves at the library"),
    ("board game", "Play a board game with a neighbour"),
    ("postcard writing", "Write a postcard to an old pal"),
    ("pebble painting", "Paint a pebble for the doorstep"),
    ("volcano film", "Watch a film about volcanoes"),
    ("cake visit", "Invite a neighbour round for cake"),
    ("jigsaw", "Try a jigsaw puzzle by the window"),
    ("street map", "Doodle a map of your street"),
    ("armchair nap", "Nap in a sunny armchair"),
]


def _items(pairs):
    return [
        {"brief": index + 1, "concept": concept, "activity": activity}
        for index, (concept, activity) in enumerate(pairs)
    ]


VALID = {"morning": _items(MORNING), "afternoon": _items(AFTERNOON)}


@pytest.fixture(autouse=True)
def _fresh_memory() -> None:
    reset_memory()


def _req(**overrides) -> RollADayRequest:
    base = {"seed": 7}
    base.update(overrides)
    return RollADayRequest(**base)


def _patch(monkeypatch: pytest.MonkeyPatch, fake) -> None:
    monkeypatch.setattr(f"{SERVICE}._call_gemini", fake)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)


def _replying(*payloads):
    """A fake model that answers each call with the next payload, recording prompts."""
    prompts: list[str] = []
    replies = list(payloads)

    async def fake(prompt: str) -> str:
        prompts.append(prompt)
        return json.dumps(replies.pop(0) if len(replies) > 1 else replies[0])

    return fake, prompts


def _run(req: RollADayRequest, user: str = "user-1") -> RollADayResponse:
    return asyncio.run(generate_roll_a_day(req, user_id=user))


# ---------------------------------------------------------------- parsing


def test_parse_valid_json() -> None:
    morning, afternoon = parse_payload_for_tests(json.dumps(VALID))
    assert len(morning) == len(MORNING)
    assert len(afternoon) == len(AFTERNOON)


def test_parse_rejects_empty_and_malformed() -> None:
    with pytest.raises(ValueError):
        parse_payload_for_tests(json.dumps({"morning": [], "afternoon": []}))
    with pytest.raises(ValueError):
        parse_payload_for_tests(json.dumps({"morning": "Take a walk"}))
    with pytest.raises(ValueError):
        parse_payload_for_tests("not json")


# ---------------------------------------------------------------- gates


def test_fixture_is_valid_and_clash_free() -> None:
    keys = []
    for side, pairs in (("morning", MORNING), ("afternoon", AFTERNOON)):
        for concept, activity in pairs:
            assert normalize_activity(activity, side=side, budget=34) == activity
            keys.append(ActivityKey.of(activity, concept))
    for i, key in enumerate(keys):
        for other in keys[:i]:
            assert not activities_clash(key, other), (key.idea.text, other.idea.text)


@pytest.mark.parametrize(
    "text",
    [
        "Meet a friend for lunch",
        "Take a road trip to the coast",
        "Spend all day at the museum",
        "Finish the painting you started",
        "Watch the sunset from a bench",
        "Go for a long run by the river",
        "Drive to a country park",
        "Play a round of golf",
        "Try a new hobby",
        "Do something fun",
        "Enjoy retirement",
        "Visit a museum or a gallery",
        "Bake bread and share it",
        "Garden",
        "Take a walk with your grandchildren",
        "Sip wine on the patio",
        "Walk a very long way around the whole town",
    ],
)
def test_refuses_activities_that_break_a_combination(text: str) -> None:
    assert normalize_activity(text, side="morning", budget=36) is None
    assert normalize_activity(text, side="afternoon", budget=36) is None


def test_each_half_keeps_to_its_own_time_of_day() -> None:
    assert normalize_activity("Watch the sunrise from a bench", side="morning", budget=36)
    assert normalize_activity("Watch the sunrise from a bench", side="afternoon", budget=36) is None
    assert normalize_activity("Cook a slow breakfast of eggs", side="afternoon", budget=36) is None
    assert normalize_activity("Nap in a sunny armchair", side="afternoon", budget=36)
    assert normalize_activity("Nap in a sunny armchair", side="morning", budget=36) is None
    assert normalize_activity("Read a novel this afternoon", side="morning", budget=36) is None


def test_respects_the_character_budget() -> None:
    long_one = "Browse the shelves at a secondhand bookshop"
    assert normalize_activity(long_one, side="morning", budget=36) is None
    assert normalize_activity("Sketch the view from a window", side="morning", budget=24) is None


def test_clash_is_any_shared_word_of_substance() -> None:
    walk = ActivityKey.of("Take a slow walk and grab a coffee")
    assert activities_clash(walk, ActivityKey.of("Stroll along the river path"))  # synonyms fold
    assert activities_clash(walk, ActivityKey.of("Sip a coffee on a bench"))
    bake = ActivityKey.of("Bake a small batch of scones")
    assert activities_clash(bake, ActivityKey.of("Bake a loaf of banana bread"))
    # Who and where are not what: two different things with a friend are fine.
    call = ActivityKey.of("Call a friend for a long catch-up")
    assert not activities_clash(call, ActivityKey.of("Play cards with a friend at home"))


def test_repeat_across_pages_is_the_same_activity_in_other_words() -> None:
    scones = ActivityKey.of("Bake a small batch of scones")
    assert activities_repeat(scones, ActivityKey.of("Bake a small tray of scones"))
    assert activities_repeat(scones, ActivityKey.of("Make some fresh scones"))
    # Another page may still bake, or walk: only the same activity repeats.
    assert not activities_repeat(scones, ActivityKey.of("Bake a loaf of banana bread"))
    walk = ActivityKey.of("Take a walk to the pond")
    assert not activities_repeat(walk, ActivityKey.of("Walk to the post box"))


# ---------------------------------------------------------------- kinds and briefs


def test_each_side_takes_six_different_kinds_including_the_core() -> None:
    for seed in range(40):
        for side in ("morning", "afternoon"):
            kinds = plan_kinds("balanced", seed, side)
            assert len(kinds) == 6 and len(set(kinds)) == 6
            assert {"rest", "move", "make", "people"} <= set(kinds)


def test_the_mix_takes_the_extra_kinds() -> None:
    for seed in range(20):
        assert {"home", "play"} <= set(plan_kinds("home", seed, "morning"))
        assert {"outing", "learn"} <= set(plan_kinds("outings", seed, "afternoon"))


def test_kinds_vary_by_seed_and_side() -> None:
    tables = {
        (tuple(plan_kinds("balanced", s, "morning")), tuple(plan_kinds("balanced", s, "afternoon")))
        for s in range(30)
    }
    assert len(tables) > 10
    assert plan_kinds("balanced", 3, "morning") == plan_kinds("balanced", 3, "morning")


def test_briefs_cycle_the_kinds_and_put_missing_ones_first() -> None:
    req = _req()
    lines = briefs(req, "morning", 10, seed=7)
    kinds = [kind for _, kind in lines]
    assert len(lines) == 10
    assert set(kinds[:6]) == set(plan_kinds("balanced", 7, "morning"))
    assert all(line.startswith(f"M{i + 1}. ") for i, (line, _) in enumerate(lines))
    retry = briefs(req, "afternoon", 4, seed=104, missing=["people", "rest"])
    assert {kind for _, kind in retry[:2]} == {"people", "rest"}
    assert retry[0][0].startswith("A1. ")


def test_prompt_explains_the_combination_rules() -> None:
    prompt = build_prompt_for_tests(_req(maxActivityChars=34))
    assert "36 possible days" in prompt
    assert "at most 34 characters" in prompt
    assert "M10." in prompt and "A10." in prompt
    assert re.search(r"No mealtimes", prompt)
    top_up = build_prompt_for_tests(_req(morningCount=0, afternoonCount=4))
    assert 'return "morning": []' in top_up
    assert "A4." in top_up and "M1." not in top_up


# ---------------------------------------------------------------- generate


def test_returns_both_sides_with_kinds(monkeypatch: pytest.MonkeyPatch) -> None:
    fake, prompts = _replying(VALID)
    _patch(monkeypatch, fake)
    result = _run(_req())
    assert [i.activity for i in result.morning] == [a for _, a in MORNING]
    assert [i.activity for i in result.afternoon] == [a for _, a in AFTERNOON]
    assert side_ready(result.morning) and side_ready(result.afternoon)
    assert all(item.kind and item.concept for item in [*result.morning, *result.afternoon])
    assert len(prompts) == 1


def test_drops_clashes_across_sides_core_first(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = json.loads(json.dumps(VALID))
    # A spare morning walk loses to the afternoon's core items; an afternoon
    # coffee loses to the morning's first brief.
    payload["morning"].append({"brief": 11, "concept": "river stroll", "activity": "Stroll along the river path"})
    payload["afternoon"][1] = {"brief": 2, "concept": "cafe visit", "activity": "Sip a coffee at a new cafe"}
    fake, _ = _replying(payload)
    _patch(monkeypatch, fake)
    result = _run(_req(morningCount=11))
    activities = [i.activity for i in [*result.morning, *result.afternoon]]
    assert "Stroll along the river path" not in activities
    assert "Sip a coffee at a new cafe" not in activities


def test_drops_items_outside_the_briefs_or_over_the_ask(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = json.loads(json.dumps(VALID))
    payload["morning"][0]["brief"] = 99
    fake, _ = _replying(payload)
    _patch(monkeypatch, fake)
    result = _run(_req(morningCount=6, afternoonCount=6))
    assert "Take a slow walk and grab a coffee" not in [i.activity for i in result.morning]
    assert len(result.morning) <= 6 and len(result.afternoon) <= 6


def test_drops_what_the_seller_already_printed(monkeypatch: pytest.MonkeyPatch) -> None:
    fake, prompts = _replying(VALID)
    _patch(monkeypatch, fake)
    result = _run(_req(avoid=["Bake a small tray of scones"]))
    assert "Bake a small batch of scones" not in [i.activity for i in result.afternoon]
    assert "Bake a small tray of scones" in prompts[0]


def test_remembers_so_the_next_table_differs(monkeypatch: pytest.MonkeyPatch) -> None:
    fake, _ = _replying(VALID)
    _patch(monkeypatch, fake)
    _run(_req())
    # The model writes the very same table again: nothing survives, so the
    # seller gets an error rather than a repeat.
    with pytest.raises(RollADayGenerationError):
        _run(_req(seed=8))
    # Memory is per seller: someone else is unaffected.
    assert _run(_req(seed=8), user="user-2").morning


def test_retries_only_the_short_side(monkeypatch: pytest.MonkeyPatch) -> None:
    first = {"morning": _items(MORNING), "afternoon": _items(AFTERNOON[:3])}
    second = {"morning": [], "afternoon": _items(AFTERNOON[3:])}
    fake, prompts = _replying(first, second)
    _patch(monkeypatch, fake)
    result = _run(_req())
    assert len(prompts) == 2
    assert 'return "morning": []' in prompts[1]
    assert "Bake a small batch of scones" in prompts[1]  # told what it already wrote
    assert len(result.afternoon) >= 6


def test_top_up_request_writes_one_side(monkeypatch: pytest.MonkeyPatch) -> None:
    fake, prompts = _replying({"morning": [], "afternoon": _items(AFTERNOON)})
    _patch(monkeypatch, fake)
    result = _run(_req(morningCount=0, afternoonCount=10))
    assert result.morning == [] and len(result.afternoon) == 10
    assert len(prompts) == 1


def test_raises_when_nothing_usable(monkeypatch: pytest.MonkeyPatch) -> None:
    bad = {
        "morning": [{"brief": 1, "concept": "fun", "activity": "Do something fun"}],
        "afternoon": [{"brief": 1, "concept": "lunch", "activity": "Meet a friend for lunch"}],
    }
    fake, prompts = _replying(bad)
    _patch(monkeypatch, fake)
    with pytest.raises(RollADayGenerationError):
        _run(_req())
    assert len(prompts) == 2


def test_raises_when_the_model_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    async def broken(_prompt: str) -> str:
        return "{not json"

    _patch(monkeypatch, broken)
    with pytest.raises(RollADayGenerationError, match="valid Roll-a-Day"):
        _run(_req())


def test_request_bounds() -> None:
    with pytest.raises(ValueError):
        RollADayRequest(morningCount=20)
    with pytest.raises(ValueError):
        RollADayRequest(focus="golf")
    assert RollADayRequest(maxActivityChars=36).max_activity_chars == 36
