from __future__ import annotations

import asyncio
import json

import pytest

from app.services import studio_occupation as occ
from app.services.prompt_data import load_config

SERVICE = "app.services.studio_occupation"
PRESETS = load_config("occupations")["presets"]

FIREFIGHTER = {
    "suitable": True,
    "reason": "",
    "label": "Firefighter",
    "who": "Firefighters and fire service crews",
    "areas": [
        "fire engines, ladders and hose",
        "the fire station and its bays",
        "turnout gear, helmets and boots",
        "the fire bell, alarms and call-outs",
        "the history of fire brigades",
        "fire service ranks and titles",
        "station traditions and the station dog",
        "hydrants, pumps and water supply",
        "training drills and the drill tower",
        "the brass pole and life in the bunk room",
        "fire safety visits to schools",
        "radio calls and station codes",
        "Fire engines, ladders and hose",
        "Starbucks coffee runs at the station",
        "x",
    ],
    "care": "Never describe fires that took lives or injuries; celebrate the crew, the kit and the history",
    "blocked_terms": ["burn victim", "Arson", "not a term!", "x"],
}


@pytest.fixture(autouse=True)
def _fresh_cache():
    occ.clear_cache_for_tests()
    yield
    occ.clear_cache_for_tests()


def _planner(reply: dict, calls: list | None = None):
    async def call(prompt: str) -> str:
        if calls is not None:
            calls.append(prompt)
        await asyncio.sleep(0)
        return json.dumps(reply)

    return call


# ---------------------------------------------------------------- presets


@pytest.mark.parametrize("key", sorted(PRESETS))
def test_every_preset_is_a_complete_profile(key: str) -> None:
    profile = occ.preset_profile(key)
    assert profile.key == key and not profile.custom
    assert profile.label and profile.who and profile.care
    assert len(profile.areas) >= 16 and len(set(profile.areas)) == len(profile.areas)
    assert profile.blocked_terms


# ---------------------------------------------------------------- the typed name


@pytest.mark.parametrize(
    "name",
    ["Firefighter", "bus driver", "HVAC technician", "911 dispatcher", "Teacher's aide", "Firefighter/EMT"],
)
def test_ordinary_job_names_are_accepted(name: str) -> None:
    assert occ.occupation_name_problem(name) is None


@pytest.mark.parametrize(
    "name, fragment",
    [
        ("", "Type an occupation"),
        ("   ", "Type an occupation"),
        ("x" * 41, "under 40"),
        ("one two three four five six", "5 words"),
        ("12", "letters"),
        ("Fire<fighter>", "letters"),
        ("Walmart greeter", "company or brand"),
        ("Stripper", "can’t be used"),
        ("drug dealer", "can’t be used"),
    ],
)
def test_bad_names_are_refused_before_any_call(name: str, fragment: str) -> None:
    problem = occ.occupation_name_problem(name)
    assert problem and fragment in problem


def test_names_fold_the_way_the_client_folds_them() -> None:
    assert occ.clean_occupation("  Bus   Driver ") == "Bus Driver"
    assert occ.fold_occupation("Teacher’s  Aide") == "teacher's aide"


def test_a_typed_preset_is_the_preset() -> None:
    assert occ.preset_for_name("  TEACHER ") == "teacher"
    assert occ.preset_for_name("Police") == "police"
    assert occ.preset_for_name("Firefighter") is None


# ---------------------------------------------------------------- the reply


def test_a_reply_becomes_a_clean_profile() -> None:
    profile = occ.profile_from_reply("fire fighter", FIREFIGHTER)
    assert profile.custom and profile.key == "fire fighter"
    assert profile.label == "Firefighter"
    assert profile.who == "firefighters and fire service crews"
    # Duplicates, brands and fragments are dropped, never repaired.
    assert len(profile.areas) == 12
    assert not any("Starbucks" in area for area in profile.areas)
    assert profile.care.endswith(".")
    assert profile.blocked_terms == ("burn victim", "arson")
    assert profile.blocked_re.search("a Burn Victim was")
    assert not profile.blocked_re.search("the brass pole")


def test_a_profile_without_blocked_terms_blocks_nothing() -> None:
    profile = occ.profile_from_reply("Firefighter", {**FIREFIGHTER, "blocked_terms": []})
    assert profile.blocked_terms == ()
    assert not profile.blocked_re.search("anything at all")


