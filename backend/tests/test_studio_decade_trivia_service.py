from __future__ import annotations

import asyncio
import json

import pytest
from pydantic import ValidationError

from app.schemas.studio_decade_trivia import DecadeTriviaRequest, TriviaItem
from app.services.studio_decade_trivia_content import (
    answer_leaks_into_question,
    decade_year_range,
    evidence_year_outside_decade,
    is_hedged,
    is_printable_short_answer,
    is_unsuitable,
    mentions_year_outside_decade,
    repair_fill_blank,
)
from app.services.studio_decade_trivia_service import (
    DecadeTriviaGenerationError,
    apply_verdicts,
    generate_decade_trivia,
    balance_mixed_for_tests,
    build_prompt_for_tests,
    compose_page_for_tests,
    dedupe_for_tests,
    mixed_targets_for_tests,
    parse_trivia_json_for_tests,
    shuffle_mc_options_for_tests,
    validate_trivia_items_for_tests,
)
from app.services.studio_decade_trivia_topics import (
    is_off_topic_for_tests,
    missing_topics,
    normalize_topic,
    page_topic_order,
    preset_topic_ids,
    topic_allowed_for_tests,
    topic_quotas,
    topics_in_text,
)


def _req(**overrides: object) -> DecadeTriviaRequest:
    payload = {
        "decade": "1960s",
        "topics": ["music", "tv", "film"],
        "format": "multiple-choice",
        "difficulty": "standard",
        "questionCount": 5,
        "seed": 1,
    }
    payload.update(overrides)
    return DecadeTriviaRequest.model_validate(payload)


def _mc(**overrides: object) -> dict[str, object]:
    item = {
        "question": "Which dance craze swept the early part of the decade?",
        "options": ["The Twist", "The Charleston", "The Jitterbug", "The Foxtrot"],
        "answer": "The Twist",
        "topic": "music",
        "format": "multiple-choice",
        "confidence": 0.95,
    }
    item.update(overrides)
    return item


# ------------------------------------------------------------------- the request


def test_request_requires_at_least_one_topic() -> None:
    # An empty selection used to fall back to the defaults, which is how
    # questions from unticked topics reached the page.
    with pytest.raises(ValidationError):
        DecadeTriviaRequest.model_validate({"decade": "1960s", "topics": []})
    with pytest.raises(ValidationError):
        DecadeTriviaRequest.model_validate({"decade": "1960s", "topics": ["   "]})


def test_request_normalizes_decade_and_topic_whitespace() -> None:
    req = DecadeTriviaRequest.model_validate({"decade": "1960s", "topics": [" tv "]})
    assert req.decade == "1960s"
    assert req.topics == ["tv"]


# -------------------------------------------------------------- shape validation


def test_keeps_a_valid_multiple_choice_item() -> None:
    kept = validate_trivia_items_for_tests([_mc()], _req())
    assert len(kept) == 1
    assert kept[0].answer == "The Twist"
    assert kept[0].options is not None and len(kept[0].options) == 4


def test_drops_items_whose_answer_is_not_among_options() -> None:
    assert validate_trivia_items_for_tests([_mc(answer="The Mashed Potato")], _req()) == []


def test_drops_items_with_duplicate_options() -> None:
    item = _mc(options=["The Twist", "The Twist", "The Jitterbug", "The Foxtrot"])
    assert validate_trivia_items_for_tests([item], _req()) == []


def test_drops_items_below_confidence_threshold() -> None:
    assert validate_trivia_items_for_tests([_mc(confidence=0.4)], _req()) == []


def test_drops_hedged_answers() -> None:
    assert is_hedged("probably The Twist")
    assert validate_trivia_items_for_tests([_mc(answer="probably The Twist")], _req()) == []


def test_parse_fenced_json() -> None:
    raw = '```json\n{"items": [{"question": "q", "answer": "a"}]}\n```'
    assert parse_trivia_json_for_tests(raw) == [{"question": "q", "answer": "a"}]


# ------------------------------------------------------------------------- era


