from __future__ import annotations

import asyncio
import json
import re

import pytest

from app.schemas.studio_weeks_of_firsts import (
    WeeksOfFirstsAreaAsk,
    WeeksOfFirstsRequest,
    WeeksOfFirstsResponse,
)
from app.services.studio_bucket_list_service import keys_repeat
from app.services.studio_variety import reset_memory
from app.services.studio_weeks_of_firsts_service import (
    WeeksOfFirstsGenerationError,
    areas,
    batches,
    boosted,
    briefs,
    build_prompt_for_tests,
    first_key,
    firsts_repeat,
    generate_weeks_of_firsts,
    is_stretch,
    normalize_first,
    parse_payload_for_tests,
    plan_areas,
    plan_targets,
)

SERVICE = "app.services.studio_weeks_of_firsts_service"

# Four valid, mutually distinct ideas per area. Mirrors WF_FIXTURE_IDEAS in
# frontend/src/utils/studio/weeks-of-firsts/fixture.ts.
FIXTURE = {
    "kitchen": [
        "Cook a Thai green curry from scratch",
        "Bake a loaf of soda bread for the first time",
        "Roll out fresh pasta by hand",
        "Stir smoked paprika into a dish you often make",
    ],
    "tastes": [
        "Taste a fresh lychee from a greengrocer",
        "Order an Ethiopian dish at a restaurant new to you",
        "Sample three cheeses at a local deli counter",
        "Try a custard tart from a Portuguese bakery",
    ],
    "nearby": [
        "Ride a bus route to the very end of the line",
        "Walk down a street in town you've never explored",
        "Find out how your street got its name",
        "Find the best viewpoint in your town",
    ],
    "nature": [
        "Learn to recognise one bird by its song",
        "Name five kinds of cloud in the sky above you",
        "Follow a canal towpath you've never walked",
        "Press wildflowers to keep in a frame",
    ],
    "grow": [
        "Grow basil from seed on a windowsill",
        "Sprout mung beans in a glass jar",
        "Root a houseplant cutting in a jar of water",
        "Plant a pot of bulbs for the bees",
    ],
    "make": [
        "Shape a small pinch pot from air-dry clay",
        "Knit a simple square from a beginner pattern",
        "Fold a paper crane from a sheet of origami paper",
        "Make a bird feeder from a pine cone",
    ],
    "picture": [
        "Paint a small watercolour of the view from a window",
        "Take a photo walk looking only for circles",
        "Draw a self-portrait using a mirror",
        "Write your name in calligraphy with a broad pen",
    ],
    "words": [
        "Write a short poem about your favourite view",
        "Read a mystery novel by a writer from another country",
        "Write a letter to your younger self",
        "Listen to an audiobook of a classic you skipped at school",
    ],
    "music": [
        "Hear a live brass band play in the park",
        "Pick out a simple tune on a ukulele",
        "Sing with a community choir for one evening",
        "Listen to an album from start to finish without pausing",
    ],
    "learn": [
        "Learn ten words of Japanese",
        "Watch a documentary about how glass is made",
        "Learn a simple card trick to show a friend",
        "Tie three useful knots from a how-to video",
    ],
    "people": [
        "Invite a neighbour you barely know round for tea",
        "Join a conversation cafe in your area",
        "Call an old friend you haven't spoken to in years",
        "Ask a friend to teach you their favourite skill",
    ],
    "give": [
        "Volunteer for one shift at a food bank",
        "Join a community litter pick for an hour",
        "Leave a few books in a little free library",
        "Write a thank-you note to someone who helped you",
    ],
    "culture": [
        "Watch a play at a theatre you've never been to",
        "See a film in a language you don't speak",
        "Visit a museum you've always walked past",
        "Wander a sculpture trail in a park",
    ],
    "calm": [
        "Follow a guided relaxation recording for ten minutes",
        "Spend a morning with no plans at all",
        "Brew a pot of loose-leaf tea to sip slowly",
        "Sit through a whole sunset without a screen nearby",
    ],
    "play": [
        "Play a board game you've never played before",
        "Complete a jigsaw of a place you'd love to visit",
        "Learn to play mahjong with a friend",
        "Solve your first cryptic crossword clue",
    ],
    "move": [
        "Try a beginner tai chi class",
        "Take a line dancing class at a community hall",
        "Play a game of table tennis",
        "Roll a few ends at a lawn bowls club",
    ],
    "adventure": [
        "Take a train to a town you've never visited",
        "Ride a ferry across to the other side of the water",
        "Tour a working farm to meet the animals",
        "Watch a show at a planetarium",
    ],
    "home": [
        "Rearrange one room to see it in a new way",
        "Make a small photo book of favourite pictures",
        "Scan a box of old photographs to keep safe",
        "Start a collection of postcards from your town",
    ],
}

ALL_IDEAS = [idea for ideas in FIXTURE.values() for idea in ideas]
_BRIEF_RE = re.compile(r"^(\d+)\. \[([^\]]+)\]", re.MULTILINE)


