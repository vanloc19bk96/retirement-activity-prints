from __future__ import annotations

import asyncio
import copy
import json

import pytest

from app.schemas.studio_fill_in_funnies import FillInFunniesRequest, FillInFunniesStory
from app.services.studio_fill_in_funnies_service import (
    Budgets,
    FillInFunniesGenerationError,
    apply_check,
    avoid_label,
    blank_kinds,
    build_check_prompt,
    build_prompt_for_tests,
    budgets_for,
    filter_stories,
    generate_fill_in_funnies,
    label_repeats,
    normalize_item,
    parse_payload_for_tests,
    stories_repeat,
)
from app.services.studio_variety import reset_memory

SERVICE = "app.services.studio_fill_in_funnies_service"


def _blanks(*kinds: str) -> list[dict]:
    return [{"n": i + 1, "kind": kind} for i, kind in enumerate(kinds)]


GARAGE = {
    "brief": 1,
    "premise": "a retiree finally tidies the garage",
    "title": "The Great Garage Tidy-Up",
    "paragraphs": [
        "On the first free Tuesday of my retirement, I decided to tidy the garage. I put on my [1] overalls, made a flask of [2] and marched in like the world's bravest [3].",
        "Behind the lawnmower I found [4] boxes of [5], a very [6] lampshade and a note from [7] that simply said \"[8]!\"",
        "By lunchtime I had [9] past every shelf, sorted everything by colour and invented a brand-new hobby called [10].",
        "The garage has never looked so [11]. Next week I plan to tidy the shed, just as soon as I finish [12] in my hammock.",
    ],
    "blanks": _blanks(
        "adjective", "food", "job", "number", "plural_noun", "adjective",
        "friend_name", "exclamation", "verb_past", "hobby", "adjective", "verb_ing",
    ),
}

POSTCARD = {
    "brief": 2,
    "premise": "a postcard home from a dream holiday",
    "title": "Postcard From Paradise",
    "paragraphs": [
        "Greetings from [1]! The sun is shining, the sea is [2], and nobody here has ever heard of a Monday meeting.",
        "Each morning I eat [3] for breakfast, then join the other guests for a round of [4] by the pool. Yesterday I won a trophy shaped like a giant [5].",
        "The captain says I [6] more gracefully than anyone he has ever met. I think it is the [7] I bought for the trip.",
        "Please tell [8] that I will be home in [9] weeks, or whenever the [10] runs out. Wish you were here, and [11]!",
    ],
    "blanks": _blanks(
        "place", "adjective", "food", "hobby", "animal", "verb",
        "clothing", "coworker_name", "number", "noun", "exclamation",
    ),
}

COMMITTEE = {
    "brief": 3,
    "premise": "the first meeting of a very relaxed club",
    "title": "Minutes of the Hammock Committee",
    "paragraphs": [
        "The first meeting of the Hammock Committee began at [1] o'clock sharp, which is very early for us. Chairperson [2] opened by banging one enormous [3] on the table.",
        "First on the agenda was the snack table. Members agreed that [4] and [5] should be served at every meeting, preferably while [6].",
        "Next, [2] proposed a new rule: anyone who mentions work must [7] around the garden three times while shouting \"[8]!\" The motion passed [9].",
        "The meeting ended early so everyone could practise [10]. Our next meeting will be held in [11], weather and naps permitting.",
    ],
    "blanks": _blanks(
        "number", "friend_name", "household_item", "food", "plural_noun", "verb_ing",
        "verb", "sound", "adverb", "hobby", "place",
    ),
}

VALID = {"stories": [GARAGE, POSTCARD, COMMITTEE]}
BUDGETS = Budgets(min_blanks=8, max_blanks=12, max_words=140)


@pytest.fixture(autouse=True)
def _fresh_memory() -> None:
    reset_memory()


def _req(**overrides) -> FillInFunniesRequest:
    base = {"theme": "Travel Dreams", "count": 3, "seed": 7, "maxBlanks": 12, "maxWords": 140}
    base.update(overrides)
    return FillInFunniesRequest(**base)


def _story(raw: dict) -> FillInFunniesStory:
    item = normalize_item(raw, budgets=BUDGETS)
    assert item is not None
    return item


