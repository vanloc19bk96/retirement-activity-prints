from __future__ import annotations

from app.schemas.studio_life_timeline import LifeTimelineRequest
from app.services.studio_life_timeline_service import (
    build_prompt_for_tests,
    is_yes_no_for_tests,
    parse_prompts_json_for_tests,
    validate_prompts_for_tests,
)


def _req(**overrides: object) -> LifeTimelineRequest:
    payload = {
        "stage": "childhood",
        "promptCount": 4,
        "tone": "gentle",
        "seed": 1,
    }
    payload.update(overrides)
    return LifeTimelineRequest.model_validate(payload)


def test_drops_prompts_mentioning_death_illness_or_bereavement() -> None:
    prompts = [
        "What did your childhood home smell like on a Sunday?",
        "How did you feel when someone died?",
        "What illness shaped your teenage years?",
        "Who passed away when you were young?",
    ]
    clean = validate_prompts_for_tests(prompts)
    assert clean == ["What did your childhood home smell like on a Sunday?"]


def test_drops_prompts_about_regret_failure_or_mistakes() -> None:
    prompts = [
        "What was your favourite game outdoors?",
        "What do you regret about school?",
        "What was your biggest failure at work?",
        "What mistake would you undo?",
    ]
    clean = validate_prompts_for_tests(prompts)
    assert clean == ["What was your favourite game outdoors?"]


def test_drops_yes_no_closed_questions() -> None:
    assert is_yes_no_for_tests("Did you have a favourite teacher?") is True
    assert is_yes_no_for_tests("Were you happy at school?") is True
    assert is_yes_no_for_tests("What did your kitchen smell like?") is False

    prompts = [
        "Did you enjoy rainy afternoons?",
        "What did rainy afternoons look like at your house?",
    ]
    clean = validate_prompts_for_tests(prompts)
    assert clean == ["What did rainy afternoons look like at your house?"]


def test_drops_non_questions_and_overlong_prompts() -> None:
    long = "What " + ("memory " * 40) + "?"
    prompts = [
        "Tell me about your childhood home.",
        long,
        "What did your childhood home smell like on a Sunday?",
    ]
    clean = validate_prompts_for_tests(prompts)
    assert clean == ["What did your childhood home smell like on a Sunday?"]


def test_prompts_render_without_leftover_placeholders() -> None:
    for req in (_req(), _req(mode="journal", stage="Food & home", timeFrame="past")):
        prompt = build_prompt_for_tests(req)
        assert "{" not in prompt and "}" not in prompt


def test_drops_near_duplicate_prompts_after_normalisation() -> None:
    clean = validate_prompts_for_tests(
        [
            "What made you smile today?",
            "what made you smile, today?",
            "What colour caught your eye today?",
        ]
    )
    assert clean == [
        "What made you smile today?",
        "What colour caught your eye today?",
    ]


def test_journal_mode_rejects_prompts_over_120_chars() -> None:
    long = "What " + ("memory " * 20) + "still feels vivid?"
    assert len(long) > 120
    clean = validate_prompts_for_tests(
        [long, "What made you smile today?"],
        mode="journal",
    )
    assert clean == ["What made you smile today?"]


def test_life_story_prompt_names_the_stage_in_words_not_config_keys() -> None:
    """A model asked about "youngAdult" writes about a key, not about a life."""
    prompt = build_prompt_for_tests(_req(stage="youngAdult"))
    assert "young adulthood" in prompt
    assert "youngAdult" not in prompt


def test_life_story_prompt_keeps_a_custom_stage_in_the_authors_words() -> None:
    prompt = build_prompt_for_tests(_req(stage="Military years"))
    assert "Military years" in prompt


def test_life_story_prompt_carries_stage_anchors_so_prompts_cannot_drift() -> None:
    """Without an anchor a prompt reads the same under any stage — the bug this fixes."""
    prompt = build_prompt_for_tests(_req(stage="childhood"))
    assert '"when you were small"' in prompt
    assert "the world at a child's height" in prompt

    working = build_prompt_for_tests(_req(stage="work"))
    assert '"in your working years"' in working
    assert "when you were small" not in working


def test_life_story_prompt_anchors_a_custom_stage_in_its_own_words() -> None:
    prompt = build_prompt_for_tests(_req(stage="Military years"))
    assert '"during your Military years"' in prompt


def test_journal_binds_any_theme_verbatim() -> None:
    """Presets and custom themes take one path: the author's words, interpolated."""
    for theme in ("Food & home", "Gardening & outdoor days"):
        prompt = build_prompt_for_tests(_req(mode="journal", stage=theme))
        assert f'"{theme}"' in prompt
        assert "every prompt must clearly fit this theme" in prompt


def test_journal_without_a_theme_asks_for_a_spread() -> None:
    prompt = build_prompt_for_tests(_req(mode="journal", stage=""))
    assert "a bit of everything" in prompt


def test_journal_prompt_says_each_prompt_stands_alone_on_its_page() -> None:
    """A journal prompt is printed alone; one that leans on a neighbour breaks the page."""
    prompt = build_prompt_for_tests(_req(mode="journal", stage="Food & home"))
    assert "own page" in prompt
    assert "Stand completely on its own" in prompt


def test_journal_time_frames_do_not_bleed_into_each_other() -> None:
    """'Looking ahead' must not come back with prompts about the reader's childhood."""
    past = build_prompt_for_tests(
        _req(mode="journal", stage="Food & home", timeFrame="past")
    )
    assert "Never ask about today." in past

    future = build_prompt_for_tests(
        _req(mode="journal", stage="Food & home", timeFrame="future")
    )
    assert "the days ahead" in future
    assert "Never ask about today." not in future


def test_journal_defaults_to_a_mixed_time_frame() -> None:
    prompt = build_prompt_for_tests(_req(mode="journal", stage="Food & home"))
    assert "vary it across the set" in prompt


def test_journal_forbids_prompts_that_test_the_readers_memory() -> None:
    """The journal ships to readers with memory difficulty: no prompt may quiz them."""
    prompt = build_prompt_for_tests(_req(mode="journal", stage="Food & home"))
    assert "puts the reader's memory on trial" in prompt
    assert "how much they remember" in prompt
    assert "assumes the reader had siblings" in prompt


def test_parse_fenced_json() -> None:
    raw = """```json
{"prompts":["What did Sunday lunch taste like?","Who lived next door?"]}
```"""
    prompts = parse_prompts_json_for_tests(raw)
    assert prompts == [
        "What did Sunday lunch taste like?",
        "Who lived next door?",
    ]