@pytest.fixture(autouse=True)
def _fresh_memory() -> None:
    reset_memory()


def _req(**overrides) -> WeeksOfFirstsRequest:
    base = {"seed": 7}
    base.update(overrides)
    return WeeksOfFirstsRequest(**base)


def _patch(monkeypatch: pytest.MonkeyPatch, fake) -> None:
    monkeypatch.setattr(f"{SERVICE}._call_gemini", fake)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)


def _model(pool=None, *, bad=None):
    """A fake model that answers every brief in a prompt from its area's pool.

    Reads the briefs back out of the prompt, the way the real model does, so
    the service's brief-to-area filing is what gets tested. ``bad`` swaps in a
    reply for some brief numbers.
    """
    label_to_key = {area.label: area.key for area in areas()}
    source = {key: list(ideas) for key, ideas in (pool or FIXTURE).items()}
    prompts: list[str] = []

    async def fake(prompt: str) -> str:
        prompts.append(prompt)
        items = []
        for number, label in _BRIEF_RE.findall(prompt):
            key = label_to_key[label]
            idea = source[key].pop(0) if source[key] else ""
            if bad and int(number) in bad:
                idea = bad[int(number)]
            items.append({"brief": int(number), "concept": idea.lower()[:30] or "none", "idea": idea})
        return json.dumps({"items": items})

    return fake, prompts


def _run(req: WeeksOfFirstsRequest, user: str = "user-1") -> WeeksOfFirstsResponse:
    return asyncio.run(generate_weeks_of_firsts(req, user_id=user))


# ---------------------------------------------------------------- parsing


def test_parse_valid_json() -> None:
    items = parse_payload_for_tests(json.dumps({"items": [{"brief": 1, "concept": "c", "idea": "x"}]}))
    assert len(items) == 1


def test_parse_rejects_empty_and_malformed() -> None:
    with pytest.raises(ValueError):
        parse_payload_for_tests(json.dumps({"items": []}))
    with pytest.raises(ValueError):
        parse_payload_for_tests(json.dumps({"items": "Cook a curry"}))
    with pytest.raises(ValueError):
        parse_payload_for_tests("not json")


# ---------------------------------------------------------------- gates


def test_fixture_is_valid_and_distinct() -> None:
    assert set(FIXTURE) == {area.key for area in areas()}
    for idea in ALL_IDEAS:
        assert normalize_first(idea, budget=60) == idea, idea
    keys = [first_key(idea) for idea in ALL_IDEAS]
    for i, key in enumerate(keys):
        for j in range(i):
            assert not keys_repeat(key, keys[j]), (ALL_IDEAS[i], ALL_IDEAS[j])


def test_accepts_a_roomier_weekly_line() -> None:
    idea = "Try a recipe from a cuisine you've never cooked before"
    assert normalize_first(idea, budget=60) == idea


@pytest.mark.parametrize(
    "idea",
    [
        "Visit a place you've never been",  # nothing concrete left
        "Try something different",  # vague
        "Build a snowman in the park",  # seasonal
        "Watch the fireworks on bonfire night",  # dated
        "Bake a cake for a friend's birthday",  # dated
        "You must try sushi",  # not a verb-led invitation
        "Finally face your fear of heights",  # pressure
        "Challenge yourself to learn Spanish",  # pressure
        "Bake bread and share it with a neighbour",  # two ideas
        "Visit a gallery or a museum",  # two ideas
        "Take a trip to Disneyland",  # brand
        "Try a new wine at a tasting",  # alcohol
        "Take your grandchildren to the zoo",  # assumes family
        "Ride a slow bus route all the way to the very end of the line today",  # too long
        "Cook",  # too short
    ],
)
def test_rejects_unprintable_ideas(idea: str) -> None:
    assert normalize_first(idea, budget=60) is None


def test_repeats_are_caught_by_meaning_not_padding() -> None:
    assert firsts_repeat("Learn basic painting", "Take a beginner painting lesson")
    assert firsts_repeat("Try painting for the first time", "Take a beginner painting lesson")
    assert firsts_repeat("Try a new restaurant", "Visit a restaurant you've never tried")
    # Both are "never tried", but they are different weeks.
    assert not firsts_repeat(
        "Cook a dish from a cuisine you've never tried", "Taste a fruit you've never tried"
    )


def test_stretch_ideas_are_recognised() -> None:
    assert is_stretch("Take a hot air balloon ride over the hills")
    assert is_stretch("Go kayaking on a quiet lake")
    assert not is_stretch("Sprout mung beans in a glass jar")


# ---------------------------------------------------------------- planning


@pytest.mark.parametrize("focus", ["balanced", "close-to-home", "out-and-about", "creative", "social"])
@pytest.mark.parametrize("seed", [1, 2, 42, 999])
def test_targets_fill_the_year_evenly(focus: str, seed: int) -> None:
    targets = plan_targets(focus, seed)
    assert set(targets) == {area.key for area in areas()}
    assert sum(targets.values()) == 52
    assert min(targets.values()) >= 2
    assert max(targets.values()) <= 4
    for key in boosted(focus):
        assert targets[key] == 4