def _edit(raw: dict, **changes) -> dict:
    out = copy.deepcopy(raw)
    out.update(changes)
    return out


def _check_for(stories: list[FillInFunniesStory]) -> dict:
    """A checker reply that confirms every blank's own first class."""
    return {
        "stories": [
            {
                "index": i + 1,
                "blanks": [
                    {"n": n, "fits": [blank_kinds()[kind]["classes"][0]]}
                    for n, kind in enumerate(story.blanks, start=1)
                ],
                "complete": True,
                "funny": True,
                "suitable": True,
            }
            for i, story in enumerate(stories)
        ]
    }


# ---------------------------------------------------------------- gates


def test_valid_stories_normalize() -> None:
    for raw in (GARAGE, POSTCARD, COMMITTEE):
        item = _story(raw)
        assert item.title == raw["title"]
        assert item.blanks == [b["kind"] for b in raw["blanks"]]
        assert item.paragraphs == raw["paragraphs"]


def test_callbacks_are_allowed_after_first_use() -> None:
    item = _story(COMMITTEE)
    assert sum(p.count("[2]") for p in item.paragraphs) == 2


@pytest.mark.parametrize(
    "paragraph",
    [
        "I bought a [1] at the market. Then I went home and slept.",
        "Then I spotted an [1] in the garden. Then I went home and slept.",
    ],
)
def test_article_before_a_blank_is_refused(paragraph: str) -> None:
    raw = copy.deepcopy(GARAGE)
    raw["paragraphs"][0] = paragraph + " I put on my overalls, made a flask of [2] and marched in like the world's bravest [3]."
    assert normalize_item(raw, budgets=BUDGETS) is None


def test_article_before_a_place_is_refused() -> None:
    raw = copy.deepcopy(POSTCARD)
    raw["paragraphs"][0] = raw["paragraphs"][0].replace("Greetings from [1]", "Greetings from the [1]")
    assert normalize_item(raw, budgets=BUDGETS) is None


def test_out_of_order_and_unused_blanks_are_refused() -> None:
    raw = copy.deepcopy(GARAGE)
    raw["paragraphs"][0] = raw["paragraphs"][0].replace("[2]", "[3]", 1).replace("bravest [3]", "bravest [2]")
    assert normalize_item(raw, budgets=BUDGETS) is None

    extra = _edit(GARAGE, blanks=[*GARAGE["blanks"], {"n": 13, "kind": "noun"}])
    assert normalize_item(extra, budgets=Budgets(8, 14, 140)) is None


def test_placeholder_without_a_kind_is_refused() -> None:
    assert normalize_item(_edit(GARAGE, blanks=GARAGE["blanks"][:-1]), budgets=BUDGETS) is None


def test_malformed_placeholders_are_refused() -> None:
    for broken in ("[12 ]", "[twelve]", "super[12]", "[12][11]"):
        raw = copy.deepcopy(GARAGE)
        raw["paragraphs"][3] = raw["paragraphs"][3].replace("[12]", broken)
        assert normalize_item(raw, budgets=BUDGETS) is None, broken


def test_unknown_kind_and_bad_numbering_are_refused() -> None:
    blanks = copy.deepcopy(GARAGE["blanks"])
    blanks[0]["kind"] = "body_part"
    assert normalize_item(_edit(GARAGE, blanks=blanks), budgets=BUDGETS) is None
    blanks = copy.deepcopy(GARAGE["blanks"])
    blanks[0]["n"] = 5
    assert normalize_item(_edit(GARAGE, blanks=blanks), budgets=BUDGETS) is None


def test_kind_variety_is_enforced() -> None:
    nouns = _blanks(*(["noun"] * 12))
    assert normalize_item(_edit(GARAGE, blanks=nouns), budgets=BUDGETS) is None


def test_blank_budget_is_enforced() -> None:
    assert normalize_item(GARAGE, budgets=Budgets(8, 11, 140)) is None
    assert normalize_item(POSTCARD, budgets=Budgets(12, 12, 140)) is None


def test_length_limits_are_enforced() -> None:
    assert normalize_item(GARAGE, budgets=Budgets(8, 12, 70)) is None
    single = _edit(GARAGE, paragraphs=[" ".join(GARAGE["paragraphs"])])
    assert normalize_item(single, budgets=BUDGETS) is None


