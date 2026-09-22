"""Generate retirement-themed anagram answers, each with its clue, via Gemini.

AI-only: no bundled word bank. A packaged list would make every seller's book
draw on the same few hundred words, which is the fastest way to two KDP titles
that look copied from each other.

The clue is not decoration. Letters alone have more than one fair reading —
TRIAL and TRAIL are the same six letters — and the answer page prints only one
of them, so a sheet without clues can be wrong about its own solution. The clue
is what makes the page honest, and it is also what makes the puzzle solvable by
the reader this book is sold to.
"""

from __future__ import annotations

import logging
import re
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_retirement_anagram import (
    RetirementAnagramClue,
    RetirementAnagramModelOutput,
    RetirementAnagramRequest,
    RetirementAnagramResponse,
)
from app.services.studio_gemini import (
    RateLimiter,
    StudioGenerationError,
    StudioRateLimitError,
    call_gemini_json,
    parse_string_items,
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

GAME = "retirement-anagram"


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


@lru_cache(maxsize=1)
def _angles() -> tuple[str, ...]:
    return string_list(_config(), "varietyAngles")


@lru_cache(maxsize=1)
def _word_re() -> re.Pattern[str]:
    low = int_value(_limits(), "minWordLetters")
    high = int_value(_limits(), "maxWordLetters")
    return re.compile(rf"^[A-Z]{{{low},{high}}}$")


_rate_limiter = RateLimiter(
    label="retirement-anagram",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class RetirementAnagramRateLimitError(StudioRateLimitError):
    """User exceeded the short-window retirement-anagram quota."""


class RetirementAnagramGenerationError(StudioGenerationError):
    """Model output could not be parsed into usable words and clues."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise RetirementAnagramRateLimitError(str(exc)) from exc


def _scope(req: RetirementAnagramRequest, user_id: str) -> VarietyScope:
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.theme, f"{req.min_letters}-{req.max_letters}"),
        seed=req.seed,
    )


def _build_prompt(req: RetirementAnagramRequest) -> str:
    angle = rotate(_angles(), req.seed)
    language_line = locale_line(section(_config(), "locale"), req.locale)
    stem = int_value(_limits(), "clueStemLetters")
    return f"""Write {req.count} single English words clearly about: {req.theme.strip()}.
Give each word one short clue.
Focus angle for variety: {angle}.
Each word is printed with its letters shuffled in a large-print retirement
activity book; the clue is what tells the solver which word to look for.
Seed for variety: {req.seed}.

Word rules:
- {req.min_letters}-{req.max_letters} letters, A-Z only. Count the letters before writing.
- Single words only — no phrases, hyphens, spaces or plurals of another entry.
- Familiar vocabulary for adults and seniors.
- Must clearly relate to the theme above.
- No proper nouns, brands, abbreviations or slang.
- No offensive, medical-crisis or depressing retirement concepts.
- No duplicates, and no two words built from the same set of letters.
- Prefer words whose letters spell only ONE common English word
  (skip lemon/melon, listen/silent, earth/heart, angle/glean, trial/trail).

Clue rules:
- At most {req.max_clue_chars} characters, counted including spaces. This is a
  hard limit: the clue is set on one printed line and a longer one is dropped.
- A plain definition or description, not wordplay, riddles or cryptic hints.
- Never contains the answer, and never a word sharing its first {stem} letters.
- Exactly one word fits the clue — a solver who knows it must reach that word.
- No trailing full stop, no quotation marks around the clue.

{language_line}

Return JSON with "items": an array of {req.count} objects, each with an
uppercase "word" and its "clue", e.g.
{{ "word": "GARDEN", "clue": "Where the roses grow" }}
"""


def _clue_echoes_word(word: str, clue: str, stem_letters: int) -> bool:
    """A clue that hands over its own answer.

    Not only the word itself: asked to define GARDENING a model writes "where a
    gardener spends the morning" as often as not, and a solver who sees the stem
    has been given the anagram rather than asked it. Comparing the opening
    letters catches the whole family — GARDEN, GARDENER, GARDENS — without
    rejecting the honest near-misses a shorter stem would.
    """
    upper = clue.upper()
    if word in upper:
        return True
    stem = word[:stem_letters]
    if len(stem) < stem_letters:
        return False
    return any(token.startswith(stem) for token in re.split(r"[^A-Z]+", upper))


def _normalize_items(
    raw_items: list[Any],
    *,
    min_len: int,
    max_len: int,
    want: int,
    max_clue_chars: int,
) -> list[RetirementAnagramClue]:
    min_clue = int_value(_limits(), "minClueChars")
    stem_letters = int_value(_limits(), "clueStemLetters")
    out: list[RetirementAnagramClue] = []
    seen_words: set[str] = set()
    # Two words built from one letter set print two scrambles a reader cannot
    # tell apart, and the answer page can only be right about one of them.
    seen_letters: set[str] = set()

    for entry in raw_items:
        if not isinstance(entry, dict):
            continue
        word = re.sub(r"[^A-Z]", "", str(entry.get("word", "")).strip().upper())
        clue = " ".join(str(entry.get("clue", "")).split()).rstrip(".…").strip()
        if not word or not _word_re().match(word):
            continue
        if len(word) < min_len or len(word) > max_len:
            continue
        if word in seen_words:
            continue
        letters = "".join(sorted(word))
        if letters in seen_letters:
            continue
        if not clue or len(clue) < min_clue:
            continue
        # The caller sized a printed column for this; a longer clue is a layout
        # bug waiting to happen, not a slightly imperfect clue.
        if len(clue) > max_clue_chars:
            continue
        if _clue_echoes_word(word, clue, stem_letters):
            continue
        seen_words.add(word)
        seen_letters.add(letters)
        out.append(RetirementAnagramClue(word=word, clue=clue[0].upper() + clue[1:]))
        if len(out) >= want:
            break
    return out


async def _call_gemini(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=RetirementAnagramModelOutput,
        label="retirement-anagram",
    )


async def generate_retirement_anagram(
    req: RetirementAnagramRequest, user_id: str
) -> RetirementAnagramResponse:
    _check_rate_limit(user_id)
    scope = _scope(req, user_id)
    prompt = with_variety(_build_prompt(req), scope, client_avoid=req.avoid)
    started = time.perf_counter()

    try:
        raw = await _call_gemini(prompt)
        items_raw = parse_string_items(raw)
    except RetirementAnagramGenerationError:
        raise
    except Exception as exc:
        logger.warning(
            "studio_retirement_anagram_generation_failed error=%s model=%s",
            exc,
            settings.STUDIO_GEMINI_MODEL,
            exc_info=True,
        )
        raise RetirementAnagramGenerationError(
            "Model did not return valid retirement-anagram JSON"
        ) from exc

    items = _normalize_items(
        items_raw,
        min_len=req.min_letters,
        max_len=req.max_letters,
        want=req.count,
        max_clue_chars=req.max_clue_chars,
    )
    # The browser filters again — dictionary collisions it can see and the
    # service cannot — so return a pool, not a page. Half the request is the
    # floor below which a retry is cheaper than laying out what came back.
    if len(items) < max(4, req.count // 2):
        raise RetirementAnagramGenerationError("model returned too few valid words")

    remember(scope, [item.word for item in items])

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "studio_retirement_anagram_generated model=%s latency_ms=%s item_count=%s "
        "letters=%s-%s theme=%s",
        settings.STUDIO_GEMINI_MODEL,
        elapsed_ms,
        len(items),
        req.min_letters,
        req.max_letters,
        req.theme[:40],
    )

    return RetirementAnagramResponse(items=items)


def build_prompt_for_tests(req: RetirementAnagramRequest) -> str:
    return _build_prompt(req)


def parse_json_for_tests(raw: str) -> list[Any]:
    return parse_string_items(raw)


def normalize_items_for_tests(
    raw_items: list[Any],
    *,
    min_len: int,
    max_len: int,
    want: int,
    max_clue_chars: int,
) -> list[RetirementAnagramClue]:
    return _normalize_items(
        raw_items,
        min_len=min_len,
        max_len=max_len,
        want=want,
        max_clue_chars=max_clue_chars,
    )
