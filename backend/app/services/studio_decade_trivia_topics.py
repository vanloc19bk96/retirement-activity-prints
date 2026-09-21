"""Topic allow-list for Decade Trivia.

The author's ticked topics are a promise: untick "film" and no film question may
appear. The model's own ``topic`` label is not enough to keep that promise — it
mislabels, and the previous cue table only covered three of the eight presets,
so anything the model tagged as an allowed topic sailed through.

Two independent gates now have to agree:

* **Label gate** — the model's declared topic must be one the author ticked.
* **Content gate** — the question text must not read as a topic the author did
  *not* tick, unless it also reads as one they did.

A ticked topic is equally a promise in the other direction: tick "products" and
a products question must *appear*. Nothing here could keep that half — the
filters only ever subtract — so this module also owns the quota side of the
deal: :func:`topic_quotas` turns the ticked list into an explicit per-topic
count for the prompt, and :func:`page_topic_order` tells the composer which
topics must each hold a seat on the finished page.

The taxonomy itself (ids, labels, aliases, per-topic cues, per-topic writing
guidance) is content and lives in
``app/data/studio/decade-trivia/topics.json``.
"""

from __future__ import annotations

import re
from functools import lru_cache
from types import MappingProxyType
from typing import Any, Mapping

from app.services.prompt_data import (
    load_config,
    regex_pattern,
    section,
    string_list,
)

GAME = "decade-trivia"


@lru_cache(maxsize=1)
def _topics_config() -> Mapping[str, Any]:
    return load_config(GAME, "topics")


@lru_cache(maxsize=1)
def preset_topic_labels() -> Mapping[str, str]:
    """Preset ids must match the Studio multiSelect values on the frontend."""
    labels = section(_topics_config(), "presetTopics")
    return MappingProxyType({str(k): str(v) for k, v in labels.items()})


@lru_cache(maxsize=1)
def preset_topic_ids() -> frozenset[str]:
    return frozenset(preset_topic_labels())


@lru_cache(maxsize=1)
def _topic_aliases() -> Mapping[str, str]:
    """The model often returns a human label instead of the preset id."""
    aliases = section(_topics_config(), "aliases")
    return MappingProxyType({str(k): str(v) for k, v in aliases.items()})


@lru_cache(maxsize=1)
def _default_topics() -> tuple[str, ...]:
    return string_list(_topics_config(), "defaultTopics")


@lru_cache(maxsize=1)
def _topic_guidance() -> Mapping[str, str]:
    """What a printable question for each preset looks like.

    The downstream filters are strict and topic-blind about *why* they reject:
    a topic the writer approaches badly (products via slogans, events via
    disasters) loses every item and disappears from the page. Telling the
    writer what a good question for that topic looks like is the cheapest way
    to keep the topic on the page — and, for products, the wording that keeps
    it off a KDP takedown list.
    """
    guidance = section(_topics_config(), "topicGuidance")
    missing = preset_topic_ids() - set(guidance)
    if missing:
        raise ValueError(f"topics.json is missing guidance for: {sorted(missing)}")
    return MappingProxyType({str(k): str(v) for k, v in guidance.items()})


@lru_cache(maxsize=1)
def _topic_cues() -> Mapping[str, re.Pattern[str]]:
    """Per-preset content cues. Every preset must appear — a missing entry is a
    hole in the content gate, not a harmless omission."""
    cues = section(_topics_config(), "topicCues")
    missing = preset_topic_ids() - set(cues)
    if missing:
        raise ValueError(f"topics.json is missing cues for: {sorted(missing)}")
    return MappingProxyType(
        {
            str(topic_id): regex_pattern(fragments, boundaries=False)
            for topic_id, fragments in cues.items()
        }
    )


def normalize_topic(raw: str) -> str:
    key = (raw or "").strip().casefold()
    if not key:
        return ""
    if key in preset_topic_ids():
        return key
    return _topic_aliases().get(key, key)


def allowed_topic_ids(topics: list[str]) -> list[str]:
    return [t for t in (normalize_topic(t) for t in topics) if t]


def uses_preset_topics(topics: list[str]) -> bool:
    ids = allowed_topic_ids(topics)
    return bool(ids) and all(t in preset_topic_ids() for t in ids)


def topic_quotas(
    topics: list[str], question_count: int, seed: int = 0
) -> dict[str, int]:
    """How many of the page's questions each ticked topic should get.

    Every ticked topic gets at least one seat whenever the page has room for
    them all, which is the whole promise: "spread them evenly" was only ever a
    suggestion the model was free to ignore, and it did — a five-topic page came
    back with four topics and three film questions.

    When more topics are ticked than there are questions, the surplus cannot fit
    (the frontend warns about this before generating). Rotating by ``seed``
    means consecutive pages of a book take turns rather than every page opening
    with the same first topics.

    Returns a mapping in the author's own order, including the zero quotas, so
    callers can see which topics were squeezed out.
    """
    ordered = list(dict.fromkeys(allowed_topic_ids(topics)))
    if not ordered or question_count <= 0:
        return {}
    offset = seed % len(ordered)
    rotated = ordered[offset:] + ordered[:offset]
    quotas = {topic: 0 for topic in ordered}
    for seat in range(question_count):
        quotas[rotated[seat % len(rotated)]] += 1
    return quotas