def test_sensitive_content_and_brands_are_refused() -> None:
    for word in ("hospital", "wine", "Starbucks", "lazy"):
        raw = copy.deepcopy(GARAGE)
        raw["paragraphs"][0] = raw["paragraphs"][0].replace("garage", word, 1)
        assert normalize_item(raw, budgets=BUDGETS) is None, word


def test_title_rules() -> None:
    assert normalize_item(_edit(GARAGE, title="The [1] Garage"), budgets=BUDGETS) is None
    assert normalize_item(_edit(GARAGE, title="THE GREAT GARAGE TIDY-UP"), budgets=BUDGETS) is None
    assert normalize_item(_edit(GARAGE, title='"The Great Garage Tidy-Up."'), budgets=BUDGETS)


def test_model_output_needs_a_premise() -> None:
    assert normalize_item(_edit(GARAGE, premise=""), budgets=BUDGETS) is None
    # Kept stories come back without the brief, and without the check.
    kept = {k: v for k, v in GARAGE.items() if k not in ("brief", "premise")}
    kept["blanks"] = [b["kind"] for b in GARAGE["blanks"]]
    assert normalize_item(kept, budgets=BUDGETS) is not None


# ---------------------------------------------------------------- repeats


def test_same_story_with_a_word_swapped_repeats() -> None:
    first = _story(GARAGE)
    swapped = copy.deepcopy(GARAGE)
    swapped["title"] = "The Big Shed Sort-Out"
    swapped["paragraphs"] = [p.replace("first free Tuesday", "second free Wednesday") for p in swapped["paragraphs"]]
    assert stories_repeat(first, _story(swapped))


def test_same_opening_repeats() -> None:
    first = _story(GARAGE)
    other = copy.deepcopy(POSTCARD)
    other["paragraphs"][0] = (
        "On the first free Tuesday of my retirement, I decided to visit [1]! "
        "The sea is [2], and nobody here has ever heard of a Monday meeting."
    )
    assert stories_repeat(first, _story(other))


def test_distinct_stories_do_not_repeat() -> None:
    stories = [_story(raw) for raw in (GARAGE, POSTCARD, COMMITTEE)]
    for i, a in enumerate(stories):
        for b in stories[i + 1 :]:
            assert not stories_repeat(a, b)


def test_labels_and_avoid() -> None:
    garage = _story(GARAGE)
    label = avoid_label(garage)
    assert len(label) <= 60
    assert label_repeats(garage, label)
    assert not label_repeats(_story(POSTCARD), label)
    kept = filter_stories(VALID["stories"], budgets=BUDGETS, cap=4, avoid=[label])
    assert [s.title for s in kept] == [POSTCARD["title"], COMMITTEE["title"]]


def test_filter_drops_repeats_of_kept() -> None:
    kept = [_story(GARAGE)]
    out = filter_stories([GARAGE, POSTCARD], budgets=BUDGETS, cap=4, kept=kept)
    assert [s.title for s in out] == [POSTCARD["title"]]
    assert filter_stories([POSTCARD], budgets=BUDGETS, cap=0) == []


# ---------------------------------------------------------------- checker


def test_check_prompt_never_names_the_kinds() -> None:
    stories = [_story(GARAGE)]
    prompt = build_check_prompt(stories)
    assert "[12]" in prompt
    assert "verb_ing" in prompt  # the class list is offered...
    assert '"kind"' not in prompt  # ...but no blank is labelled
    assert "Past-tense verb" not in prompt


def test_apply_check_confirms_matching_classes() -> None:
    stories = [_story(GARAGE), _story(POSTCARD)]
    kept = apply_check(stories, _check_for(stories))
    assert [s.title for s in kept] == [GARAGE["title"], POSTCARD["title"]]
    assert all(s.verified for s in kept)


def test_apply_check_rejects_a_mismatched_blank() -> None:
    stories = [_story(GARAGE)]
    reply = _check_for(stories)
    reply["stories"][0]["blanks"][11]["fits"] = ["noun"]  # verb_ing position read as noun only
    assert apply_check(stories, reply) == []