def test_every_mix_boosts_real_areas() -> None:
    assert boosted("balanced") == ()
    for focus in ["close-to-home", "out-and-about", "creative", "social"]:
        assert len(boosted(focus)) == 4


def test_seed_changes_which_areas_take_a_third_week() -> None:
    assert plan_targets("balanced", 1) != plan_targets("balanced", 2) or plan_targets(
        "balanced", 1
    ) != plan_targets("balanced", 3)


def test_full_plan_writes_spares_in_concurrent_batches() -> None:
    plans = plan_areas(_req())
    assert len(plans) == len(areas())
    assert sum(plan.target for plan in plans) == 52
    assert all(plan.ask > plan.target for plan in plans)
    groups = batches([(plan, plan.ask) for plan in plans])
    assert 2 <= len(groups) <= 4
    assert sum(want for group in groups for _, want in group) == sum(plan.ask for plan in plans)


def test_top_up_plans_only_named_areas() -> None:
    req = _req(
        areas=[
            WeeksOfFirstsAreaAsk(key="music", count=2),
            WeeksOfFirstsAreaAsk(key="music", count=3),
            WeeksOfFirstsAreaAsk(key="nope", count=1),
        ]
    )
    plans = plan_areas(req)
    assert [(plan.area.key, plan.target) for plan in plans] == [("music", 2)]


def test_briefs_number_every_idea_and_file_it_under_its_area() -> None:
    plans = plan_areas(_req())
    batch = [(plans[0], 3), (plans[1], 2)]
    lines, owners = briefs(batch, seed=5)
    assert len(lines) == 5
    assert list(owners) == [1, 2, 3, 4, 5]
    assert owners[1] == plans[0].area.key and owners[5] == plans[1].area.key


def test_prompt_carries_briefs_budget_and_rules() -> None:
    plans = plan_areas(_req())
    prompt = build_prompt_for_tests([(plans[0], 3)], others=["music and sound"])
    assert "Write exactly 3 ideas" in prompt
    assert "at most 60 characters" in prompt
    assert '"music and sound"' in prompt
    assert "any week may fall at any time of year" in prompt
    assert "Return JSON only" in prompt


# ---------------------------------------------------------------- generate


def test_generates_every_area_with_spares(monkeypatch: pytest.MonkeyPatch) -> None:
    fake, prompts = _model()
    _patch(monkeypatch, fake)
    res = _run(_req())
    assert {area.key for area in res.areas} == set(FIXTURE)
    assert sum(area.target for area in res.areas) == 52
    for area in res.areas:
        assert len(area.items) >= area.target
    assert 2 <= len(prompts) <= 4


def test_drops_ideas_the_book_already_prints(monkeypatch: pytest.MonkeyPatch) -> None:
    fake, _ = _model()
    _patch(monkeypatch, fake)
    res = _run(_req(avoid=["Cook a green Thai curry at home"]))
    ideas = [item.idea for area in res.areas for item in area.items]
    assert "Cook a Thai green curry from scratch" not in ideas


def test_drops_invalid_ideas_and_tops_up_short_areas(monkeypatch: pytest.MonkeyPatch) -> None:
    # The first reply's first three briefs are unprintable; the retry refills.
    fake, prompts = _model(bad={1: "Build a snowman", 2: "Try something different", 3: "Go"})
    _patch(monkeypatch, fake)
    res = _run(_req())
    ideas = [item.idea for area in res.areas for item in area.items]
    assert "Build a snowman" not in ideas
    for idea in ideas:
        assert normalize_first(idea, budget=60) == idea


def test_raises_when_nothing_usable_comes_back(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake(prompt: str) -> str:
        return json.dumps({"items": [{"brief": 1, "concept": "x", "idea": "Do stuff"}]})

    _patch(monkeypatch, fake)
    with pytest.raises(WeeksOfFirstsGenerationError):
        _run(_req())


def test_returns_planned_areas_even_when_a_batch_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    fake, _ = _model()
    calls = {"n": 0}

    async def flaky(prompt: str) -> str:
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("upstream timeout")
        return await fake(prompt)

    monkeypatch.setattr(f"{SERVICE}._call_gemini", flaky)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)
    res = _run(_req())
    assert {area.key for area in res.areas} == set(FIXTURE)


def test_remembers_what_it_wrote_for_this_seller(monkeypatch: pytest.MonkeyPatch) -> None:
    fake, _ = _model()
    _patch(monkeypatch, fake)
    first = _run(_req(seed=1))
    written = {item.idea for area in first.areas for item in area.items}
    # The same model answers with the same ideas: only the ones the first run
    # never printed (spares it did not need) can come back.
    fake_again, _ = _model()
    _patch(monkeypatch, fake_again)
    second = _run(_req(seed=2))
    again = {item.idea for area in second.areas for item in area.items}
    assert written
    assert not written & again
    assert again <= set(ALL_IDEAS)
