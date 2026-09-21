"""Generate Decade Trivia questions via Gemini, then prove them before printing.

The pipeline is deliberately lossy. These pages are sold, so a short page is a
far better outcome than a wrong one, and every stage is allowed to drop items:

1. **Write** — one over-requested batch from the model.
2. **Validate** — deterministic shape, era, topic and editorial rules
   (:mod:`studio_decade_trivia_content`, :mod:`studio_decade_trivia_topics`).
3. **Verify** — a second, independent model pass that re-derives each answer
   and marks it correct / wrong / unsure. Only "correct" survives.
4. **Top up** — further rounds when the survivors do not fill the page, or when
   a ticked topic has nothing to show for it. A top-up round asks only for the
   missing topics: every stage above is topic-blind about *why* it drops an
   item, so a hard topic (products, typically) can lose its whole allocation
   while the easy ones over-deliver.
5. **Compose** — topic coverage first, then the even format mix, then a seeded
   option shuffle. Coverage outranks the format mix: a ticked topic missing from
   the page breaks a promise to the author, while an uneven mix of question
   styles is only a cosmetic flaw.
"""

from __future__ import annotations

import logging
import random
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_decade_trivia import (
    DecadeTriviaModelOutput,
    DecadeTriviaRequest,
    DecadeTriviaResponse,
    DecadeTriviaVerificationOutput,
    TriviaItem,
    TriviaItemFormat,
)
from app.services.studio_decade_trivia_content import (
    answer_leaks_into_question,
    evidence_year_outside_decade,
    is_hedged,
    is_unsuitable,
    mentions_year_outside_decade,
    repair_fill_blank,
    safety_prompt_rules,
)
from app.services.studio_decade_trivia_topics import (
    allowed_topic_ids,
    content_drifts_off_topic,
    format_topic_rules_for_prompt,
    missing_topics,
    normalize_topic,
    page_topic_order,
    topic_is_allowed,
    uses_preset_topics,
)
from app.services.studio_gemini import (
    RateLimiter,
    StudioGenerationError,
    StudioRateLimitError,
    call_gemini_json,
    parse_json_object,
)
from app.services.prompt_data import (
    float_value,
    int_value,
    load_config,
    load_template,
    locale_line,
    section,
)
from app.services.studio_variety import (
    VarietyScope,
    bucket_key,
    remember,
    with_variety,
)

logger = logging.getLogger(__name__)

GAME = "decade-trivia"

_MIXED_FORMAT_ORDER: tuple[TriviaItemFormat, ...] = (
    "multiple-choice",
    "short-answer",
    "fill-blank",
)


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


def min_confidence() -> float:
    return float_value(_limits(), "minConfidence")


def verification_enabled() -> bool:
    return int_value(_limits(), "verifyEnabled") == 1


def max_rounds() -> int:
    """Generation rounds before the page ships with whatever it has.

    Each round is a write call plus a verify call, so this is the ceiling on
    what one page can cost when a ticked topic keeps failing the filters.
    """
    return max(1, int_value(_limits(), "maxRounds"))


