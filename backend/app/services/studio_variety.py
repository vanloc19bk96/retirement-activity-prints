"""Cross-generation freshness for the AI-written Studio games.

Every AI game hits the same wall: asked for the same theme twice, the model
answers with very nearly the same content. Milk, bread, eggs, apples — the
reader who buys a 60-page book meets the same shopping list on page 3 and on
page 41. The ``seed`` already in each prompt does not fix it; the model reads
the number and writes the same list anyway.

This module is the shared fix, wired into every ``studio_*`` service:

* **What was printed before is fed back in.** After a generation, the service
  remembers the labels it produced under a ``(game, user, bucket)`` key. The
  next call for that bucket lists them as already used, so the model has to
  reach further into the theme.
* **The client remembers too.** Browsers send their own ``avoid`` list, which
  covers the two things a process-local memory cannot: more than one API worker,
  and a restart. Both lists are merged here.
* **A rotating angle.** A seed-picked lens ("things tied to cold weather") moves
  the model to a different corner of the theme on the very first call, before
  any memory exists.

Services touch exactly two functions: :func:`with_variety` around the prompt
they already build, and :func:`remember` once the output is parsed.
"""

from __future__ import annotations

import hashlib
import re
from collections import OrderedDict, deque
from dataclasses import dataclass, replace
from functools import lru_cache
from typing import Any, Iterable, Mapping, Sequence

from app.services.prompt_data import (
    bullet_lines,
    int_value,
    load_config,
    rotate,
    section,
    string_list,
)

SHARED = "shared"
CONFIG_NAME = "variety"