def test_decade_year_range_covers_the_whole_decade() -> None:
    assert decade_year_range("1960s") == (1960, 1969)
    assert decade_year_range("2010s") == (2010, 2019)


def test_drops_items_referencing_year_outside_decade() -> None:
    assert mentions_year_outside_decade("Released in 1972?", "1960s")
    assert not mentions_year_outside_decade("Released in 1964?", "1960s")
    item = _mc(question="Which dance craze swept 1972?")
    assert validate_trivia_items_for_tests([item], _req()) == []


def test_drops_items_the_model_itself_dates_outside_the_decade() -> None:
    # "the slinky craze of the 1960s" reads fine but is dated 1945; the model's
    # own evidence_year is what exposes it.
    assert evidence_year_outside_decade(1945, "1960s")
    assert not evidence_year_outside_decade(1963, "1960s")
    assert not evidence_year_outside_decade(None, "1960s")
    item = _mc(question="Which toy craze swept the decade?", evidence_year=1945)
    assert validate_trivia_items_for_tests([item], _req()) == []


# ------------------------------------------------------------------- editorial


def test_drops_unsuitable_subject_matter() -> None:
    assert is_unsuitable("Which singer died during the decade?", "Someone")
    assert validate_trivia_items_for_tests(
        [_mc(question="Which band member died during the decade?")], _req()
    ) == []


def test_drops_questions_that_would_reproduce_copyrighted_wording() -> None:
    assert is_unsuitable("Complete the lyrics to the hit song:", "answer")
    assert is_unsuitable("What was the advertising slogan of the era?", "answer")
    assert validate_trivia_items_for_tests(
        [_mc(question="What were the opening lines of the hit song?")], _req()
    ) == []


# ------------------------------------------------------------------ fill-blank


def test_repairs_a_blank_glued_to_part_of_its_own_answer() -> None:
    # "released in 19___" + "1961" printed as "in 191961".
    repaired = repair_fill_blank(
        "The animated classic 101 Dalmatians was released in 19___.", "1961"
    )
    assert repaired == "The animated classic 101 Dalmatians was released in ___."


def test_repairs_a_blank_glued_to_a_suffix() -> None:
    assert repair_fill_blank("The song topped the charts in ___61.", "1961") == (
        "The song topped the charts in ___."
    )


def test_collapses_extra_blanks_to_one() -> None:
    repaired = repair_fill_blank("The ___ replaced the ___ in most homes.", "washer")
    assert repaired is not None
    assert repaired.count("_") == 3


def test_rejects_a_fill_blank_whose_glue_is_not_part_of_the_answer() -> None:
    # Guessing what "the" was meant to be would invent content.
    assert repair_fill_blank("Families watched the___ every evening.", "news") is None


def test_rejects_a_fill_blank_with_no_blank_at_all() -> None:
    assert repair_fill_blank("Which drink came in a glass bottle?", "Cola") is None


def test_drops_a_question_that_contains_its_own_answer() -> None:
    assert answer_leaks_into_question("The Twist was the dance called ___?", "The Twist")
    item = {
        "question": "The Twist was the dance craze called ___.",
        "answer": "The Twist",
        "topic": "music",
        "format": "fill-blank",
        "confidence": 0.95,
    }
    assert validate_trivia_items_for_tests([item], _req(format="fill-blank")) == []


def test_drops_short_answers_outside_one_to_four_words() -> None:
    assert is_printable_short_answer("The Twist")
    assert is_printable_short_answer("Diana Ross")
    assert not is_printable_short_answer("The Andy Griffith Show Host")
    item = {
        "question": "Who hosted the variety hour every Sunday night?",
        "answer": "The famous Sunday night variety show host",
        "topic": "tv",
        "format": "short-answer",
        "confidence": 0.95,
    }
    assert validate_trivia_items_for_tests([item], _req(format="short-answer", topics=["tv"])) == []