def test_apply_check_rejects_flags_and_missing_entries() -> None:
    stories = [_story(GARAGE), _story(POSTCARD)]
    reply = _check_for(stories)
    reply["stories"][0]["funny"] = False
    del reply["stories"][1]
    assert apply_check(stories, reply) == []


# ---------------------------------------------------------------- prompt


def test_prompt_has_one_brief_per_story_and_every_kind() -> None:
    prompt = build_prompt_for_tests(_req(mixedTopics=True, count=3))
    assert "1. situation:" in prompt and "3. situation:" in prompt
    assert "4. situation:" not in prompt
    for kind in blank_kinds():
        assert f'"{kind}"' in prompt
    assert "NEVER put \"a\" or \"an\"" in prompt


def test_prompt_uses_the_theme_when_not_mixed() -> None:
    prompt = build_prompt_for_tests(_req(mixedTopics=False, theme="Gardening"))
    assert "Gardening" in prompt


def test_briefs_vary_by_seed() -> None:
    a = build_prompt_for_tests(_req(), seed=1)
    b = build_prompt_for_tests(_req(), seed=2)
    assert a != b


def test_budgets_stay_inside_limits() -> None:
    budgets = budgets_for(_req(minBlanks=12, maxBlanks=10, maxWords=160))
    assert budgets.min_blanks <= budgets.max_blanks == 10
    assert budgets.max_words == 140


def test_parse_payload() -> None:
    assert len(parse_payload_for_tests(json.dumps(VALID))) == 3
    with pytest.raises(ValueError):
        parse_payload_for_tests(json.dumps({"stories": []}))


# ---------------------------------------------------------------- the run


def _patch(monkeypatch: pytest.MonkeyPatch, writer, checker=None) -> None:
    async def default_checker(prompt: str) -> str:
        # Map by title so the reply matches whatever the writer sent.
        titles = [line.split(": ", 1)[1] for line in prompt.splitlines() if line.startswith("Story ")]
        by_title = {s.title: s for s in (_story(r) for r in VALID["stories"])}
        stories = [by_title[t] for t in titles]
        return json.dumps(_check_for(stories))

    monkeypatch.setattr(f"{SERVICE}._call_writer", writer)
    monkeypatch.setattr(f"{SERVICE}._call_checker", checker or default_checker)
    monkeypatch.setattr(f"{SERVICE}._check_rate_limit", lambda _uid: None)


def test_generate_returns_verified_stories(monkeypatch: pytest.MonkeyPatch) -> None:
    async def writer(_prompt: str) -> str:
        return json.dumps(VALID)

    _patch(monkeypatch, writer)
    res = asyncio.run(generate_fill_in_funnies(_req(), user_id="u1"))
    assert [s.title for s in res.stories] == [s["title"] for s in VALID["stories"]]
    assert all(s.verified for s in res.stories)


def test_generate_retries_invalid_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    async def writer(_prompt: str) -> str:
        calls["n"] += 1
        return "not json" if calls["n"] == 1 else json.dumps({"stories": [POSTCARD]})

    _patch(monkeypatch, writer)
    res = asyncio.run(generate_fill_in_funnies(_req(), user_id="u1"))
    assert calls["n"] == 2
    assert [s.title for s in res.stories] == [POSTCARD["title"]]


def test_generate_returns_nothing_unchecked(monkeypatch: pytest.MonkeyPatch) -> None:
    async def writer(_prompt: str) -> str:
        return json.dumps(VALID)

    async def checker(_prompt: str) -> str:
        raise RuntimeError("checker down")

    _patch(monkeypatch, writer, checker)
    with pytest.raises(FillInFunniesGenerationError):
        asyncio.run(generate_fill_in_funnies(_req(), user_id="u1"))


def test_generate_remembers_what_it_wrote(monkeypatch: pytest.MonkeyPatch) -> None:
    async def writer(_prompt: str) -> str:
        return json.dumps({"stories": [GARAGE]})

    _patch(monkeypatch, writer)
    asyncio.run(generate_fill_in_funnies(_req(), user_id="u1"))
    # The same story again is now a repeat of this seller's memory.
    with pytest.raises(FillInFunniesGenerationError):
        asyncio.run(generate_fill_in_funnies(_req(), user_id="u1"))