_WHITESPACE_RE = re.compile(r"\s+")
# Trailing punctuation only: "Apples," and "apples" are the same item to a reader.
_EDGE_PUNCTUATION_RE = re.compile(r"^[^\w]+|[^\w]+$", re.UNICODE)


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(SHARED, CONFIG_NAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


@lru_cache(maxsize=1)
def _lines() -> Mapping[str, Any]:
    return section(_config(), "lines")


@lru_cache(maxsize=1)
def _angles() -> tuple[str, ...]:
    return string_list(_config(), "angles")


def normalize_label(value: Any) -> str:
    """Collapse a label to its comparable form (empty when it carries nothing)."""
    text = _WHITESPACE_RE.sub(" ", str(value or "")).strip()
    text = _EDGE_PUNCTUATION_RE.sub("", text)
    return text[: int_value(_limits(), "maxLabelChars")].strip()


def bucket_key(*parts: Any) -> str:
    """Join the config fields that decide "same kind of content" into one key.

    Two generations only risk repeating each other when they ask for the same
    thing — same theme, same category, same era. Pass those fields; leave counts
    and layout options out, they do not change what the model writes about.
    """
    cleaned = [normalize_label(part).casefold() for part in parts]
    return "|".join(part for part in cleaned if part) or "default"


@dataclass(frozen=True)
class VarietyScope:
    """Who is generating, for which game, about what, on which attempt."""

    game: str
    user_id: str
    bucket: str
    seed: int

    def at_seed(self, seed: int) -> "VarietyScope":
        """Same memory bucket, new draw — for services that retry per batch."""
        return replace(self, seed=seed)

    @property
    def key(self) -> str:
        user = normalize_label(self.user_id).casefold() or "anonymous"
        return f"{self.game}|{user}|{self.bucket}"


class VarietyMemory:
    """Recently generated labels per scope key, newest last.

    Process-local and bounded, like :class:`RateLimiter`: it is a nudge for the
    prompt, not a source of truth. The browser's own list is what survives a
    restart or a second worker.
    """

    def __init__(self, *, per_bucket: int, max_buckets: int) -> None:
        self._per_bucket = per_bucket
        self._max_buckets = max_buckets
        self._buckets: OrderedDict[str, deque[str]] = OrderedDict()

    def remember(self, key: str, values: Iterable[str]) -> None:
        labels = [label for label in (normalize_label(v) for v in values) if label]
        if not labels:
            return
        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = deque(maxlen=self._per_bucket)
            self._buckets[key] = bucket
        self._buckets.move_to_end(key)

        seen = {label.casefold() for label in bucket}
        for label in labels:
            folded = label.casefold()
            if folded in seen:
                continue
            seen.add(folded)
            # deque drops the oldest at maxlen; `seen` may keep a stale entry,
            # which only means one label is not re-added until it rotates out.
            bucket.append(label)

        while len(self._buckets) > self._max_buckets:
            self._buckets.popitem(last=False)

    def recent(self, key: str, limit: int) -> tuple[str, ...]:
        bucket = self._buckets.get(key)
        if not bucket or limit <= 0:
            return ()
        # Newest first: the most recent sheet is the one a reader would notice.
        return tuple(reversed(list(bucket)[-limit:]))

    def clear(self) -> None:
        self._buckets.clear()


_memory = VarietyMemory(
    per_bucket=int_value(_limits(), "memoryPerBucket"),
    max_buckets=int_value(_limits(), "maxBuckets"),
)


def _merge_avoid(scope: VarietyScope, client_avoid: Sequence[str], limit: int) -> list[str]:
    """Client list first (it spans sessions), then this worker's own memory."""
    merged: list[str] = []
    seen: set[str] = set()
    for raw in list(client_avoid) + list(_memory.recent(scope.key, limit)):
        label = normalize_label(raw)
        folded = label.casefold()
        if not label or folded in seen:
            continue
        seen.add(folded)
        merged.append(label)
        if len(merged) >= limit:
            break
    return merged


def variety_angle(seed: int) -> str:
    """The lens this seed asks the model to look through."""
    return rotate(_angles(), seed)


def variety_nonce(scope: VarietyScope) -> str:
    """Short token that differs per scope+seed, so two calls never look alike."""
    digest = hashlib.sha1(f"{scope.key}:{scope.seed}".encode("utf-8")).hexdigest()
    return digest[:6]


def variety_lines(
    scope: VarietyScope,
    *,
    client_avoid: Sequence[str] = (),
    limit: int | None = None,
) -> str:
    """Render the freshness block to drop into a prompt template.

    Always returns the angle and the variation token; the "already used" list
    appears only once there is history for this scope.
    """
    lines = _lines()
    max_avoid = limit if limit is not None else int_value(_limits(), "promptAvoidCount")
    avoided = _merge_avoid(scope, client_avoid, max_avoid)

    body = [
        str(lines["angle"]).format(angle=variety_angle(scope.seed)),
        str(lines["nonce"]).format(nonce=variety_nonce(scope)),
    ]
    if avoided:
        body.insert(0, str(lines["avoid"]).format(avoided=", ".join(avoided)))
        body.insert(1, str(lines["avoidTail"]))

    return f"{lines['header']}\n{bullet_lines(body)}"


def with_variety(
    prompt: str,
    scope: VarietyScope,
    *,
    client_avoid: Sequence[str] = (),
    limit: int | None = None,
) -> str:
    """Append the freshness block to a finished prompt.

    Appending rather than threading a placeholder through every prompt template:
    each service keeps its own wording untouched, and the block lands last,
    where the model reads it right before answering.
    """
    block = variety_lines(scope, client_avoid=client_avoid, limit=limit)
    return f"{prompt.rstrip()}\n\n{block}\n"


def remember(scope: VarietyScope, values: Iterable[Any]) -> None:
    """Record what this generation produced so the next one has to differ."""
    _memory.remember(scope.key, (str(v) for v in values))


def recent(scope: VarietyScope, limit: int | None = None) -> tuple[str, ...]:
    max_avoid = limit if limit is not None else int_value(_limits(), "promptAvoidCount")
    return _memory.recent(scope.key, max_avoid)


def reset_memory() -> None:
    """Test helper — drops every remembered bucket."""
    _memory.clear()
