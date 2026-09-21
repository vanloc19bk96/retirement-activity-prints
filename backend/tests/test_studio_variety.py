from __future__ import annotations

import asyncio
import json

import pytest

from app.schemas.studio_category_fluency import CategoryFluencyRequest
from app.services.studio_category_fluency_service import generate_category_fluency
from app.services.studio_variety import (
    VarietyScope,
    bucket_key,
    normalize_label,
    recent,
    remember,
    reset_memory,
    variety_angle,
    variety_lines,
    with_variety,
)


@pytest.fixture(autouse=True)
def _clean_memory() -> None:
    reset_memory()
    yield
    reset_memory()


def _scope(seed: int = 1, user_id: str = "user-1", bucket: str = "picnic") -> VarietyScope:
    return VarietyScope(game="category-fluency", user_id=user_id, bucket=bucket, seed=seed)


def test_normalize_label_trims_case_punctuation_and_spacing() -> None:
    assert normalize_label("  Whole   milk , ") == "Whole milk"
    assert normalize_label("") == ""
    assert normalize_label(None) == ""


def test_bucket_key_ignores_case_and_empty_parts() -> None:
    assert bucket_key("Picnic At The Park", "", "standard") == "picnic at the park|standard"
    assert bucket_key("", None) == "default"


def test_memory_is_scoped_per_game_user_and_bucket() -> None:
    remember(_scope(), ["Milk", "Bread"])
    assert recent(_scope()) == ("Bread", "Milk")
    assert recent(_scope(user_id="user-2")) == ()
    assert recent(_scope(bucket="camping")) == ()


def test_memory_deduplicates_case_insensitively() -> None:
    remember(_scope(), ["Milk", "milk", "  MILK  "])
    assert recent(_scope()) == ("Milk",)


def test_variety_lines_carry_the_angle_before_any_history() -> None:
    block = variety_lines(_scope(seed=3))
    assert variety_angle(3) in block
    assert "Already used" not in block


def test_variety_lines_list_remembered_and_client_labels() -> None:
    remember(_scope(), ["Bread"])
    block = variety_lines(_scope(seed=2), client_avoid=["Cheese"])
    assert "Cheese" in block
    assert "Bread" in block


def test_variety_lines_do_not_repeat_a_label_the_client_already_sent() -> None:
    remember(_scope(), ["Bread"])
    block = variety_lines(_scope(seed=2), client_avoid=["bread"])
    assert block.lower().count("bread") == 1


def test_variety_lines_cap_the_avoid_list() -> None:
    remember(_scope(), [f"Item {i}" for i in range(30)])
    block = variety_lines(_scope(seed=2), limit=5)
    avoid_line = next(line for line in block.splitlines() if "Already used" in line)
    listed = avoid_line.split("repeat: ", 1)[1].rstrip(".").split(", ")
    assert len(listed) == 5
    # Newest first — the sheet just printed is the one a reader would spot.
    assert listed[0] == "Item 29"


def test_angle_rotates_with_the_seed() -> None:
    assert len({variety_angle(seed) for seed in range(8)}) > 1


def test_nonce_differs_between_two_calls_with_the_same_bucket() -> None:
    first = variety_lines(_scope(seed=1))
    second = variety_lines(_scope(seed=2))
    assert first != second


def test_with_variety_appends_the_block_after_the_prompt() -> None:
    prompt = with_variety("Write ten words.", _scope(seed=4))
    assert prompt.startswith("Write ten words.")
    assert "FRESHNESS" in prompt


def test_at_seed_keeps_the_bucket_and_changes_the_draw() -> None:
    scope = _scope(seed=1)
    moved = scope.at_seed(9)
    assert moved.key == scope.key
    assert moved.seed == 9


# ------------------------------------------------- end-to-end through a service

_EXAMPLES = [f"Example {i}" for i in range(15)]
_PAYLOAD = {"category": "Zither tuners", "examples": _EXAMPLES}


def test_a_second_generation_is_told_what_the_first_one_printed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    prompts: list[str] = []

    async def fake_gemini(prompt: str) -> str:
        prompts.append(prompt)
        return json.dumps(_PAYLOAD)

    monkeypatch.setattr(
        "app.services.studio_category_fluency_service._call_gemini", fake_gemini
    )
    monkeypatch.setattr(
        "app.services.studio_category_fluency_service._check_rate_limit",
        lambda _uid: None,
    )

    req = CategoryFluencyRequest(lineCount=15, seed=1)
    asyncio.run(generate_category_fluency(req, user_id="user-1"))
    assert "Zither tuners" not in prompts[0]

    asyncio.run(
        generate_category_fluency(
            req.model_copy(update={"seed": 2}), user_id="user-1"
        )
    )
    assert "Zither tuners" in prompts[1]


def test_another_user_does_not_inherit_the_first_users_list(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    prompts: list[str] = []

    async def fake_gemini(prompt: str) -> str:
        prompts.append(prompt)
        return json.dumps(_PAYLOAD)

    monkeypatch.setattr(
        "app.services.studio_category_fluency_service._call_gemini", fake_gemini
    )
    monkeypatch.setattr(
        "app.services.studio_category_fluency_service._check_rate_limit",
        lambda _uid: None,
    )

    req = CategoryFluencyRequest(lineCount=15, seed=1)
    asyncio.run(generate_category_fluency(req, user_id="user-1"))
    asyncio.run(generate_category_fluency(req, user_id="user-2"))
    assert "Zither tuners" not in prompts[1]


def test_the_client_avoid_list_reaches_the_prompt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    prompts: list[str] = []

    async def fake_gemini(prompt: str) -> str:
        prompts.append(prompt)
        return json.dumps(_PAYLOAD)

    monkeypatch.setattr(
        "app.services.studio_category_fluency_service._call_gemini", fake_gemini
    )
    monkeypatch.setattr(
        "app.services.studio_category_fluency_service._check_rate_limit",
        lambda _uid: None,
    )

    req = CategoryFluencyRequest(
        lineCount=15, seed=1, avoid=["Boats"]
    )
    asyncio.run(generate_category_fluency(req, user_id="user-1"))
    assert "Boats" in prompts[0]
