"""Generate Missing Vowels themed words or phrases via Gemini."""

from __future__ import annotations

import logging
import re
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_missing_vowels import (
    MissingVowelsModelOutput,
    MissingVowelsRequest,
    MissingVowelsResponse,
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
    section,
)
from app.services.studio_variety import (
    VarietyScope,
    bucket_key,
    remember,
    with_variety,
)

logger = logging.getLogger(__name__)

GAME = "missing-vowels"


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
def _phrase_re() -> re.Pattern[str]:
    max_words = int_value(_limits(), "maxPhraseWords")
    return re.compile(rf"^[A-Za-z]+(?:\s+[A-Za-z]+){{1,{max_words - 1}}}$")


def _length_for(difficulty: str) -> tuple[int, int]:
    low, high = section(_config(), "lengthByDifficulty")[difficulty]
    return int(low), int(high)


def _phrase_words_for(difficulty: str) -> tuple[int, int]:
    low, high = section(_config(), "phraseWordsByDifficulty")[difficulty]
    return int(low), int(high)


# Ask for spares so the length filters can drop rows and still fill the sheet.
_rate_limiter = RateLimiter(
    label="missing-vowels",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class MissingVowelsRateLimitError(StudioRateLimitError):
    """User exceeded the short-window missing-vowels generation quota."""


class MissingVowelsGenerationError(StudioGenerationError):
    """Model output could not be parsed into a valid missing-vowels payload."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise MissingVowelsRateLimitError(str(exc)) from exc


def _scope(req: MissingVowelsRequest, user_id: str) -> VarietyScope:
    """Same theme + kind + difficulty is what risks repeating earlier items."""
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.theme, req.kind, req.difficulty),
        seed=req.seed,
    )


def _build_prompt(req: MissingVowelsRequest) -> str:
    want = req.item_count + int_value(_limits(), "overRequest")
    language_line = locale_line(section(_config(), "locale"), req.locale)
    # The sheet strips the vowels itself, so the model must hand back complete
    # words — an earlier wording had it returning "R_N" and every row was dropped.
    strip_note = (
        "Write everything COMPLETE, with all its vowels. The puzzle removes the "
        "vowels later; if you remove them the entry is unusable."
    )
    if req.kind == "phrases":
        min_w, max_w = _phrase_words_for(req.difficulty)
        return f"""List {want} well-known short phrases or sayings about: {req.theme.strip()}.
{strip_note}
Seed for variety: {req.seed}.

Rules:
- {min_w}-{max_w} words each. Letters A-Z and single spaces only: no digits,
  punctuation, apostrophes, underscores or quotation marks.
- Familiar, everyday phrasing an older adult would complete from memory.
- No brand names, no proper nouns, no duplicates.
- Every word must keep at least two consonants once its vowels come out,
  or the solver has nothing to work from.
{language_line}

Write the phrases in "items", e.g. "HOME SWEET HOME" — never "H_M_ SW__T H_M_".
"""

    min_len, max_len = _length_for(req.difficulty)
    return f"""List {want} common words about: {req.theme.strip()}.
{strip_note}
Seed for variety: {req.seed}.

Rules:
- {min_len}-{max_len} letters each, A-Z only. Count the letters before writing.
- Everyday vocabulary an older adult would recognise on sight.
- No digits, punctuation or underscores.
- Every word must keep at least two consonants once its vowels come out,
  or the solver has nothing to work from.
- No brand names, no proper nouns, no duplicates.
{language_line}

Write the words in "items", e.g. "THUNDER" — never "TH_ND_R".
"""


def _validate_shape(data: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(data.get("items"), list) or not data["items"]:
        raise ValueError("missing items")
    return data


def _parse_mv_json(raw: str) -> dict[str, Any]:
    return _validate_shape(parse_json_object(raw))


def _normalize_items(
    raw_items: list[Any],
    *,
    kind: str,
    min_len: int,
    max_len: int,
    min_words: int,
    max_words: int,
    want: int,
) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for entry in raw_items:
        text = str(entry).strip().upper()
        text = re.sub(r"[^A-Z\s]", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        if not text or text in seen:
            continue
        if kind == "phrases":
            if not _phrase_re().match(text):
                continue
            words = text.split(" ")
            if len(words) < min_words or len(words) > max_words:
                continue
        else:
            if not _word_re().match(text):
                continue
            if len(text) < min_len or len(text) > max_len:
                continue
        seen.add(text)
        out.append(text)
        if len(out) >= want:
            break
    return out


async def _call_gemini(prompt: str) -> str:
    """Seam for tests; keeps the shared client call in one place."""
    return await call_gemini_json(
        prompt=prompt,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=MissingVowelsModelOutput,
        label="missing_vowels",
    )


async def generate_missing_vowels(
    req: MissingVowelsRequest, user_id: str
) -> MissingVowelsResponse:
    _check_rate_limit(user_id)
    scope = _scope(req, user_id)
    prompt = with_variety(_build_prompt(req), scope, client_avoid=req.avoid)
    started = time.perf_counter()
    min_len, max_len = _length_for(req.difficulty)
    min_words, max_words = _phrase_words_for(req.difficulty)

    try:
        raw = await _call_gemini(prompt)
        data = _parse_mv_json(raw)
    except MissingVowelsGenerationError:
        raise
    except Exception as exc:
        logger.warning(
            "studio_missing_vowels_generation_failed error=%s",
            exc,
            exc_info=True,
        )
        raise MissingVowelsGenerationError(
            "Model did not return valid missing-vowels JSON"
        ) from exc

    items = _normalize_items(
        data["items"],
        kind=req.kind,
        min_len=min_len,
        max_len=max_len,
        min_words=min_words,
        max_words=max_words,
        want=req.item_count,
    )
    if len(items) < max(5, req.item_count // 2):
        logger.warning(
            "studio_missing_vowels_too_few_items got=%s want=%s raw=%s",
            len(items),
            req.item_count,
            data.get("items"),
        )
        raise MissingVowelsGenerationError("model returned too few valid items")

    remember(scope, items)

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "studio_missing_vowels_generated model=%s latency_ms=%s item_count=%s kind=%s theme=%s",
        settings.STUDIO_GEMINI_MODEL,
        elapsed_ms,
        len(items),
        req.kind,
        req.theme[:40],
    )

    return MissingVowelsResponse(items=items)


# Test helpers (pure, no network)
def build_prompt_for_tests(req: MissingVowelsRequest) -> str:
    return _build_prompt(req)


def parse_mv_json_for_tests(raw: str) -> dict[str, Any]:
    return _parse_mv_json(raw)


def validate_mv_shape_for_tests(data: dict[str, Any]) -> dict[str, Any]:
    return _validate_shape(data)


def normalize_items_for_tests(
    raw_items: list[Any],
    *,
    kind: str,
    min_len: int,
    max_len: int,
    min_words: int,
    max_words: int,
    want: int,
) -> list[str]:
    return _normalize_items(
        raw_items,
        kind=kind,
        min_len=min_len,
        max_len=max_len,
        min_words=min_words,
        max_words=max_words,
        want=want,
    )
