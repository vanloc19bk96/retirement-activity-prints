"""Structural and editorial checks for one Decade Trivia item.

Everything here is pure and deterministic, which is deliberate: the model gets
one chance to write a question and one chance to fact-check it, and these rules
are what decides whether the result is printable regardless of what either pass
said. They fall into three groups:

* **Shape** — a fill-blank whose blank is glued to part of its own answer
  (``"released in 19___"`` + ``"1961"``) prints as ``"in 191961"``. Repair it
  where the intent is unambiguous, drop it where it is not.
* **Era** — a year in the text, or the model's own ``evidence_year``, that falls
  outside the requested decade means the fact belongs to another era even when
  the sentence asserts otherwise.
* **Editorial** — the blocked terms and copyright cues in ``safety.json``, which
  exist because these pages are sold on Amazon KDP.
"""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Any, Mapping

from app.services.prompt_data import (
    bullet_lines,
    load_config,
    regex_pattern,
    string_list,
    word_pattern,
)

GAME = "decade-trivia"

_BLANK_RUN = re.compile(r"_{2,}")
_YEAR_RE = re.compile(r"\b((?:18|19|20)\d{2})\b")
_GLUED_BEFORE = re.compile(r"[\w'’-]+$")
_GLUED_AFTER = re.compile(r"^[\w'’-]+")

#: The canonical blank the frontend widens into a printed rule.
BLANK = "___"


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _safety() -> Mapping[str, Any]:
    return load_config(GAME, "safety")


@lru_cache(maxsize=1)
def _hedge_pattern() -> re.Pattern[str]:
    """A hedged answer signals the fact is not solid enough to print."""
    return word_pattern(string_list(_config(), "hedgeTerms"))


@lru_cache(maxsize=1)
def _blocked_pattern() -> re.Pattern[str]:
    return word_pattern(string_list(_safety(), "blockedTerms"))


@lru_cache(maxsize=1)
def _copyright_pattern() -> re.Pattern[str]:
    return regex_pattern(string_list(_safety(), "copyrightCues"), boundaries=False)


def safety_prompt_rules() -> str:
    """The editorial guardrails, rendered as prompt bullets."""
    return bullet_lines(string_list(_safety(), "promptRules"))


def decade_year_range(decade: str) -> tuple[int, int]:
    """First and last year of a label like ``"1960s"``."""
    digits = re.match(r"^(\d{4})", decade.strip())
    if not digits:
        raise ValueError(f"unrecognized decade label: {decade!r}")
    start = int(digits.group(1)) // 10 * 10
    return start, start + 9


def is_hedged(text: str) -> bool:
    return bool(_hedge_pattern().search(text))


def is_unsuitable(question: str, answer: str) -> bool:
    """Blocked subject matter, or wording that reproduces copyrighted text."""
    text = f"{question} {answer}"
    return bool(_blocked_pattern().search(text) or _copyright_pattern().search(text))


def mentions_year_outside_decade(text: str, decade: str) -> bool:
    start, end = decade_year_range(decade)
    return any(not start <= int(m.group(1)) <= end for m in _YEAR_RE.finditer(text))


def evidence_year_outside_decade(year: int | None, decade: str) -> bool:
    """``evidence_year`` is the model's own dating of the fact.

    When it lands outside the decade the question is wrong even though it reads
    fine — this is what catches "the Slinky craze of the 1960s" (1945).
    """
    if year is None:
        return False
    start, end = decade_year_range(decade)
    return not start <= year <= end


def answer_leaks_into_question(question: str, answer: str) -> bool:
    """A question that already contains its own answer is not a question."""
    value = answer.strip()
    if len(value) < 4:
        return False
    stripped = _BLANK_RUN.sub(" ", question)
    return value.casefold() in stripped.casefold()


def repair_fill_blank(question: str, answer: str) -> str | None:
    """Normalize a fill-blank sentence to exactly one space-delimited blank.

    Returns the repaired question, or ``None`` when the item cannot be made
    printable — either the model wrote no blank at all, or the text glued to the
    blank is not part of the answer, which means the sentence is malformed in a
    way we would have to guess our way out of.
    """
    text = " ".join(question.split())
    value = answer.strip()
    match = _BLANK_RUN.search(text)
    if not match:
        return None

    before = text[: match.start()]
    after = text[match.end() :]

    glued_before = _GLUED_BEFORE.search(before)
    if glued_before:
        fragment = glued_before.group(0)
        if not value.casefold().startswith(fragment.casefold()):
            return None
        before = before[: -len(fragment)]

    glued_after = _GLUED_AFTER.search(after)
    if glued_after:
        fragment = glued_after.group(0)
        if not value.casefold().endswith(fragment.casefold()):
            return None
        after = after[len(fragment) :]

    # Any further blanks would give the page two rules for one answer.
    before = _BLANK_RUN.sub("", before)
    after = _BLANK_RUN.sub("", after)

    head = before.rstrip()
    tail = after.lstrip()
    parts = [part for part in (head, BLANK) if part]
    repaired = " ".join(parts)
    if tail:
        repaired = f"{repaired}{tail}" if tail[0] in ".,;:!?" else f"{repaired} {tail}"
    repaired = " ".join(repaired.split())

    return repaired if repaired.strip(" _") else None
