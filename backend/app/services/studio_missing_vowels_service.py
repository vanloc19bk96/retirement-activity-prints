"""Generate retirement-themed missing-vowels answers via Gemini.

AI-only: no bundled fallback. Returns complete words/phrases; the sheet
masks A/E/I/O/U itself. Y is not treated as a vowel.
"""

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

GAME = "missing-vowels"
_VOWELS = frozenset("AEIOU")


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


def _length_for(difficulty: str) -> tuple[int, int]:
    low, high = section(_config(), "lengthByDifficulty")[difficulty]
    return int(low), int(high)


@lru_cache(maxsize=1)
def _angles() -> tuple[str, ...]:
    return string_list(_config(), "varietyAngles")


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
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.theme, req.difficulty),
        seed=req.seed,
    )


def _entry_text(entry: Any) -> str:
    if isinstance(entry, dict):
        return str(entry.get("answer") or entry.get("text") or "")
    return str(entry)


def _letter_token(text: str) -> str:
    return re.sub(r"[^A-Z]", "", text.upper())


def _mask_vowels(text: str) -> str:
    chars: list[str] = []
    for ch in text.upper():
        if ch == " ":
            chars.append(" ")
        elif ch in _VOWELS:
            chars.append("_")
        elif "A" <= ch <= "Z":
            chars.append(ch)
    return re.sub(r" +", " ", "".join(chars)).strip()


def _is_playable(token: str, masked: str) -> bool:
    vowels = sum(1 for ch in token if ch in _VOWELS)
    consonants = sum(1 for ch in token if "A" <= ch <= "Z" and ch not in _VOWELS)
    min_cons = int_value(_limits(), "minConsonants")
    if vowels < 1 or consonants < min_cons:
        return False
    if "_" not in masked:
        return False
    return len(masked.replace(" ", "")) == len(token)


def _build_prompt(req: MissingVowelsRequest) -> str:
    want = req.item_count * int_value(_limits(), "candidateMultiplier")
    min_len, max_len = _length_for(req.difficulty)
    max_words = int_value(_limits(), "maxPhraseWords")
    angle = rotate(_angles(), req.seed)
    language_line = locale_line(section(_config(), "locale"), req.locale)
    mix_line = (
        "Mostly single familiar words."
        if req.difficulty == "relaxed"
        else "Mix of single words and short two-word phrases."
    )
    return f"""List {want} complete English words or short phrases about: {req.theme.strip()}.
Focus angle for variety: {angle}.
Each entry will be printed with A E I O U replaced by blanks for a retirement activity book.
Seed for variety: {req.seed}.

Rules:
- Write everything COMPLETE, with all its vowels. The puzzle removes vowels later.
- {min_len}-{max_len} letters each (do not count spaces). A-Z only.
- One word, or a short phrase of at most {max_words} words.
- {mix_line}
- Familiar adult vocabulary, clearly related to the retirement theme.
- No brands, celebrities, fictional characters, copyrighted titles, or political names.
- No medical claims, offensive terms, or obscure vocabulary.
- No duplicates.
- Every entry must contain at least one vowel (A E I O U — Y is not a vowel)
  and at least two consonants.
{language_line}

Return JSON with "items": an array of {want} strings, e.g. "Gardening" or "Road Trip".
Never return already-blanked forms like "G_RD_N_NG".
"""


def _normalize_items(
    raw_items: list[Any],
    *,
    min_len: int,
    max_len: int,
    want: int,
) -> list[str]:
    max_words = int_value(_limits(), "maxPhraseWords")
    seen: set[str] = set()
    masks: set[str] = set()
    out: list[str] = []
    for entry in raw_items:
        text = _entry_text(entry).strip().upper()
        text = re.sub(r"[^A-Z\s]", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            continue
        words = text.split(" ")
        if len(words) < 1 or len(words) > max_words:
            continue
        token = _letter_token(text)
        if len(token) < min_len or len(token) > max_len:
            continue
        masked = _mask_vowels(text)
        if not _is_playable(token, masked):
            continue
        if token in seen or masked in masks:
            continue
        seen.add(token)
        masks.add(masked)
        out.append(text)
        if len(out) >= want:
            break
    return out


async def _call_gemini(prompt: str) -> str:
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
    want = req.item_count * int_value(_limits(), "candidateMultiplier")

    try:
        raw = await _call_gemini(prompt)
        items_raw = parse_string_items(raw)
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
        items_raw, min_len=min_len, max_len=max_len, want=want
    )
    if len(items) < max(8, req.item_count // 2):
        logger.warning(
            "studio_missing_vowels_too_few_items got=%s want=%s raw=%s",
            len(items),
            req.item_count,
            items_raw,
        )
        raise MissingVowelsGenerationError("model returned too few valid items")

    remember(scope, items)

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "studio_missing_vowels_generated model=%s latency_ms=%s item_count=%s theme=%s",
        settings.STUDIO_GEMINI_MODEL,
        elapsed_ms,
        len(items),
        req.theme[:40],
    )
    return MissingVowelsResponse(items=items)


def build_prompt_for_tests(req: MissingVowelsRequest) -> str:
    return _build_prompt(req)


def parse_mv_json_for_tests(raw: str) -> list[Any]:
    return parse_string_items(raw)


def normalize_items_for_tests(
    raw_items: list[Any],
    *,
    min_len: int,
    max_len: int,
    want: int,
) -> list[str]:
    return _normalize_items(
        raw_items, min_len=min_len, max_len=max_len, want=want
    )


def mask_vowels_for_tests(answer: str) -> str:
    return _mask_vowels(answer)
