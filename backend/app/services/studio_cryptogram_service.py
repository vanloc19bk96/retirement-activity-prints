"""Generate Cryptogram sayings via Gemini.

Sayings must be public-domain style: traditional proverbs or plain original lines.
Attributed quotations are refused at prompt level because the output is printed and
sold on KDP.
"""

from __future__ import annotations

import logging
import re
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_cryptogram import (
    CryptogramModelOutput,
    CryptogramRequest,
    CryptogramResponse,
)
from app.services.studio_gemini import (
    RateLimiter,
    StudioGenerationError,
    StudioRateLimitError,
    call_gemini_json,
    parse_json_object,
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

GAME = "cryptogram"


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


def _letter_range(length: str) -> tuple[int, int]:
    """Mirrors LENGTH_RANGE in frontend/src/utils/studio/cryptogram/content.ts."""
    low, high = section(_config(), "letterRange")[length]
    return int(low), int(high)


@lru_cache(maxsize=1)
def _angles() -> tuple[str, ...]:
    """Rotated by seed so two users on the same theme get different prompts."""
    return string_list(_config(), "varietyAngles")


_ALLOWED_RE = re.compile(r"^[A-Z]+(?: [A-Z]+)*$")

_rate_limiter = RateLimiter(
    label="cryptogram",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class CryptogramRateLimitError(StudioRateLimitError):
    """User exceeded the short-window cryptogram generation quota."""


class CryptogramGenerationError(StudioGenerationError):
    """Model output could not be parsed into usable sayings."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise CryptogramRateLimitError(str(exc)) from exc


def _scope(req: CryptogramRequest, user_id: str) -> VarietyScope:
    """Same theme + saying length is what risks repeating an earlier saying."""
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.theme, req.length),
        seed=req.seed,
    )


def _candidate_count(need: int) -> int:
    mapping = section(_config(), "candidateCounts")
    keyed = mapping.get(str(need))
    if keyed is not None:
        return int(keyed)
    return need + int_value(_limits(), "overRequest")


def _build_prompt(req: CryptogramRequest) -> str:
    min_letters, max_letters = _letter_range(req.length)
    limits = _limits()
    angle = rotate(_angles(), req.seed)
    language_line = locale_line(section(_config(), "locale"), req.locale)
    want = _candidate_count(req.item_count)
    # Letter budgets are what the sheet actually enforces; word counts are the
    # handle a model can steer by, so give both.
    min_words = max(
        int_value(limits, "minWords"),
        round(min_letters / int_value(limits, "minWordsLettersPerWord")),
    )
    max_words = min(
        int_value(limits, "maxWords"),
        max(min_words + 1, round(max_letters / int_value(limits, "maxWordsLettersPerWord"))),
    )

    return f"""Write {want} original retirement sayings about: {req.theme.strip()}.
Each one is enciphered letter-by-letter on a puzzle page, so its length matters.
Seed for variety: {req.seed}. Lean towards {angle} where it suits the theme.

Length (hard constraint — count before writing):
- {min_letters}-{max_letters} letters in total, spaces not counted.
- That is roughly {min_words}-{max_words} words. No word longer than
  {int_value(limits, "maxWordLetters")} letters.

Rules:
- Original wording only. Retirement-related, positive, warm, adult-friendly.
- Never quote a book, film, song, speech, slogan, or a named person. No attributions.
- No famous quotes, lyrics, brands, franchises, politics, medical claims, or adult content.
- Letters A-Z and single spaces only: no digits, punctuation, apostrophes, or quotes.
- Each saying must make sense on its own and must not repeat another one.
{language_line}

Write the sayings in "items".
"""


def _letter_count(text: str) -> int:
    return sum(1 for ch in text if ch != " ")


def _normalize_sayings(
    raw_items: list[Any], *, min_letters: int, max_letters: int, want: int
) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for entry in raw_items:
        text = re.sub(r"[^A-Z ]", " ", str(entry).strip().upper())
        text = re.sub(r"\s+", " ", text).strip()
        if not text or text in seen or not _ALLOWED_RE.match(text):
            continue
        words = text.split(" ")
        if len(words) < int_value(_limits(), "minWords") or len(words) > int_value(
            _limits(), "maxWords"
        ):
            continue
        if any(
            len(word) > int_value(_limits(), "maxWordLetters") for word in words
        ):
            continue
        letters = _letter_count(text)
        if letters < min_letters or letters > max_letters:
            continue
        seen.add(text)
        out.append(text)
        if len(out) >= want:
            break
    return out


async def generate_cryptogram(
    req: CryptogramRequest, user_id: str
) -> CryptogramResponse:
    _check_rate_limit(user_id)
    min_letters, max_letters = _letter_range(req.length)
    scope = _scope(req, user_id)
    started = time.perf_counter()

    try:
        raw = await _call_gemini(
            with_variety(_build_prompt(req), scope, client_avoid=req.avoid)
        )
        items_raw = parse_string_items(raw)
    except CryptogramGenerationError:
        raise
    except Exception as exc:
        logger.warning("studio_cryptogram_generation_failed error=%s", exc, exc_info=True)
        raise CryptogramGenerationError(
            "Model did not return valid cryptogram JSON"
        ) from exc

    items = _normalize_sayings(
        items_raw,
        min_letters=min_letters,
        max_letters=max_letters,
        want=_candidate_count(req.item_count),
    )
    if len(items) < req.item_count:
        logger.warning(
            "studio_cryptogram_too_few_items got=%s want=%s length=%s",
            len(items),
            req.item_count,
            req.length,
        )
        raise CryptogramGenerationError("model returned too few usable sayings")

    remember(scope, items)

    logger.info(
        "studio_cryptogram_generated model=%s latency_ms=%s item_count=%s length=%s theme=%s",
        settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        len(items),
        req.length,
        req.theme[:40],
    )
    return CryptogramResponse(items=items)


async def _call_gemini(prompt: str) -> str:
    """Seam for tests; keeps the shared client call in one place."""
    return await call_gemini_json(
        prompt=prompt,
        max_output_tokens=2048,
        response_schema=CryptogramModelOutput,
        label="cryptogram",
    )


# Test helpers (pure, no network)
def build_prompt_for_tests(req: CryptogramRequest) -> str:
    return _build_prompt(req)


def parse_cryptogram_json_for_tests(raw: str) -> dict[str, Any]:
    return parse_json_object(raw)


def normalize_sayings_for_tests(
    raw_items: list[Any], *, min_letters: int, max_letters: int, want: int
) -> list[str]:
    return _normalize_sayings(
        raw_items, min_letters=min_letters, max_letters=max_letters, want=want
    )
