from __future__ import annotations

import asyncio
import json
import math
import re
from collections import Counter

import pytest
from pydantic import ValidationError

from app.schemas.studio_office_awards import OfficeAwardsRequest, OfficeAwardsResponse
from app.services.studio_office_awards_service import (
    OfficeAwardsGenerationError,
    anchor_theme,
    award_subjects,
    award_tokens,
    awards_repeat,
    briefs,
    build_prompt_for_tests,
    generate_office_awards,
    group_cap,
    normalize_award,
    parse_payload_for_tests,
    plan_slots,
    shapes,
    themes,
    title_case,
    warm_target,
)
from app.services.studio_variety import reset_memory

SERVICE = "app.services.studio_office_awards_service"

# Thirty-two valid, mutually distinct awards: (award, theme, tone). Mirrors
# OA_FIXTURE_ITEMS in frontend/src/utils/studio/office-awards/fixture.ts.
FIXTURE = [
    ("Most Likely to Inherit the Retiree’s Chair", "farewell", "playful"),
    ("Knows Every Drink Order by Heart", "hot-drinks", "playful"),
    ("Keeper of the Emergency Snack Drawer", "snacks-treats", "playful"),
    ("Always Saves a Seat at Lunch", "lunch", "warm"),
    ("Clearest Notes in Every Meeting", "meetings", "playful"),
    ("Kindest Thank-You Notes", "messages", "warm"),
    ("First Through the Door Every Morning", "timekeeping", "playful"),
    ("Most Likely to Label the Label Maker", "organizing", "playful"),
    ("Never Without a Spare Pen", "supplies", "playful"),
    ("Unofficial Help Desk Hero", "tech", "playful"),
    ("First Call When Anyone Is Stuck", "fixers", "warm"),
    ("Walking Encyclopedia of the Workplace", "know-how", "playful"),
    ("Master of the Perfect One-Liner", "humour", "playful"),
    ("Best Weekend Storyteller", "stories", "playful"),
    ("Most Thriving Desk Plant", "workspace", "playful"),
    ("Always First to Lend a Hand", "teamwork", "warm"),
    ("Best Listener in the Building", "kindness", "warm"),
    ("Chief Monday Morning Sunshine", "morale", "playful"),
    ("Party Planner Extraordinaire", "celebrations", "playful"),
    ("Most Patient Teacher", "mentoring", "warm"),
    ("Steadiest Presence on a Busy Day", "calm", "warm"),
    ("Break Room Crossword Champion", "breakroom", "playful"),
    ("Unofficial Weather Reporter", "everyday", "playful"),
    ("Most Adventurous Traveller", "outside-work", "playful"),
    ("Remembers Every Birthday", "kindness", "warm"),
    ("Always Has a Plan B", "fixers", "playful"),
    ("First to Volunteer, Every Time", "teamwork", "playful"),
    ("Brightens Every Room", "morale", "warm"),
    ("Makes Every Milestone Special", "celebrations", "warm"),
    ("Wise Words for Every Occasion", "mentoring", "playful"),
    ("Cool as a Cucumber Under Pressure", "calm", "playful"),
    ("Keeps the Team on Track", "organizing", "warm"),
]
AWARDS = [award for award, _, _ in FIXTURE]

BRIEF_RE = re.compile(r"^(\d+)\. \[", re.MULTILINE)


def _req(**overrides) -> OfficeAwardsRequest:
    return OfficeAwardsRequest(**{"workplace": "any", "awards": 12, "seed": 7, **overrides})


def _reply(prompt: str, pool=AWARDS, *, start: int = 0) -> str:
    """Answer every brief in the prompt with the next fixture award."""
    numbers = [int(n) for n in BRIEF_RE.findall(prompt)]
    items = [
        {"brief": number, "concept": f"idea {start + offset}", "award": pool[(start + offset) % len(pool)]}
        for offset, number in enumerate(numbers)
    ]
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
    for award in AWARDS:
        assert normalize_award(award, budget=48) == award
    for i, a in enumerate(AWARDS):
        for b in AWARDS[:i]:
            assert not awards_repeat(a, b), (a, b)


