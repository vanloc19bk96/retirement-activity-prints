"""Generate crossword words+clues (or clues for given words) via Gemini."""

from __future__ import annotations

import logging
import re
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_crossword import (
    CrosswordClueItem,
    CrosswordCluesRequest,
    CrosswordCluesResponse,
    CrosswordModelOutput,
)
from app.services.studio_gemini import (
    RateLimiter,
    StudioGenerationError,
    StudioRateLimitError,
    call_gemini_json,
    parse_json_object,
)
from app.services.prompt_data import (
    int_value,
    load_config,
    locale_line,
    rotate,
    section,
    string_list,
)
from app.services.studio_variety import (
    VarietyScope,
    bucket_key,
    remember,
    with_variety,
)

logger = logging.getLogger(__name__)

GAME = "crossword"


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


@lru_cache(maxsize=1)
def _word_re() -> re.Pattern[str]:
    low = int_value(_limits(), "minWordLetters")
    high = int_value(_limits(), "maxWordLetters")
    return re.compile(rf"^[A-Za-z]{{{low},{high}}}$")


@lru_cache(maxsize=1)
def _angles() -> tuple[str, ...]:
    """Rotated by seed so two users on the same theme get different words."""
    return string_list(_config(), "varietyAngles")


_rate_limiter = RateLimiter(
    label="crossword",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class CrosswordRateLimitError(StudioRateLimitError):
    """User exceeded the short-window crossword generation quota."""


class CrosswordClueGenerationError(StudioGenerationError):
    """Model output could not be parsed into valid crossword content."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise CrosswordRateLimitError(str(exc)) from exc


def _normalize_word(raw: str) -> str:
    return re.sub(r"[^A-Za-z]", "", raw).upper()


def _clean_words(words: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for w in words:
        word = _normalize_word(w)
        if not _word_re().match(word):
            continue
        if word in seen:
            continue
        seen.add(word)
        out.append(word)
    return out


def _locale_line(locale: str) -> str:
    return locale_line(section(_config(), "locale"), locale)


def _difficulty_line(difficulty: str) -> str:
    return str(_config()["difficultyLine"]).format(difficulty=difficulty)


def _build_theme_prompt(req: CrosswordCluesRequest) -> str:
    theme = req.theme.strip()
    angle = rotate(_angles(), req.seed)
    want = req.item_count + int_value(_limits(), "overRequest")
    return f"""You create crossword answers and short clues for an adult workbook.

Theme: {theme}
Invent {want} single-word answers about that theme.
Each word must be {req.min_letters}-{req.max_letters} letters, A–Z only.
Seed for variety: {req.seed}. Lean towards {angle} where it suits the theme.
{_difficulty_line(req.difficulty)}

Rules:
- One word per entry: no spaces, hyphens, accents, digits, or punctuation.
- Count the letters before writing; a word outside {req.min_letters}-{req.max_letters}
  is discarded.
- Everyday vocabulary an older adult would recognise.
- No brand names, no proper nouns, no duplicates / same-root plurals.
- Clue is 2–10 words. No quotation marks around the whole clue.
- The clue must not contain the answer word or any stem of it — a solver who
  already sees the answer has nothing to solve.
- Exactly one answer must fit the clue. Avoid clues that several words satisfy.
- Wholesome and neutral. No violence, politics, brands, or adult content.
{_locale_line(req.locale)}

Write about {want} entries in "clues", "word" uppercase, e.g.
{{ "word": "TIGER", "clue": "Big striped cat" }}
"""


def _build_words_prompt(words: list[str], difficulty: str, locale: str) -> str:
    word_list = ", ".join(words)
    return f"""You write short, fair crossword clues for an adult workbook.

Write ONE clue per word.
{_difficulty_line(difficulty)}

Rules:
- Clue is 2–10 words. No quotation marks around the whole clue.
- The clue must not contain the answer word or any stem of it — a solver who
  already sees the answer has nothing to solve.
- Exactly one answer must fit the clue. Avoid clues that several words satisfy.
- No proper-noun trivia unless the word itself is a proper noun.
- Wholesome and neutral. No violence, politics, brands, or adult content.
{_locale_line(locale)}

Words: {word_list}

Write one entry per word in "clues", every word exactly once and uppercase, e.g.
{{ "word": "TIGER", "clue": "Big striped cat" }}
"""


def _clue_echoes_word(word: str, clue: str) -> bool:
    upper = clue.upper()
    if word in upper:
        return True
    if len(word) >= 4 and word[:-1] in upper:
        return True
    return False


def _parse_pair_items(
    data: dict[str, Any],
    *,
    expected: list[str] | None,
    min_letters: int,
    max_letters: int,
    want: int,
) -> list[CrosswordClueItem]:
    raw_clues = data.get("clues")
    if not isinstance(raw_clues, list) or not raw_clues:
        raise ValueError("missing clues")

    expected_set = set(expected) if expected is not None else None
    by_word: dict[str, str] = {}
    order: list[str] = []

    for item in raw_clues:
        if not isinstance(item, dict):
            continue
        word = _normalize_word(str(item.get("word", "")))
        clue = str(item.get("clue", "")).strip()
        if not _word_re().match(word):
            continue
        if len(word) < min_letters or len(word) > max_letters:
            continue
        if expected_set is not None and word not in expected_set:
            continue
        if not clue or _clue_echoes_word(word, clue):
            continue
        if word in by_word:
            continue
        by_word[word] = clue
        order.append(word)
        if expected_set is None and len(order) >= want:
            break

    if expected is not None:
        out = [
            CrosswordClueItem(word=w, clue=by_word[w])
            for w in expected
            if w in by_word
        ]
        if len(out) < max(1, len(expected) // 2):
            raise ValueError("too few valid clues")
        return out

    out = [CrosswordClueItem(word=w, clue=by_word[w]) for w in order[:want]]
    if len(out) < max(4, want // 2):
        raise ValueError("too few valid clues")
    return out


def _parse_clues_json(
    raw: str,
    *,
    expected: list[str] | None,
    min_letters: int,
    max_letters: int,
    want: int,
) -> list[CrosswordClueItem]:
    data = parse_json_object(raw)
    return _parse_pair_items(
        data,
        expected=expected,
        min_letters=min_letters,
        max_letters=max_letters,
        want=want,
    )


async def _call_gemini(prompt: str) -> str:
    """Seam for tests; keeps the shared client call in one place."""
    return await call_gemini_json(
        prompt=prompt,
        # Lower temperature: clue writing is a precision job, not a creative one.
        temperature=0.6,
        max_output_tokens=4096,
        response_schema=CrosswordModelOutput,
        label="crossword",
    )


def _scope(req: CrosswordCluesRequest, user_id: str) -> VarietyScope:
    """Theme mode only: in words mode the author supplies the answers."""
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.theme, req.difficulty),
        seed=req.seed,
    )


async def generate_crossword_clues(
    req: CrosswordCluesRequest, user_id: str
) -> CrosswordCluesResponse:
    _check_rate_limit(user_id)
    words = _clean_words(req.words)
    theme = req.theme.strip()
    started = time.perf_counter()

    scope: VarietyScope | None = None
    if words:
        prompt = _build_words_prompt(words, req.difficulty, req.locale)
        expected: list[str] | None = words
        want = len(words)
        min_letters = 3
        max_letters = 12
    else:
        # Words mode reuses the author's own answers, so only theme mode can
        # repeat itself.
        scope = _scope(req, user_id)
        prompt = with_variety(_build_theme_prompt(req), scope, client_avoid=req.avoid)
        expected = None
        want = req.item_count
        min_letters = req.min_letters
        max_letters = req.max_letters

    try:
        raw = await _call_gemini(prompt)
        clues = _parse_clues_json(
            raw,
            expected=expected,
            min_letters=min_letters,
            max_letters=max_letters,
            want=want,
        )
    except CrosswordClueGenerationError:
        raise
    except Exception as exc:
        logger.warning(
            "studio_crossword_clues_failed",
            extra={
                "user_id": user_id,
                "model": settings.STUDIO_GEMINI_MODEL,
                "error": str(exc),
                "theme": theme or None,
                "word_count": len(words),
            },
        )
        raise CrosswordClueGenerationError(
            "Model did not return valid crossword content"
        ) from exc

    if scope is not None:
        remember(scope, (clue.word for clue in clues))

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "studio_crossword_clues_generated",
        extra={
            "user_id": user_id,
            "model": settings.STUDIO_GEMINI_MODEL,
            "latency_ms": elapsed_ms,
            "theme": theme or None,
            "word_count": len(words),
            "clue_count": len(clues),
        },
    )
    return CrosswordCluesResponse(clues=clues)


def parse_clues_json_for_tests(
    raw: str,
    expected: list[str] | None,
    *,
    min_letters: int = 3,
    max_letters: int = 12,
    want: int = 14,
) -> list[CrosswordClueItem]:
    return _parse_clues_json(
        raw,
        expected=expected,
        min_letters=min_letters,
        max_letters=max_letters,
        want=want,
    )