def test_a_refusal_carries_the_planners_reason() -> None:
    with pytest.raises(occ.OccupationNotSuitableError, match="company rather than a job"):
        occ.profile_from_reply("Acme", {"suitable": False, "reason": "This is a company rather than a job"})


def test_a_refusal_with_no_usable_reason_still_explains() -> None:
    with pytest.raises(occ.OccupationNotSuitableError, match="can’t be used"):
        occ.profile_from_reply("Acme", {"suitable": False, "reason": "<b>no</b>" * 40})


def test_a_thin_plan_is_not_used() -> None:
    with pytest.raises(occ.OccupationPlanError):
        occ.profile_from_reply("Firefighter", {**FIREFIGHTER, "areas": FIREFIGHTER["areas"][:5]})
    with pytest.raises(occ.OccupationPlanError):
        occ.profile_from_reply("Firefighter", {**FIREFIGHTER, "care": ""})


def test_the_prompt_names_the_job_and_the_area_count() -> None:
    prompt = occ.build_prompt_for_tests("Bus driver")
    assert '"Bus driver"' in prompt and "exactly 16" in prompt


# ---------------------------------------------------------------- planning


def test_a_job_is_planned_once_however_many_pages_ask_at_once(monkeypatch) -> None:
    calls: list = []
    monkeypatch.setattr(f"{SERVICE}._call_planner", _planner(FIREFIGHTER, calls))

    async def many():
        return await asyncio.gather(*(occ.custom_profile(name) for name in ["Firefighter", " firefighter", "FIREFIGHTER"]))

    profiles = asyncio.run(many())
    assert len(calls) == 1
    assert all(profile is profiles[0] for profile in profiles)


def test_a_refusal_is_remembered_but_a_failure_is_not(monkeypatch) -> None:
    calls: list = []
    monkeypatch.setattr(
        f"{SERVICE}._call_planner", _planner({"suitable": False, "reason": "Not a job."}, calls)
    )
    for _ in range(2):
        with pytest.raises(occ.OccupationNotSuitableError, match="Not a job"):
            asyncio.run(occ.custom_profile("Couch potato"))
    assert len(calls) == 1

    async def broken(_prompt: str) -> str:
        calls.append(_prompt)
        raise RuntimeError("model down")

    monkeypatch.setattr(f"{SERVICE}._call_planner", broken)
    for _ in range(2):
        with pytest.raises(occ.OccupationPlanError):
            asyncio.run(occ.custom_profile("Firefighter"))
    assert len(calls) == 3


def test_a_typed_preset_or_a_bad_name_never_calls_the_planner(monkeypatch) -> None:
    async def never(_prompt: str) -> str:
        raise AssertionError("the planner must not be called")

    monkeypatch.setattr(f"{SERVICE}._call_planner", never)
    assert asyncio.run(occ.custom_profile("Nurse")).key == "nurse"
    with pytest.raises(occ.OccupationNotSuitableError):
        asyncio.run(occ.custom_profile("Hitman"))


def test_resolve_prefers_the_typed_job(monkeypatch) -> None:
    monkeypatch.setattr(f"{SERVICE}._call_planner", _planner(FIREFIGHTER))
    assert asyncio.run(occ.resolve_occupation("teacher", "")).key == "teacher"
    assert asyncio.run(occ.resolve_occupation("teacher", "Firefighter")).key == "firefighter"
    with pytest.raises(occ.OccupationNotSuitableError):
        asyncio.run(occ.resolve_occupation("any", ""))


def test_the_cache_is_bounded(monkeypatch) -> None:
    monkeypatch.setattr(f"{SERVICE}._call_planner", _planner(FIREFIGHTER))
    monkeypatch.setattr(f"{SERVICE}._limit", lambda key: 2 if key == "cacheSize" else occ.int_value(
        occ.section(occ._config(), "limits"), key
    ))
    for name in ["Firefighter", "Bus driver", "Electrician"]:
        asyncio.run(occ.custom_profile(name))
    assert list(occ._cache) == ["bus driver", "electrician"]


def test_custom_line_names_the_job_and_its_care() -> None:
    profile = occ.profile_from_reply("Firefighter", FIREFIGHTER)
    line = occ.custom_line(profile, subject="The team")
    assert line.startswith("The team worked as firefighters and fire service crews (Firefighter).")
    assert profile.care in line