# Accuracy filters are strict, so ask for spares rather than a second round trip.
_rate_limiter = RateLimiter(
    label="trivia",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class DecadeTriviaRateLimitError(StudioRateLimitError):
    """User exceeded the short-window trivia generation quota."""


class DecadeTriviaGenerationError(StudioGenerationError):
    """Model output could not be turned into a valid trivia page."""


@lru_cache(maxsize=1)
def _system_instruction() -> str:
    """Decade Trivia overrides the shared house rules on one point.

    The shared instruction bans brand names outright, which directly
    contradicts the "Products & brands" topic and makes the model refuse or
    hedge whenever it is ticked. This version allows brand *names* as plain
    facts while keeping the ban on the copyrighted *wording* around them —
    slogans, jingles and lyrics — which is the part that actually risks a KDP
    takedown.
    """
    return load_template(GAME, "system-instruction")


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise DecadeTriviaRateLimitError(str(exc)) from exc


# ------------------------------------------------------------------ validation


def _item_format(req: DecadeTriviaRequest, raw: dict[str, Any]) -> TriviaItemFormat:
    if req.format == "mixed":
        candidate = str(raw.get("format", "multiple-choice")).strip()
        if candidate in _MIXED_FORMAT_ORDER:
            return candidate  # type: ignore[return-value]
        return "multiple-choice"
    if req.format in _MIXED_FORMAT_ORDER:
        return req.format  # type: ignore[return-value]
    return "multiple-choice"


def _validate_one(raw: dict[str, Any], req: DecadeTriviaRequest) -> TriviaItem | None:
    question = str(raw.get("question", "")).strip()
    answer = str(raw.get("answer", "")).strip()
    if not question or not answer:
        return None

    try:
        confidence = float(raw.get("confidence", 0) or 0)
    except (TypeError, ValueError):
        return None
    if confidence < min_confidence():
        return None

    if is_hedged(answer) or is_unsuitable(question, answer):
        return None
    if mentions_year_outside_decade(question, req.decade):
        return None

    evidence_year = raw.get("evidence_year")
    if isinstance(evidence_year, int) and evidence_year_outside_decade(
        evidence_year, req.decade
    ):
        return None

    topic = normalize_topic(str(raw.get("topic", "")).strip())
    if not topic_is_allowed(topic, req.topics):
        return None
    if content_drifts_off_topic(question, answer, req.topics):
        return None

    item_format = _item_format(req, raw)
    options = [str(o).strip() for o in (raw.get("options") or []) if str(o).strip()]

    if item_format == "multiple-choice":
        if len(options) != 4 or len({o.casefold() for o in options}) != 4:
            return None
        if not any(o.casefold() == answer.casefold() for o in options):
            return None
    else:
        # Options on a write-in item are noise; the page never renders them.
        options = []
        if item_format == "fill-blank":
            repaired = repair_fill_blank(question, answer)
            if repaired is None:
                return None
            question = repaired
        if answer_leaks_into_question(question, answer):
            return None

    return TriviaItem(
        question=question,
        options=options or None,
        answer=answer,
        topic=topic or "general",
        format=item_format,
    )


def _validate(items: list[dict[str, Any]], req: DecadeTriviaRequest) -> list[TriviaItem]:
    clean: list[TriviaItem] = []
    for raw in items:
        if not isinstance(raw, dict):
            continue
        item = _validate_one(raw, req)
        if item is not None:
            clean.append(item)
    return clean


def _parse_trivia_json(raw: str) -> list[dict[str, Any]]:
    items = parse_json_object(raw).get("items")
    if not isinstance(items, list):
        raise ValueError("missing items")
    return [it for it in items if isinstance(it, dict)]


# ------------------------------------------------------------------ composition


def _mixed_targets(count: int) -> dict[TriviaItemFormat, int]:
    """Even format split for a mixed page across MC / short-answer / fill-blank.
    Remainder seats rotate so no single style monopolizes extras. For 3+
    questions this always yields at least one of each."""
    base = count // 3
    rem = count % 3
    targets: dict[TriviaItemFormat, int] = {
        "multiple-choice": base,
        "short-answer": base,
        "fill-blank": base,
    }
    for i in range(rem):
        targets[_MIXED_FORMAT_ORDER[i]] += 1
    return targets


def _reformat_item(item: TriviaItem, fmt: TriviaItemFormat) -> TriviaItem:
    """Reuse a surplus item as a missing write-in format (question + answer stay).

    Only short-answer is a safe target: turning an arbitrary question into a
    fill-blank sentence would mean inventing where the blank goes, and a badly
    placed blank is exactly the defect this rewrite set out to remove.
    """
    if fmt != "short-answer":
        return item
    return TriviaItem(
        question=item.question,
        options=None,
        answer=item.answer,
        topic=item.topic,
        format=fmt,
    )


def _compose_page(
    items: list[TriviaItem],
    count: int,
    topic_order: list[str],
    format_targets: dict[TriviaItemFormat, int] | None,
) -> list[TriviaItem]:
    """Pick the `count` items that print, keeping the model's original order.

    Two constraints, ranked. Topic coverage comes first: every topic in
    `topic_order` that the pool can supply gets a seat, because a ticked topic
    absent from the page is the author's promise broken. The format split is
    honoured with whatever seats are left — the page used to be filled by
    walking the pool in order, so a lone products question sitting at index 7 of
    a 12-item pool was simply truncated away.

    `format_targets` is None for a single-format page, where every item already
    has the same format and only coverage matters.
    """
    if not items or count <= 0:
        return []

    picked: dict[int, TriviaItem] = {}
    taken: dict[str, int] = {}

    def has_headroom(fmt: str) -> bool:
        if format_targets is None:
            return True
        return taken.get(fmt, 0) < format_targets.get(fmt, 0)

    def take(index: int, item: TriviaItem) -> None:
        picked[index] = item
        taken[item.format] = taken.get(item.format, 0) + 1

    # 1. One seat per required topic, in the order the quotas were asked for.
    for topic in topic_order:
        if len(picked) >= count:
            break
        candidates = [
            i for i, item in enumerate(items) if i not in picked and item.topic == topic
        ]
        if not candidates:
            continue
        # Prefer a candidate that also fits the format split; fall back to the
        # first one, because coverage matters more than the mix.
        index = next(
            (i for i in candidates if has_headroom(items[i].format)), candidates[0]
        )
        take(index, items[index])

    # 2. Fill the rest in order, honouring the format split.
    for i, item in enumerate(items):
        if len(picked) >= count:
            break
        if i in picked or not has_headroom(item.format):
            continue
        take(i, item)

    # 3. Reuse a surplus multiple-choice item as a short-answer when the mix
    #    still owes short-answer seats — the only safe reformat, see
    #    `_reformat_item`.
    if format_targets is not None:
        while len(picked) < count and taken.get("short-answer", 0) < format_targets.get(
            "short-answer", 0
        ):
            index = next(
                (
                    i
                    for i, item in enumerate(items)
                    if i not in picked and item.format == "multiple-choice"
                ),
                None,
            )
            if index is None:
                break
            take(index, _reformat_item(items[index], "short-answer"))

    # 4. Whatever is left, until the page is full.
    for i, item in enumerate(items):
        if len(picked) >= count:
            break
        if i not in picked:
            take(i, item)

    return [picked[i] for i in sorted(picked)[:count]]


def _format_targets(
    req: DecadeTriviaRequest, count: int
) -> dict[TriviaItemFormat, int] | None:
    """The per-format split, or None when the page is a single format."""
    return _mixed_targets(count) if req.format == "mixed" else None


def _balance_mixed(items: list[TriviaItem], count: int) -> list[TriviaItem]:
    """Format split only — kept for the tests that cover the mix in isolation."""
    return _compose_page(items, count, [], _mixed_targets(count))


def _shuffle_mc_options(items: list[TriviaItem], seed: int) -> list[TriviaItem]:
    """Re-order MC options so the correct letter is not stuck on A.

    Models almost always emit the answer as options[0]. The sheet labels
    options A–D in array order, so without a seeded shuffle every key reads
    as "A". Each question gets its own RNG stream from the page seed.
    """
    out: list[TriviaItem] = []
    for i, item in enumerate(items):
        if item.format != "multiple-choice" or not item.options:
            out.append(item)
            continue
        opts = list(item.options)
        if len(opts) < 2:
            out.append(item)
            continue
        random.Random(seed + i * 97).shuffle(opts)
        out.append(
            TriviaItem(
                question=item.question,
                options=opts,
                answer=item.answer,
                topic=item.topic,
                format=item.format,
            )
        )
    return out


def _dedupe(items: list[TriviaItem]) -> list[TriviaItem]:
    """Drop repeats of a question or of an answer — a page that asks the same
    thing twice, or answers two questions the same way, reads as a mistake."""
    seen_questions: set[str] = set()
    seen_answers: set[str] = set()
    out: list[TriviaItem] = []
    for item in items:
        question = item.question.casefold()
        answer = item.answer.casefold()
        if question in seen_questions or answer in seen_answers:
            continue
        seen_questions.add(question)
        seen_answers.add(answer)
        out.append(item)
    return out


# --------------------------------------------------------------------- prompts


def _build_prompt(
    req: DecadeTriviaRequest, needed: int, focus_topics: list[str] | None = None
) -> str:
    config = _config()
    # `needed` is the over-requested count, so the quotas cover the spares too:
    # asking for one products question and getting one that fails verification
    # is how the topic went missing in the first place.
    topic_rules = format_topic_rules_for_prompt(
        req.topics, needed, req.seed, focus_topics
    )
    level = section(config, "difficultyLevels")[req.difficulty]
    language_line = locale_line(section(config, "locale"), req.locale)
    rules = section(config, "formatRules")
    start, end = req.decade[:4], int(req.decade[:4]) + 9

    if req.format == "mixed":
        targets = _mixed_targets(needed)
        format_rules = str(rules["mixed"]).format(
            multiple_choice=targets["multiple-choice"],
            short_answer=targets["short-answer"],
            fill_blank=targets["fill-blank"],
        )
    else:
        format_rules = str(rules.get(req.format, rules["multiple-choice"]))

    return f"""Write {needed} nostalgia trivia questions about the {req.decade}
for a large-print activity book for older adults (reminiscence therapy).

Aim for {level}.
Seed for variety: {req.seed}.

{topic_rules}

ACCURACY RULES (critical — this is printed and sold):
- Use only widely-known, well-established facts. If you are not confident, skip
  the question rather than guessing; a short page beats a wrong page.
- Exactly one answer must be defensible. Nothing that depends on a country,
  a chart edition, or which release you count.
- No precise chart positions, no exact dates beyond the year, no obscure statistics.
- Never hedge in the answer ("probably", "around", "maybe") — a hedged answer is
  a sign the fact is not solid enough to print, so drop that question.
- The fact must genuinely belong to {start}–{end}. Do not assert that something
  from another decade was "a craze of the {req.decade}".
- Set "evidence_year" to the year the fact actually happened (or null when there
  is no single year). If that year is outside {start}–{end}, do not send the item.
- Do not cluster on one artist, show or brand, and never repeat an answer.
{language_line}

EDITORIAL RULES:
{safety_prompt_rules()}

{format_rules}

Set "confidence" to your honest probability (0.0-1.0) that the answer is exactly
right. Anything below {min_confidence()} is discarded, so do not inflate it.
An independent checker re-derives every answer afterwards, so a guess will be
caught and thrown away — it only wastes a slot on the page.
"""


def _format_items_for_verification(items: list[TriviaItem]) -> str:
    lines: list[str] = []
    for i, item in enumerate(items, start=1):
        lines.append(f"{i}. Question: {item.question}")
        lines.append(f"   Given answer: {item.answer}")
        if item.options:
            lines.append(f"   Options: {' / '.join(item.options)}")
    return "\n".join(lines)


def _build_verification_prompt(
    items: list[TriviaItem], decade: str, allowed_topics: list[str]
) -> str:
    instruction = str(section(_config(), "verification")["instruction"]).format(
        decade=decade,
        topics=", ".join(allowed_topics),
    )
    return f"""{instruction}

Decade under review: {decade}

ITEMS
{_format_items_for_verification(items)}
"""


# ----------------------------------------------------------------- model calls


async def _call_gemini(prompt: str) -> str:
    """Seam for tests; keeps the shared client call in one place."""
    return await call_gemini_json(
        prompt=prompt,
        # Low temperature and a real thinking budget: recalling decade facts
        # accurately is the whole job here, and wrong facts get printed.
        temperature=float_value(_limits(), "temperature"),
        thinking_level="low",
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=DecadeTriviaModelOutput,
        system_instruction=_system_instruction(),
        label="decade_trivia",
    )


async def _call_gemini_verify(prompt: str) -> str:
    """Seam for tests; the fact-check pass runs deterministically."""
    return await call_gemini_json(
        prompt=prompt,
        temperature=float_value(_limits(), "verifyTemperature"),
        thinking_level="low",
        max_output_tokens=int_value(_limits(), "verifyMaxOutputTokens"),
        response_schema=DecadeTriviaVerificationOutput,
        system_instruction=_system_instruction(),
        label="decade_trivia_verify",
    )


def apply_verdicts(
    items: list[TriviaItem],
    results: list[dict[str, Any]],
    allowed_topics: list[str] | None = None,
) -> list[TriviaItem]:
    """Keep only items the checker confirmed, dated inside the decade, and
    classified into a topic the author actually ticked.

    The topic gate lives here rather than in the regex cues because cues can
    only reject subjects someone thought to list: a question about a fashion
    trend sailed past a table that knew "hemline" but not "fashion". The
    checker reads the question, so an unlisted subject comes back as "other".

    An item the checker skipped entirely is dropped: it saw the item and had
    nothing to say for it, which is not a confirmation.
    """
    allowed = {t.casefold() for t in allowed_topics} if allowed_topics else None
    by_index: dict[int, dict[str, Any]] = {}
    for raw in results:
        if not isinstance(raw, dict):
            continue
        try:
            index = int(raw.get("index"))
        except (TypeError, ValueError):
            continue
        by_index[index] = raw

    kept: list[TriviaItem] = []
    for i, item in enumerate(items, start=1):
        verdict = by_index.get(i)
        if verdict is None:
            continue
        if str(verdict.get("verdict", "")).strip().casefold() != "correct":
            continue
        if verdict.get("decade_ok") is False:
            continue
        if allowed is not None:
            claimed = normalize_topic(str(verdict.get("topic", "")).strip())
            if claimed not in allowed:
                continue
            # The checker read the question; trust it over the writer's label.
            item = item.model_copy(update={"topic": claimed})
        kept.append(item)
    return kept


async def _verify(items: list[TriviaItem], req: DecadeTriviaRequest) -> list[TriviaItem]:
    """Second opinion on every item. A failed check never empties the page."""
    if not items or not verification_enabled():
        return items

    # Preset ticks are a closed set the checker can classify against; a
    # free-text topic is not, so that case keeps the string-match gate only.
    allowed = allowed_topic_ids(req.topics) if uses_preset_topics(req.topics) else None
    prompt_topics = allowed or allowed_topic_ids(req.topics)

    try:
        raw = await _call_gemini_verify(
            _build_verification_prompt(items, req.decade, prompt_topics)
        )
        results = parse_json_object(raw).get("results")
    except Exception as exc:
        logger.warning("studio_decade_trivia_verification_failed error=%s", exc)
        return items

    if not isinstance(results, list) or not results:
        logger.warning("studio_decade_trivia_verification_empty count=%s", len(items))
        return items

    return apply_verdicts(items, results, allowed)


def _scope(req: DecadeTriviaRequest, user_id: str) -> VarietyScope:
    """Decade + topics decide which facts the model keeps returning to."""
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.decade, ",".join(req.topics), req.format, req.difficulty),
        seed=req.seed,
    )