def test_keeps_a_repaired_fill_blank_item() -> None:
    item = {
        "question": "The first commercial jet airliner service began in 19___.",
        "answer": "1960",
        "topic": "events",
        "format": "fill-blank",
        "confidence": 0.95,
        "evidence_year": 1960,
    }
    kept = validate_trivia_items_for_tests([item], _req(format="fill-blank", topics=["events"]))
    assert len(kept) == 1
    assert "19___" not in kept[0].question
    assert kept[0].options is None


# ---------------------------------------------------------------------- topics


def test_every_preset_topic_has_content_cues() -> None:
    # A preset without cues is a hole in the content gate, not a harmless gap.
    covered = set()
    samples = {
        "music": "Which singing group had a hit song?",
        "tv": "Which television sitcom aired then?",
        "film": "Which movie won an Oscar?",
        "products": "Which brand of vacuum cleaner sold best?",
        "food": "Which breakfast cereal was new?",
        "toys": "Which board game was popular on the playground?",
        "everyday": "What did the milkman deliver on wash day?",
        "events": "Which moon landing came first?",
    }
    for topic_id, text in samples.items():
        assert topic_id in topics_in_text(text, ""), topic_id
        covered.add(topic_id)
    assert covered == set(preset_topic_ids())


def test_normalizes_topic_aliases_to_preset_ids() -> None:
    assert normalize_topic("Everyday Life") == "everyday"
    assert normalize_topic("movies") == "film"
    assert normalize_topic("Television") == "tv"
    assert normalize_topic("sports") == "events"


def test_drops_items_tagged_outside_selected_topics() -> None:
    assert not topic_allowed_for_tests("food", ["music", "tv"])
    assert topic_allowed_for_tests("music", ["music", "tv"])
    item = _mc(topic="food")
    assert validate_trivia_items_for_tests([item], _req(topics=["music", "tv"])) == []


def test_drops_content_from_an_unticked_topic_even_when_mis_tagged() -> None:
    # The whole point of the tick boxes: untick food, get no food question.
    assert is_off_topic_for_tests(
        "Which breakfast cereal came with a free toy in the box?", "Corn flakes", ["music"]
    )
    item = _mc(
        question="Which breakfast cereal was served at every diner?",
        answer="Corn flakes",
        topic="music",
        options=["Corn flakes", "Toast", "Porridge", "Pancakes"],
    )
    assert validate_trivia_items_for_tests([item], _req(topics=["music"])) == []


def test_keeps_content_that_also_matches_a_ticked_topic() -> None:
    # Music and film overlap constantly; dropping every overlap empties pages.
    assert not is_off_topic_for_tests(
        "Which singing group recorded the song used in the movie?", "A group", ["music"]
    )


def test_off_topic_cues_ignore_allowed_topics() -> None:
    for topic_id in ("tv", "film", "music", "food", "toys"):
        assert not is_off_topic_for_tests(
            "Which television sitcom, movie, hit song, breakfast cereal or board game?",
            "answer",
            list(preset_topic_ids()),
        ), topic_id


def test_prompt_names_the_forbidden_topics_and_the_editorial_rules() -> None:
    prompt = build_prompt_for_tests(_req(topics=["music"]), 5)
    assert "FORBIDDEN" in prompt
    assert "food" in prompt
    assert "song lyrics" in prompt
    assert "evidence_year" in prompt


# ------------------------------------------------------------- topic coverage


def test_every_ticked_topic_gets_a_quota() -> None:
    # The bug: five topics ticked, eight questions, and "products" never
    # appeared. "Spread them evenly" was advice the model was free to ignore.
    quotas = topic_quotas(["music", "tv", "film", "products", "events"], 8)
    assert sum(quotas.values()) == 8
    assert all(n >= 1 for n in quotas.values())


def test_topic_quotas_rotate_so_pages_of_a_book_differ() -> None:
    topics = ["music", "tv", "film", "products", "events"]
    # More topics than seats: the surplus cannot fit, so the seats must move
    # from page to page instead of always going to the first topics ticked.
    first = page_topic_order(topics, 3, seed=0)
    later = page_topic_order(topics, 3, seed=3)
    assert len(first) == len(later) == 3
    assert first != later