def test_sets_title_case_and_curly_apostrophes_only() -> None:
    assert normalize_award("most likely to rescue the stapler", budget=48) == "Most Likely to Rescue the Stapler"
    assert normalize_award("2. Keeper of the retiree's Desk Plant", budget=48) == "Keeper of the Retiree’s Desk Plant"
    assert normalize_award('"Calmest Voice on the Night Shift"', budget=48) == "Calmest Voice on the Night Shift"
    assert title_case("the always-has-a-map award") == "The Always-Has-a-Map Award"
    # Initialisms keep their capitals.
    assert title_case("unofficial IT whisperer") == "Unofficial IT Whisperer"


@pytest.mark.parametrize(
    "award",
    [
        "Best Coworker Ever",
        "Most Valuable Team Member",
        "Worst Timekeeper",
        "Least Productive Afternoon",
        "Laziest Lunch Break",
        "Most Likely to Get Fired",
        "Biggest Complainer",
        "Most Annoying Ringtone",
        "Office Queen of Spreadsheets",
        "Nicest Guy in Accounts",
        "Best Dressed on Fridays",
        "Best Hair in the Building",
        "Most Likely to Nap at Their Desk",
        "Oldest Coffee Mug",
        "Happy Hour Organizer",
        "Most Likely to Forget a Password",
        "Your Favourite Colleague",
        "Most Likely to Fix the Printer!",
        "Who Fixes the Printer?",
        "Printer: Fixed",
        "Office Oscars Winner",
        "Starbucks Run Champion",
        "FASTEST EMAIL REPLY",
        "Champion",
        "Most Likely to Know Every Single Shortcut on Every Keyboard in the Building",
        "Friendliest Hello on a Monday",
    ],
)
def test_rejects_unprintable_awards(award: str) -> None:
    assert normalize_award(award, budget=48) is None


def test_budget_is_the_page_limit() -> None:
    award = "Most Likely to Know Where Everything Is"
    assert normalize_award(award, budget=48) == award
    assert normalize_award(award, budget=30) is None


def test_folds_awards_to_their_idea() -> None:
    assert awards_repeat("Most Coffee Consumed", "Biggest Coffee Drinker")
    assert awards_repeat("Tidiest Desk in the Building", "The Tidiest Desk Award")
    assert not awards_repeat("Most Coffee Consumed", "Most Likely to Fix the Printer")
    assert award_tokens("Best Coworker of the Year") == frozenset()


def test_spots_what_an_award_is_really_about() -> None:
    assert award_subjects("Always First to Put the Kettle On") == {"drinks"}
    assert award_subjects("Most Likely to Inherit the Retiree’s Chair") == {"farewell"}
    assert award_subjects("Best Excuse for Being Late") == {"time"}
    # A phone charger is kit, not a phone call.
    assert award_subjects("Lender of the Spare Phone Charger") == frozenset()


# ---------------------------------------------------------------- data


def test_every_theme_is_well_formed() -> None:
    groups = {theme.group for theme in themes()}
    for group in groups:
        assert group_cap(group, 24) >= 1
    assert anchor_theme() in {theme.key for theme in themes()}
    assert sum(len(t.facets["playful"]) + len(t.facets["warm"]) for t in themes()) >= 150
    for theme in themes():
        assert theme.tones, theme.key
        for tone in theme.tones:
            for facet in theme.facets[tone]:
                assert facet.strip() == facet and facet, (theme.key, facet)
    # Enough warm themes for any set's quota.
    assert sum(1 for t in themes() if t.has("warm")) >= warm_target(24) // 2


def test_group_caps_scale_with_the_set() -> None:
    assert group_cap("drinks", 8) == 1
    assert group_cap("drinks", 24) == 1
    assert group_cap("food", 12) == 1
    assert group_cap("food", 24) == 2
    assert group_cap("teamwork", 24) == 3


# ---------------------------------------------------------------- plan


@pytest.mark.parametrize("awards", [8, 12, 16, 20, 24])
def test_plans_a_balanced_set_plus_spares(awards: int) -> None:
    slots = plan_slots(_req(awards=awards, seed=11))
    main = slots[:awards]
    assert len(slots) == awards + 8
    assert main[0].theme.key == anchor_theme()
    assert Counter(slot.tone for slot in main)["warm"] == warm_target(awards)
    groups = Counter(slot.theme.group for slot in main)
    for group, count in groups.items():
        assert count <= group_cap(group, awards), group
    assert Counter(slot.theme.key for slot in main).most_common(1)[0][1] <= 2
    assert max(Counter(slot.shape for slot in main).values()) <= math.ceil(awards / len(shapes()))
    for slot in slots:
        assert slot.facet_text