async def _generate_batch(
    req: DecadeTriviaRequest,
    needed: int,
    scope: VarietyScope,
    focus_topics: list[str] | None = None,
) -> list[TriviaItem]:
    prompt = with_variety(
        _build_prompt(
            req, needed + int_value(_limits(), "overRequest"), focus_topics
        ),
        scope,
        client_avoid=req.avoid,
    )
    raw = await _call_gemini(prompt)
    return _validate(_parse_trivia_json(raw), req)


# ------------------------------------------------------------------ entry point


async def generate_decade_trivia(
    req: DecadeTriviaRequest, user_id: str
) -> DecadeTriviaResponse:
    _check_rate_limit(user_id)
    scope = _scope(req, user_id)
    started = time.perf_counter()
    drafted = 0
    verified = 0
    rounds = 0
    kept: list[TriviaItem] = []

    # The topics that must each hold a seat on the finished page. Empty for a
    # free-text topic, where there is only one subject and nothing to cover.
    required = page_topic_order(req.topics, req.question_count, req.seed)

    try:
        for round_index in range(max_rounds()):
            short = req.question_count - len(kept)
            absent = missing_topics({item.topic for item in kept}, required)
            if short <= 0 and not absent:
                break

            # After the first round, spend the call on what is actually absent.
            # A generic re-ask returns more of whatever the model finds easy,
            # which is exactly the pool that is already full.
            focus = absent if round_index > 0 and absent else None
            rounds += 1
            batch = await _generate_batch(
                req,
                max(short, len(absent), 1),
                scope.at_seed(req.seed + round_index),
                focus,
            )
            drafted += len(batch)
            survivors = await _verify(batch, req)
            verified += len(survivors)
            kept = _dedupe(kept + survivors)
            if round_index == 0 and not kept:
                logger.info("studio_decade_trivia_first_round_empty user_id=%s", user_id)
    except DecadeTriviaGenerationError:
        raise
    except Exception as exc:
        logger.warning(
            "studio_decade_trivia_generation_failed",
            extra={
                "user_id": user_id,
                "model": settings.STUDIO_GEMINI_MODEL,
                "error": str(exc),
            },
        )
        raise DecadeTriviaGenerationError(
            "Model did not return valid decade trivia JSON"
        ) from exc

    if not kept:
        raise DecadeTriviaGenerationError(
            "No question passed fact-checking. Try a different decade or topics."
        )

    kept = _compose_page(
        kept, req.question_count, required, _format_targets(req, req.question_count)
    )
    # Always shuffle after the final page list is fixed — otherwise the model
    # bias toward options[0] prints every answer as letter A.
    kept = _shuffle_mc_options(kept, req.seed)

    remember(scope, (item.question for item in kept))

    # A topic still absent here survived every top-up round, which means the
    # filters rejected everything the model could write for it. The page ships
    # short rather than wrong, but this is the signal that a topic needs better
    # cues or guidance in topics.json — so it belongs in the logs, not silence.
    unfilled = missing_topics({item.topic for item in kept}, required)
    if unfilled:
        logger.warning(
            "studio_decade_trivia_topic_unfilled",
            extra={
                "user_id": user_id,
                "decade": req.decade,
                "requested_topics": required,
                "unfilled_topics": unfilled,
                "rounds": rounds,
            },
        )

    logger.info(
        "studio_decade_trivia_generated",
        extra={
            "user_id": user_id,
            "model": settings.STUDIO_GEMINI_MODEL,
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "decade": req.decade,
            "requested": req.question_count,
            "drafted": drafted,
            "verified": verified,
            "rounds": rounds,
            "question_count": len(kept),
            "short_page": len(kept) < req.question_count,
            "unfilled_topics": unfilled,
        },
    )

    return DecadeTriviaResponse(decade=req.decade, items=kept)