def test_page_topic_order_is_empty_for_a_free_text_topic() -> None:
    # One custom subject: nothing to spread, and the checker cannot classify
    # against a closed list.
    assert page_topic_order(["school days and playground games"], 5) == []


def test_prompt_states_an_exact_count_and_guidance_for_each_topic() -> None:
    prompt = build_prompt_for_tests(_req(topics=["music", "products"]), 6)
    assert "Write EXACTLY 3 questions on this topic." in prompt
    # Per-topic guidance is what keeps a hard topic on the page at all.
    assert "which company made a product" in prompt
    # ...and keeps it off a KDP takedown list.
    assert "never build a question out of a slogan" in prompt


def test_top_up_prompt_asks_only_for_the_topics_still_missing() -> None:
    # A generic re-ask returns more of whatever the model finds easy, which is
    # the half of the page that is already full.
    prompt = build_prompt_for_tests(
        _req(topics=["music", "tv", "film", "products", "events"]), 3, ["products"]
    )
    assert "top-up round" in prompt
    assert "Products & brands" in prompt
    assert "Set \"topic\" to exactly one of these ids: products" in prompt
    for filled in ("music", "tv", "film", "events"):
        assert filled in prompt.split("FORBIDDEN")[1]


def test_compose_page_seats_a_topic_stranded_at_the_end_of_the_pool() -> None:
    # The printed page that started this: the pool held one products question,
    # it sat behind a run of film and tv items, and the page was filled by
    # walking the pool in order — so it was truncated away.
    pool = [
        TriviaItem(question=f"q{i}", answer=f"a{i}", topic="film", format="short-answer")
        for i in range(7)
    ]
    pool.append(
        TriviaItem(question="q7", answer="a7", topic="products", format="short-answer")
    )
    page = compose_page_for_tests(pool, 4, ["music", "tv", "film", "products", "events"])
    assert "products" in {i.topic for i in page}
    assert len(page) == 4


def test_compose_page_covers_every_ticked_topic_before_doubling_up() -> None:
    pool = [
        TriviaItem(question="m1", answer="a1", topic="music", format="short-answer"),
        TriviaItem(question="m2", answer="a2", topic="music", format="short-answer"),
        TriviaItem(question="t1", answer="a3", topic="tv", format="short-answer"),
        TriviaItem(question="f1", answer="a4", topic="film", format="short-answer"),
        TriviaItem(question="p1", answer="a5", topic="products", format="short-answer"),
        TriviaItem(question="e1", answer="a6", topic="events", format="short-answer"),
    ]
    order = ["music", "tv", "film", "products", "events"]
    page = compose_page_for_tests(pool, 5, order)
    assert {i.topic for i in page} == set(order)


def test_compose_page_puts_topic_coverage_above_the_format_mix() -> None:
    # A missing topic breaks a promise to the author; an uneven mix of question
    # styles is a cosmetic flaw. When only one products item exists and it is a
    # format the mix has already filled, it still gets the seat.
    pool = [
        TriviaItem(
            question=f"m{i}",
            options=["a", "b", "c", "d"],
            answer="a",
            topic="music",
            format="multiple-choice",
        )
        for i in range(4)
    ]
    pool.append(
        TriviaItem(
            question="p1",
            options=["w", "x", "y", "z"],
            answer="w",
            topic="products",
            format="multiple-choice",
        )
    )
    page = compose_page_for_tests(
        pool,
        4,
        ["music", "products"],
        {"multiple-choice": 2, "short-answer": 1, "fill-blank": 1},
    )
    assert "products" in {i.topic for i in page}


def test_compose_page_keeps_original_order() -> None:
    pool = [
        TriviaItem(question=f"q{i}", answer=f"a{i}", topic=topic, format="short-answer")
        for i, topic in enumerate(["film", "film", "film", "products", "music"])
    ]
    page = compose_page_for_tests(pool, 3, ["music", "products", "film"])
    questions = [i.question for i in page]
    assert questions == sorted(questions, key=lambda q: int(q[1:]))


def test_missing_topics_reports_in_the_requested_order() -> None:
    assert missing_topics({"music", "film"}, ["music", "tv", "film", "products"]) == [
        "tv",
        "products",
    ]