def test_plan_follows_the_seed() -> None:
    first = [(s.theme.key, s.tone, s.facet_text, s.shape) for s in plan_slots(_req(seed=3))]
    again = [(s.theme.key, s.tone, s.facet_text, s.shape) for s in plan_slots(_req(seed=3))]
    other = [(s.theme.key, s.tone, s.facet_text, s.shape) for s in plan_slots(_req(seed=4))]
    assert first == again
    assert first != other


def test_top_up_asks_only_for_the_named_themes_and_tone() -> None:
    slots = plan_slots(_req(themes=["kindness", "tech", "nope"], count=5, tone="warm"))
    assert len(slots) == 5
    assert {slot.theme.key for slot in slots} == {"kindness", "tech"}
    assert all(slot.tone == "warm" for slot in slots)
    assert plan_slots(_req(themes=["nope"])) == []


def test_request_bounds() -> None:
    with pytest.raises(ValidationError):
        OfficeAwardsRequest(awards=40)
    with pytest.raises(ValidationError):
        OfficeAwardsRequest(maxAwardChars=90)
    with pytest.raises(ValidationError):
        OfficeAwardsRequest(workplace="moon base")
    assert OfficeAwardsRequest(maxAwardChars=40).max_award_chars == 40


# ---------------------------------------------------------------- prompt


def test_prompt_carries_every_brief_and_the_workplace() -> None:
    slots = plan_slots(_req(workplace="school"))
    asks = list(enumerate(slots))
    prompt = build_prompt_for_tests(asks, workplace="school")
    lines, owners = briefs(asks)
    assert [int(n) for n in BRIEF_RE.findall(prompt)] == list(range(1, len(slots) + 1))
    assert owners == {i + 1: i for i in range(len(slots))}
    assert "staff room" in prompt
    assert "the\n  Retiree" in prompt or "the Retiree" in prompt
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
    res = asyncio.run(generate_office_awards(_req(), user_id="u1"))
    assert isinstance(res, OfficeAwardsResponse)
    assert len(prompts) == 1
    assert [item.award for item in res.awards] == AWARDS[:20]
    slots = plan_slots(_req())
    assert [(i.theme, i.tone, i.shape) for i in res.awards] == [
        (s.theme.key, s.tone, s.shape) for s in slots
    ]


def test_retries_only_the_briefs_that_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    prompts: list[str] = []

    async def fake(prompt: str) -> str:
        prompts.append(prompt)
        if len(prompts) == 1:
            # Half the set comes back mean or broken.
            numbers = [int(n) for n in BRIEF_RE.findall(prompt)]
            items = [
                {"brief": n, "concept": f"idea {n}", "award": AWARDS[n - 1] if n % 2 else "Worst Timekeeper"}
                for n in numbers
            ]
            return json.dumps({"items": items})
        return _reply(prompt, start=1)

    _patch(monkeypatch, fake)
    res = asyncio.run(generate_office_awards(_req(), user_id="u1"))
    assert len(prompts) == 2
    assert len(BRIEF_RE.findall(prompts[1])) == 10
    awards = [item.award for item in res.awards]
    assert "Worst Timekeeper" not in awards
    for i, a in enumerate(awards):
        for b in awards[:i]:
            assert not awards_repeat(a, b)


def test_never_repeats_what_the_seller_printed(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake(prompt: str) -> str:
        return _reply(prompt)

    _patch(monkeypatch, fake)
    res = asyncio.run(
        generate_office_awards(_req(avoid=["Biggest Snack Drawer Keeper", AWARDS[1]]), user_id="u1")
    )
    awards = [item.award for item in res.awards]
    assert AWARDS[1] not in awards
    assert AWARDS[2] not in awards

    # The worker remembers: the same seller's next set drops what it printed.
    again = asyncio.run(generate_office_awards(_req(seed=8), user_id="u1"))
    assert not {item.award for item in again.awards} & set(awards)


def test_fails_plainly_when_nothing_survives(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake(prompt: str) -> str:
        numbers = [int(n) for n in BRIEF_RE.findall(prompt)]
        return json.dumps({"items": [{"brief": n, "concept": "x", "award": "Best Dressed"} for n in numbers]})

    _patch(monkeypatch, fake)
    with pytest.raises(OfficeAwardsGenerationError):
        asyncio.run(generate_office_awards(_req(), user_id="u1"))