# Test helpers (pure, no network)
def validate_trivia_items_for_tests(
    items: list[dict[str, Any]], req: DecadeTriviaRequest
) -> list[TriviaItem]:
    return _validate(items, req)


def parse_trivia_json_for_tests(raw: str) -> list[dict[str, Any]]:
    return _parse_trivia_json(raw)


def mixed_targets_for_tests(count: int) -> dict[TriviaItemFormat, int]:
    return _mixed_targets(count)


def balance_mixed_for_tests(items: list[TriviaItem], count: int) -> list[TriviaItem]:
    return _balance_mixed(items, count)


def compose_page_for_tests(
    items: list[TriviaItem],
    count: int,
    topic_order: list[str],
    format_targets: dict[TriviaItemFormat, int] | None = None,
) -> list[TriviaItem]:
    return _compose_page(items, count, topic_order, format_targets)


def shuffle_mc_options_for_tests(items: list[TriviaItem], seed: int) -> list[TriviaItem]:
    return _shuffle_mc_options(items, seed)


def dedupe_for_tests(items: list[TriviaItem]) -> list[TriviaItem]:
    return _dedupe(items)


def build_prompt_for_tests(
    req: DecadeTriviaRequest, needed: int, focus_topics: list[str] | None = None
) -> str:
    return _build_prompt(req, needed, focus_topics)