def test_products_question_phrased_as_a_maker_question_is_not_read_as_food() -> None:
    # "Which company made the popular cereal?" matched only the food cue, so
    # the content gate read a products question as an unticked topic and
    # dropped it — one of the ways products vanished from a page.
    assert not is_off_topic_for_tests(
        "Which company made the popular breakfast cereal sold in that decade?",
        "A cereal maker",
        ["music", "tv", "film", "products", "events"],
    )


# ----------------------------------------------------------------- verification


def _item(question: str, answer: str = "answer") -> TriviaItem:
    return TriviaItem(
        question=question, answer=answer, topic="music", format="short-answer"
    )


def test_verification_keeps_only_confirmed_items() -> None:
    items = [_item("q1", "a1"), _item("q2", "a2"), _item("q3", "a3")]
    results = [
        {"index": 1, "verdict": "correct", "decade_ok": True},
        {"index": 2, "verdict": "wrong", "decade_ok": True},
        {"index": 3, "verdict": "unsure", "decade_ok": True},
    ]
    assert [i.question for i in apply_verdicts(items, results)] == ["q1"]


def test_verification_drops_items_it_classifies_outside_the_ticked_topics() -> None:
    # The escape that got through: "Which colorful, swirling pattern became a
    # popular fashion trend?" is everyday life, was labelled products by the
    # writer, and matched no cue in the table at the time.
    items = [_item("Which swirling pattern became a popular fashion trend?", "Tie-dye")]
    results = [
        {"index": 1, "verdict": "correct", "decade_ok": True, "topic": "everyday"}
    ]
    allowed = ["music", "products", "food", "events"]
    assert apply_verdicts(items, results, allowed) == []
    assert len(apply_verdicts(items, results, ["everyday", "music"])) == 1


def test_verification_drops_items_it_cannot_place_in_any_ticked_topic() -> None:
    items = [_item("q1", "a1")]
    results = [{"index": 1, "verdict": "correct", "decade_ok": True, "topic": "other"}]
    assert apply_verdicts(items, results, ["music"]) == []


def test_verification_relabels_items_with_the_checkers_topic() -> None:
    # The checker read the question; the writer only claimed a label.
    items = [_item("q1", "a1")]
    results = [{"index": 1, "verdict": "correct", "decade_ok": True, "topic": "movies"}]
    kept = apply_verdicts(items, results, ["film"])
    assert [i.topic for i in kept] == ["film"]


def test_content_gate_now_catches_fashion_wording() -> None:
    assert "everyday" in topics_in_text(
        "Which swirling pattern became a popular fashion trend?", "Tie-dye"
    )
    assert is_off_topic_for_tests(
        "Which swirling pattern became a popular fashion trend?",
        "Tie-dye",
        ["music", "products", "food", "events"],
    )


def test_verification_drops_items_dated_to_another_decade() -> None:
    items = [_item("q1", "a1")]
    results = [
        {"index": 1, "verdict": "correct", "decade_ok": False, "actual_year": 1945}
    ]
    assert apply_verdicts(items, results) == []


def test_verification_requires_decade_ok_true() -> None:
    items = [_item("q1", "a1")]
    results = [{"index": 1, "verdict": "correct"}]
    assert apply_verdicts(items, results) == []


def test_verification_drops_items_the_checker_skipped() -> None:
    items = [_item("q1", "a1"), _item("q2", "a2")]
    results = [{"index": 1, "verdict": "correct", "decade_ok": True}]
    assert [i.question for i in apply_verdicts(items, results)] == ["q1"]


def test_verification_ignores_malformed_results() -> None:
    items = [_item("q1", "a1")]
    results = [{"index": "not a number"}, "junk", {"verdict": "correct"}]
    assert apply_verdicts(items, results) == []  # type: ignore[arg-type]


# ------------------------------------------------------------------ composition