def page_topic_order(
    topics: list[str], question_count: int, seed: int = 0
) -> list[str]:
    """Topics that must each hold a seat on the finished page, in fill order.

    Only meaningful for preset ticks — a free-text topic is a single subject the
    verification pass cannot classify against a closed list.
    """
    if not uses_preset_topics(topics):
        return []
    quotas = topic_quotas(topics, question_count, seed)
    ordered = [topic for topic, quota in quotas.items() if quota > 0]
    if not ordered:
        return []
    offset = seed % len(ordered)
    return ordered[offset:] + ordered[:offset]


def missing_topics(present: set[str], required: list[str]) -> list[str]:
    """Required topics with nothing to show for them yet, in required order."""
    return [topic for topic in required if topic not in present]


def topics_in_text(question: str, answer: str) -> set[str]:
    """Presets whose cues appear in the item text."""
    text = f"{question} {answer}"
    return {topic_id for topic_id, pattern in _topic_cues().items() if pattern.search(text)}


def topic_is_allowed(item_topic: str, requested: list[str]) -> bool:
    """True when the model-reported topic matches the author's selection."""
    allowed = allowed_topic_ids(requested)
    if not allowed:
        # An empty selection reaches here only from a malformed request; the
        # schema rejects it first. Refusing everything is the safe reading.
        return False
    topic = normalize_topic(item_topic)
    if not topic:
        return False
    if uses_preset_topics(requested):
        return topic in set(allowed)
    # Custom / free-text topic: require a clear string match.
    return any(topic == a or topic in a or a in topic for a in allowed)


def content_drifts_off_topic(question: str, answer: str, requested: list[str]) -> bool:
    """True when the text reads as a topic the author did not tick.

    A question that also matches an allowed topic is kept: "which singer starred
    in the film" is legitimately music *and* film, and dropping every overlap
    would empty pages that tick only one of a naturally paired topic.
    """
    if not uses_preset_topics(requested):
        return False
    allowed = set(allowed_topic_ids(requested))
    found = topics_in_text(question, answer)
    if not found:
        # No cue either way — the label gate is the only evidence, and it passed.
        return False
    return bool(found - allowed) and not (found & allowed)


def format_topic_rules_for_prompt(
    topics: list[str],
    question_count: int,
    seed: int = 0,
    focus_topics: list[str] | None = None,
) -> str:
    """Strict allow/deny copy for the Gemini prompt, with per-topic quotas.

    ``focus_topics`` narrows the *writing* brief to topics the page is still
    missing after an earlier round. The author's full selection still decides
    what is allowed downstream — this only stops a top-up round from spending
    all its questions on the topics that already filled up.
    """
    allowed = allowed_topic_ids(topics)
    if not allowed:
        allowed = list(_default_topics())

    labels = preset_topic_labels()
    if uses_preset_topics(allowed):
        wanted = [t for t in (focus_topics or []) if t in set(allowed)] or allowed
        quotas = topic_quotas(wanted, question_count, seed)
        seated = [(tid, n) for tid, n in quotas.items() if n > 0]
        guidance = _topic_guidance()
        allowed_lines = "\n".join(
            f"- {tid} — {labels.get(tid, tid)}\n"
            f"    Write EXACTLY {n} question{'s' if n != 1 else ''} on this topic.\n"
            f"    {guidance[tid]}"
            for tid, n in seated
        )
        # Anything without a seat is off limits for this call, whether the
        # author never ticked it or the page has already filled up on it.
        off_limits = sorted(preset_topic_ids() - {tid for tid, _ in seated})
        forbid_line = (
            "FORBIDDEN — do not write about these at all, and do not re-label a "
            f"fact to smuggle one in: {', '.join(off_limits)}."
            if off_limits
            else "Every preset topic has a quota above."
        )
        ids = " | ".join(tid for tid, _ in seated)
        focus_line = (
            "This is a top-up round. The page already has its other questions and is"
            " still short on the topics below, so a question on any other topic will"
            " be thrown away — do not write one.\n\n"
            if focus_topics
            else ""
        )
        return f"""TOPIC RULES (critical — the printed page must match what the author ticked):

{focus_line}REQUIRED topics and their quotas. Every topic listed here must appear on the
page. A missing topic is a defect, exactly like a wrong answer:
{allowed_lines}

{forbid_line}
- Meet every quota above before writing anything else. If one topic is harder
  for this decade, work harder at it — never reallocate its questions to an
  easier topic.
- Every question must fit exactly one REQUIRED topic. Do not stretch "everyday"
  to cover TV shows, movies, or concerts.
- Set "topic" to exactly one of these ids: {ids}
- If a fact is mainly about a forbidden topic, skip it — do not re-label it.
- Extra questions beyond the quotas are spares in case one is rejected: spread
  them over the REQUIRED topics too, and never invent a topic outside the list."""

    custom = ", ".join(allowed)
    return f"""TOPIC RULES (critical — the printed page must match what the author asked for):
ALLOWED topic ONLY: {custom}.
- Every question must be about that topic and nothing else.
- Set "topic" to a short label matching the allowed topic.
- Do not drift into unrelated nostalgia categories."""


def is_off_topic_for_tests(question: str, answer: str, topics: list[str]) -> bool:
    return content_drifts_off_topic(question, answer, topics)


def topic_allowed_for_tests(item_topic: str, topics: list[str]) -> bool:
    return topic_is_allowed(item_topic, topics)
