"""The job-themed games written for one occupation: a preset, or a job the seller typed.

Each game's own gates and checks are tested in its own file; this one covers
what the occupation changes -- the brief, the prompt, the memory bucket -- and
that a job no page can be written for stops every game before it writes.
"""

from __future__ import annotations

import asyncio
import json
import re

import pytest

from app.schemas.studio_career_numbers import CareerNumbersRequest
from app.schemas.studio_office_awards import OfficeAwardsRequest
from app.schemas.studio_work_lingo import WorkLingoPair, WorkLingoRequest
from app.services import studio_occupation as occ
from app.services.studio_career_numbers_service import generate_career_numbers
from app.services.studio_office_awards_service import generate_office_awards
from app.services.studio_variety import reset_memory
from app.services.studio_work_lingo_service import (
    budgets_for,
    build_check_plan,
    build_prompt_for_tests,
    generate_work_lingo,
    normalize_pair,
)

ELECTRICIAN = {
    "suitable": True,
    "reason": "",
    "label": "Electrician",
    "who": "electricians and wiring crews",
    "areas": [f"electrician corner number {n}" for n in range(1, 17)],
    "care": "Never give wiring instructions or describe shocks or injuries.",
    "blocked_terms": ["electrocution"],
}


@pytest.fixture(autouse=True)
def _fresh():
    occ.clear_cache_for_tests()
    reset_memory()
    yield
    occ.clear_cache_for_tests()
    reset_memory()


def _plan(monkeypatch: pytest.MonkeyPatch, reply: dict, calls: list | None = None) -> None:
    async def planner(prompt: str) -> str:
        if calls is not None:
            calls.append(prompt)
        return json.dumps(reply)

    monkeypatch.setattr("app.services.studio_occupation._call_planner", planner)


def _electrician() -> occ.OccupationProfile:
    return occ.profile_from_reply("Electrician", ELECTRICIAN)


# ---------------------------------------------------------------- work lingo


def test_a_job_page_briefs_the_jobs_own_areas_and_angles() -> None:
    req = WorkLingoRequest(level="classic", count=10, seed=5)
    prompt = build_prompt_for_tests(req, occupation=_electrician())
    briefs = re.findall(r"^\d+\. area: ([^;]+); angle: ", prompt, flags=re.MULTILINE)
    assert len(briefs) == 14 and len(set(briefs)) == 14
    assert all(area.startswith("electrician corner number") for area in briefs)
    assert "written for electricians and wiring crews" in prompt
    assert "Never give wiring instructions" in prompt
    assert "never general office talk" in prompt
    # The everyday office page is untouched.
    office = build_prompt_for_tests(req)
    assert "; era: " in office and "electrician" not in office


def test_a_job_page_is_checked_as_that_jobs_lingo() -> None:
    pairs = [WorkLingoPair(phrase="Hot wire", meaning="A cable carrying live current")]
    plan = build_check_plan(pairs, seed=1, occupation=_electrician())
    assert "the lingo of electricians and wiring crews" in plan.prompt
    assert "It keeps to this rule: Never give wiring instructions" in plan.prompt
    assert "workplace phrases" not in plan.prompt
    assert "workplace phrases" in build_check_plan(pairs, seed=1).prompt


def test_a_jobs_blocked_terms_gate_its_pairs() -> None:
    budgets = budgets_for(WorkLingoRequest())
    raw = {"phrase": "Electrocution risk", "meaning": "Danger from a live cable nearby"}
    assert normalize_pair(raw, budgets=budgets) is not None
    assert normalize_pair(raw, budgets=budgets, occupation=_electrician()) is None


def _lingo_writer(prompts: list):
    async def writer(prompt: str) -> str:
        prompts.append(prompt)
        raise RuntimeError("stop after the prompt")

    return writer


def test_work_lingo_resolves_presets_and_typed_jobs(monkeypatch) -> None:
    calls: list = []
    _plan(monkeypatch, ELECTRICIAN, calls)
    prompts: list = []
    monkeypatch.setattr("app.services.studio_work_lingo_service._call_writer", _lingo_writer(prompts))
    monkeypatch.setattr("app.services.studio_work_lingo_service._check_rate_limit", lambda _uid: None)

    for req in (
        WorkLingoRequest(),
        WorkLingoRequest(occupation="trucker"),
        WorkLingoRequest(occupation="any", customOccupation="Electrician"),
    ):
        with pytest.raises(Exception):
            asyncio.run(generate_work_lingo(req, user_id="u1"))

    everyday, trucker, electrician = prompts[0], prompts[2], prompts[4]
    assert "; era: " in everyday
    assert "written for truck drivers" in trucker
    assert "written for electricians and wiring crews" in electrician
    assert len(calls) == 1


# ---------------------------------------------------------------- office awards and career numbers


def test_a_typed_job_plans_from_every_theme() -> None:
    assert OfficeAwardsRequest(workplace="school", customOccupation="Electrician").workplace == "any"
    assert CareerNumbersRequest(workplace="trades", customOccupation="Electrician").workplace == "any"
    assert OfficeAwardsRequest(workplace="school").workplace == "school"


@pytest.mark.parametrize(
    "service, run, req, subject",
    [
        ("studio_office_awards_service", generate_office_awards, OfficeAwardsRequest, "The team"),
        ("studio_career_numbers_service", generate_career_numbers, CareerNumbersRequest, "The retiree"),
    ],
)
def test_a_typed_job_sets_the_voice_of_the_set(monkeypatch, service, run, req, subject) -> None:
    _plan(monkeypatch, ELECTRICIAN)
    prompts: list = []

    async def capture(prompt: str) -> str:
        prompts.append(prompt)
        raise RuntimeError("stop after the prompt")

    monkeypatch.setattr(f"app.services.{service}._call_gemini", capture)
    monkeypatch.setattr(f"app.services.{service}._check_rate_limit", lambda _uid: None)

    with pytest.raises(Exception):
        asyncio.run(run(req(customOccupation="Electrician"), user_id="u1"))
    assert prompts
    assert f"{subject} worked as electricians and wiring crews (Electrician)." in prompts[0]
    assert "Never give wiring instructions" in prompts[0]


@pytest.mark.parametrize(
    "service, run, req",
    [
        ("studio_work_lingo_service", generate_work_lingo, WorkLingoRequest),
        ("studio_office_awards_service", generate_office_awards, OfficeAwardsRequest),
        ("studio_career_numbers_service", generate_career_numbers, CareerNumbersRequest),
    ],
)
def test_a_refused_job_stops_every_game_before_it_writes(monkeypatch, service, run, req) -> None:
    _plan(monkeypatch, {"suitable": False, "reason": "This is a hobby rather than a job."})

    async def never(_prompt: str) -> str:
        raise AssertionError("nothing may be written for a refused job")

    for name in ("_call_gemini", "_call_writer", "_call_checker"):
        monkeypatch.setattr(f"app.services.{service}.{name}", never, raising=False)
    monkeypatch.setattr(f"app.services.{service}._check_rate_limit", lambda _uid: None)

    with pytest.raises(occ.OccupationNotSuitableError, match="hobby rather than a job"):
        asyncio.run(run(req(customOccupation="Stamp collecting"), user_id="u1"))
