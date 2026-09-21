"""Shared loader for prompt content held in data files.

Prompt wording, variety angles, theme example pools, safety blocklists and the
lexicons used by near-duplicate detection are *content*, not logic: they change
far more often than the code around them, and they are edited by whoever owns
the activity rather than by whoever owns the service. Keeping them under
``app/data/studio/<game>/`` means a wording change is a data review, the same
JSON can ship to the frontend, and services stay generic.

Layout per activity::

    app/data/studio/<game>/prompt.json     limits, tones, angles, theme pools
    app/data/studio/<game>/lexicon.json    stopwords + token aliases (dedupe)
    app/data/studio/<game>/safety.json     blocked / editorial / avoid wording
    app/data/studio/<game>/prompt.md       the instruction template

Shared profiles (used by more than one activity) live in
``app/data/studio/shared/``. Prompts that are not Studio activities (coloring
pages, AI book covers) live under ``app/data/prompts/`` — pass ``root``.

Loaded values are cached and treated as immutable — copy before mutating.
"""

from __future__ import annotations

import json
import random
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence, TypeVar

APP_DATA_ROOT = Path(__file__).resolve().parents[1] / "data"
DEFAULT_ROOT = "studio"
PROMPT_ROOT = "prompts"
DATA_ROOT = APP_DATA_ROOT / DEFAULT_ROOT

T = TypeVar("T")


class PromptDataError(RuntimeError):
    """A studio data file is missing, malformed, or lacks a required key."""


@lru_cache(maxsize=None)
def load_text(relative: str, *, root: str = DEFAULT_ROOT) -> str:
    """Read a data file (e.g. ``"decade-trivia/prompt.md"``) as text."""
    path = APP_DATA_ROOT / root / relative
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:  # missing file / unreadable
        raise PromptDataError(f"studio data file not readable: {relative}") from exc


@lru_cache(maxsize=None)
def load_json(relative: str, *, root: str = DEFAULT_ROOT) -> Any:
    """Parse a JSON data file. Result is cached — do not mutate it."""
    try:
        return json.loads(load_text(relative, root=root))
    except json.JSONDecodeError as exc:
        raise PromptDataError(f"studio data file is not valid JSON: {relative}") from exc


def load_config(
    game: str, name: str = "prompt", *, root: str = DEFAULT_ROOT
) -> Mapping[str, Any]:
    """Load ``<game>/<name>.json`` and require a JSON object at the root."""
    data = load_json(f"{game}/{name}.json", root=root)
    if not isinstance(data, dict):
        raise PromptDataError(f"{game}/{name}.json must contain an object")
    return data


def load_template(game: str, name: str = "prompt", *, root: str = DEFAULT_ROOT) -> str:
    """Load ``<game>/<name>.md`` — a ``str.format`` template."""
    return load_text(f"{game}/{name}.md", root=root).strip()


def render_template(template: str, /, **values: Any) -> str:
    """Fill a template, failing loudly when a placeholder has no value."""
    try:
        return template.format(**values)
    except KeyError as exc:
        raise PromptDataError(f"prompt template placeholder not supplied: {exc}") from exc


def require(config: Mapping[str, Any], key: str) -> Any:
    if key not in config:
        raise PromptDataError(f"missing required key: {key}")
    return config[key]


def section(config: Mapping[str, Any], key: str) -> Mapping[str, Any]:
    value = require(config, key)
    if not isinstance(value, dict):
        raise PromptDataError(f"key must be an object: {key}")
    return value


def string_list(config: Mapping[str, Any], key: str) -> tuple[str, ...]:
    value = require(config, key)
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise PromptDataError(f"key must be a list of strings: {key}")
    return tuple(value)


def int_value(config: Mapping[str, Any], key: str) -> int:
    value = require(config, key)
    if isinstance(value, bool) or not isinstance(value, int):
        raise PromptDataError(f"key must be an integer: {key}")
    return value


def float_value(config: Mapping[str, Any], key: str) -> float:
    value = require(config, key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise PromptDataError(f"key must be a number: {key}")
    return float(value)


def locale_line(locale_cfg: Mapping[str, Any], locale: str) -> str:
    """Render the prompt's language line from a ``locale`` config block."""
    if locale and locale not in string_list(locale_cfg, "nativeLocales"):
        return str(require(locale_cfg, "otherLine")).format(locale=locale)
    return str(require(locale_cfg, "nativeLine"))


def rotate(values: Sequence[T], seed: int) -> T:
    """Pick one entry by seed so repeat generations move through the list."""
    if not values:
        raise PromptDataError("cannot rotate an empty list")
    return values[seed % len(values)]


def sample(values: Sequence[T], seed: int, count: int) -> list[T]:
    """Deterministically shuffle then take ``count`` — same seed, same slice."""
    pool = list(values)
    random.Random(seed).shuffle(pool)
    return pool[:count]


def word_pattern(terms: Iterable[str], /, *, boundaries: bool = True) -> re.Pattern[str]:
    """Compile terms into one case-insensitive alternation.

    Word boundaries suit single words and short phrases (``died``, ``care
    home``); disable them for fragments that start mid-word.
    """
    parts = [re.escape(term.strip()) for term in terms if term and term.strip()]
    if not parts:
        raise PromptDataError("cannot build a pattern from an empty term list")
    body = "|".join(parts)
    expr = rf"\b({body})\b" if boundaries else f"({body})"
    return re.compile(expr, re.IGNORECASE)


def regex_pattern(
    fragments: Iterable[str], /, *, boundaries: bool = False
) -> re.Pattern[str]:
    """Compile raw regex fragments from a data file into one alternation.

    Unlike :func:`word_pattern` the fragments are NOT escaped — use this only
    for data files that deliberately hold regex syntax.
    """
    parts = [fragment for fragment in fragments if fragment]
    if not parts:
        raise PromptDataError("cannot build a pattern from an empty fragment list")
    body = "|".join(parts)
    expr = rf"\b({body})\b" if boundaries else f"({body})"
    return re.compile(expr, re.IGNORECASE)


def prefix_pattern(terms: Iterable[str]) -> re.Pattern[str]:
    """Compile terms into an anchored alternation (line-opening words)."""
    parts = [re.escape(term.strip()) for term in terms if term and term.strip()]
    if not parts:
        raise PromptDataError("cannot build a pattern from an empty term list")
    return re.compile(rf"^({'|'.join(parts)})\b", re.IGNORECASE)


def bullet_lines(items: Iterable[str], *, marker: str = "-") -> str:
    """Render data-file strings as prompt bullet lines."""
    return "\n".join(f"{marker} {item}" for item in items if item)