def test_dedupes_repeated_questions_and_answers() -> None:
    items = [
        _item("Which group sang it?", "The Supremes"),
        _item("which group sang it?", "Another group"),
        _item("Who else sang it?", "the supremes"),
        _item("Who played the lead?", "Someone new"),
    ]
    assert [i.answer for i in dedupe_for_tests(items)] == ["The Supremes", "Someone new"]


def test_mixed_targets_split_evenly_across_formats() -> None:
    assert mixed_targets_for_tests(6) == {
        "multiple-choice": 2,
        "short-answer": 2,
        "fill-blank": 2,
    }
    assert mixed_targets_for_tests(5) == {
        "multiple-choice": 2,
        "short-answer": 2,
        "fill-blank": 1,
    }
    assert sum(mixed_targets_for_tests(4).values()) == 4


def test_balance_mixed_keeps_original_order_and_page_size() -> None:
    items = [
        TriviaItem(
            question=f"q{i}",
            options=["a", "b", "c", "d"],
            answer="a",
            topic="music",
            format="multiple-choice",
        )
        for i in range(6)
    ]
    items[1] = TriviaItem(
        question="q1", answer="a", topic="music", format="short-answer"
    )
    items[2] = TriviaItem(question="q2", answer="a", topic="music", format="fill-blank")
    balanced = balance_mixed_for_tests(items, 5)
    assert len(balanced) == 5
    assert [i.question for i in balanced] == sorted(
        [i.question for i in balanced], key=lambda q: int(q[1:])
    )


def test_balance_mixed_converts_surplus_mc_into_short_answer() -> None:
    items = [
        TriviaItem(
            question=f"q{i}",
            options=["a", "b", "c", "d"],
            answer="a",
            topic="music",
            format="multiple-choice",
        )
        for i in range(6)
    ]
    balanced = balance_mixed_for_tests(items, 6)
    formats = {i.format for i in balanced}
    assert "short-answer" in formats
    # Never invented: a fill-blank needs a blank the model never wrote.
    assert all(i.format != "fill-blank" or "_" in i.question for i in balanced)


def test_shuffle_mc_options_spreads_the_correct_letter() -> None:
    items = [
        TriviaItem(
            question=f"q{i}",
            options=["right", "w1", "w2", "w3"],
            answer="right",
            topic="music",
            format="multiple-choice",
        )
        for i in range(8)
    ]
    shuffled = shuffle_mc_options_for_tests(items, 7)
    positions = {i.options.index("right") for i in shuffled if i.options}
    assert len(positions) > 1


def test_shuffle_mc_options_is_deterministic() -> None:
    items = [
        TriviaItem(
            question="q",
            options=["a", "b", "c", "d"],
            answer="a",
            topic="music",
            format="multiple-choice",
        )
    ]
    first = shuffle_mc_options_for_tests(items, 3)[0].options
    second = shuffle_mc_options_for_tests(items, 3)[0].options
    assert first == second


def test_shuffle_mc_options_skips_write_in_items() -> None:
    items = [_item("q", "a")]
    assert shuffle_mc_options_for_tests(items, 3)[0].options is None


# ----------------------------------------------------- the round loop, end to end


def _draft(topic: str, n: int) -> dict[str, object]:
    """One clean multiple-choice draft that passes every deterministic filter."""
    return {
        "question": f"Which {topic} item number {n} was well known then?",
        "options": [f"{topic} {n} right", f"{topic} {n} w1", f"{topic} {n} w2", f"{topic} {n} w3"],
        "answer": f"{topic} {n} right",
        "topic": topic,
        "format": "multiple-choice",
        "confidence": 0.95,
    }


def _run_generation(
    monkeypatch: pytest.MonkeyPatch, rounds: list[list[dict[str, object]]], **req_kw: object
):
    """Drive the real pipeline with a scripted model, one reply per round."""
    prompts: list[str] = []
    replies = list(rounds)

    async def fake_gemini(prompt: str) -> str:
        prompts.append(prompt)
        items = replies.pop(0) if replies else []
        return json.dumps({"items": items})

    async def fake_verify(_prompt: str) -> str:
        # Confirm everything: this test is about topic coverage, not accuracy.
        results = [
            {"index": i, "verdict": "correct", "decade_ok": True, "topic": topic}
            for i, topic in enumerate(_verify_topics.pop(0), start=1)
        ]
        return json.dumps({"results": results})

    monkeypatch.setattr(
        "app.services.studio_decade_trivia_service._call_gemini", fake_gemini
    )
    monkeypatch.setattr(
        "app.services.studio_decade_trivia_service._call_gemini_verify", fake_verify
    )
    monkeypatch.setattr(
        "app.services.studio_decade_trivia_service._check_rate_limit", lambda _uid: None
    )

    _verify_topics = [[str(item["topic"]) for item in batch] for batch in rounds]
    return asyncio.run(generate_decade_trivia(_req(**req_kw), user_id="user-1")), prompts


def test_a_ticked_topic_the_first_round_missed_is_chased_and_printed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The reported page: five topics ticked, eight questions, no products.

    Round one comes back heavy on the easy topics and with nothing for
    products, exactly as the printed page did. The page must not ship that way.
    """
    topics = ["music", "tv", "film", "products", "events"]
    first = (
        [_draft("music", i) for i in range(3)]
        + [_draft("tv", i) for i in range(3)]
        + [_draft("film", i) for i in range(3)]
        + [_draft("events", i) for i in range(3)]
    )
    second = [_draft("products", i) for i in range(2)]

    page, prompts = _run_generation(
        monkeypatch, [first, second], topics=topics, questionCount=8
    )

    assert len(page.items) == 8
    assert {item.topic for item in page.items} == set(topics)
    # The second call asked for what was missing, not more of what was easy.
    assert len(prompts) == 2
    assert "top-up round" in prompts[1]
    assert 'Set "topic" to exactly one of these ids: products' in prompts[1]


def test_a_covered_page_does_not_spend_a_second_round(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    topics = ["music", "tv", "film", "products", "events"]
    full = [_draft(topic, i) for i in range(2) for topic in topics]

    page, prompts = _run_generation(monkeypatch, [full], topics=topics, questionCount=8)

    assert len(prompts) == 1
    assert {item.topic for item in page.items} == set(topics)


def test_a_page_ships_short_rather_than_dropping_a_ticked_topic(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Products never arrives. The page still prints — a short page beats a
    wrong one — but it never silently swaps in a sixth film question for the
    seat products was promised, and it stops after `maxRounds` tries."""
    topics = ["music", "tv", "film", "products", "events"]
    easy = [_draft(topic, i) for i in range(3) for topic in ("music", "tv", "film", "events")]

    page, prompts = _run_generation(
        monkeypatch, [easy, [], []], topics=topics, questionCount=8
    )

    assert len(prompts) == 3  # maxRounds, then it gives up rather than looping
    assert len(page.items) == 8
    assert "products" not in {item.topic for item in page.items}


def test_mixed_format_page_still_covers_every_ticked_topic(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Coverage and the format split are both constraints; coverage wins.
    topics = ["music", "products"]
    batch = [_draft("music", i) for i in range(6)] + [_draft("products", 0)]

    page, _ = _run_generation(
        monkeypatch, [batch], topics=topics, questionCount=6, format="mixed"
    )

    assert {item.topic for item in page.items} == {"music", "products"}


def test_failed_verification_does_not_ship_unverified_items(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_gemini(_prompt: str) -> str:
        return json.dumps({"items": [_draft("music", 0) for _ in range(6)]})

    async def fake_verify(_prompt: str) -> str:
        raise RuntimeError("checker down")

    monkeypatch.setattr(
        "app.services.studio_decade_trivia_service._call_gemini", fake_gemini
    )
    monkeypatch.setattr(
        "app.services.studio_decade_trivia_service._call_gemini_verify", fake_verify
    )
    monkeypatch.setattr(
        "app.services.studio_decade_trivia_service._check_rate_limit", lambda _uid: None
    )

    with pytest.raises(DecadeTriviaGenerationError, match="fact-checking"):
        asyncio.run(generate_decade_trivia(_req(topics=["music"]), user_id="user-1"))
