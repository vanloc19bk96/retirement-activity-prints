"""Generate Fallen Phrase (quotefall) sayings via Gemini.

A fallen phrase is a saying set into a fixed grid of write-in boxes, with each
column's letters jumbled underneath it. That makes the shape of a saying matter
more than its meaning: the grid is a rectangle, every row is stretched to the
full width at its word gaps, and a saying that will not wrap into that
rectangle has no page at all. So the prompt asks for letters *and* words, and
both are enforced here — a saying of the right length in the wrong number of
words is dropped exactly like one that is too long.

The word floor is the part that reads as a mistake and is not. A row is
stretched at its joints, so a row of two words has a single gap to absorb all
of its slack and a row of one word has none. About three words per row is what
the wrap needs, which is why a thirty-letter saying is asked for in eight words
rather than six.

Sayings must be public-domain style: traditional proverbs or plain original
lines. Attributed quotations are refused at prompt level because the output is
printed and sold on KDP.
"""

from __future__ import annotations

import logging
import re
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_fallen_phrase import (
    FallenPhraseModelOutput,
    FallenPhraseRequest,
    FallenPhraseResponse,
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

GAME = "fallen-phrase"


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


def _band(length: str) -> Mapping[str, Any]:
    """Mirrors BANDS in frontend/src/utils/studio/fallen-phrase/content.ts."""
    return section(section(_config(), "bands"), length)


@lru_cache(maxsize=1)
def _angles() -> tuple[str, ...]:
    """Rotated by seed so two users on the same theme get different prompts."""
    return string_list(_config(), "varietyAngles")


_ALLOWED_RE = re.compile(r"^[A-Z]+(?: [A-Z]+)*$")

_rate_limiter = RateLimiter(
    label="fallen-phrase",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class FallenPhraseRateLimitError(StudioRateLimitError):
    """User exceeded the short-window fallen-phrase generation quota."""


class FallenPhraseGenerationError(StudioGenerationError):
    """Model output could not be parsed into usable sayings."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise FallenPhraseRateLimitError(str(exc)) from exc


def _scope(req: FallenPhraseRequest, user_id: str) -> VarietyScope:
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


def _build_prompt(req: FallenPhraseRequest) -> str:
    band = _band(req.length)
    angle = rotate(_angles(), req.seed)
    language_line = locale_line(section(_config(), "locale"), req.locale)
    want = _candidate_count(req.item_count)
    rows = int_value(band, "rows")
    max_word = int_value(_limits(), "maxWordLetters")

    return f"""Write {want} original retirement sayings about: {req.theme.strip()}.
Each one is printed into a grid of {rows} rows of letter boxes, so its shape
matters as much as its sense. Seed for variety: {req.seed}. Lean towards
{angle} where it suits the theme.

Shape (hard constraints — count before writing):
- {int_value(band, "minLetters")}-{int_value(band, "maxLetters")} letters in total, spaces not counted.
- {int_value(band, "minWords")}-{int_value(band, "maxWords")} words. Plenty of short, everyday words is exactly right.
- No word longer than {max_word} letters.

Rules:
- Original wording only. Retirement-related, positive, warm, adult-friendly.
- Never quote a book, film, song, speech, slogan, or a named person. No attributions.
- No famous quotes, lyrics, brands, franchises, politics, medical claims, or adult content.
- Letters A-Z and single spaces only: no digits, punctuation, apostrophes, or quotes.
  Write "IT IS" rather than "ITS", and "DO NOT" rather than "DONT".
- Each saying must make sense on its own and must not repeat another one.
{language_line}

Write the sayings in "items".
"""


def _letter_count(text: str) -> int:
    return sum(1 for ch in text if ch != " ")


def _normalize_sayings(raw_items: list[Any], *, length: str, want: int) -> list[str]:
    band = _band(length)
    min_letters = int_value(band, "minLetters")
    max_letters = int_value(band, "maxLetters")
    min_words = int_value(band, "minWords")
    max_words = int_value(band, "maxWords")
    max_word_letters = int_value(_limits(), "maxWordLetters")

    seen: set[str] = set()
    out: list[str] = []
    for entry in raw_items:
        text = re.sub(r"[^A-Z ]", " ", str(entry).strip().upper())
        text = re.sub(r"\s+", " ", text).strip()
        if not text or text in seen or not _ALLOWED_RE.match(text):
            continue
        words = text.split(" ")
        if len(words) < min_words or len(words) > max_words:
            continue
        if any(len(word) > max_word_letters for word in words):
            continue
        letters = _letter_count(text)
        if letters < min_letters or letters > max_letters:
            continue
        seen.add(text)
        out.append(text)
        if len(out) >= want:
            break
    return out


async def generate_fallen_phrase(
    req: FallenPhraseRequest, user_id: str
) -> FallenPhraseResponse:
    _check_rate_limit(user_id)
    scope = _scope(req, user_id)
    started = time.perf_counter()

    try:
        raw = await _call_gemini(
            with_variety(_build_prompt(req), scope, client_avoid=req.avoid)
        )
        items_raw = parse_string_items(raw)
    except FallenPhraseGenerationError:
        raise
    except Exception as exc:
        logger.warning(
            "studio_fallen_phrase_generation_failed error=%s", exc, exc_info=True
        )
        raise FallenPhraseGenerationError(
            "Model did not return valid fallen phrase JSON"
        ) from exc

    items = _normalize_sayings(
        items_raw, length=req.length, want=_candidate_count(req.item_count)
    )
    if len(items) < req.item_count:
        logger.warning(
            "studio_fallen_phrase_too_few_items got=%s want=%s length=%s",
            len(items),
            req.item_count,
            req.length,
        )
        raise FallenPhraseGenerationError("model returned too few usable sayings")

    remember(scope, items)

    logger.info(
        "studio_fallen_phrase_generated model=%s latency_ms=%s item_count=%s length=%s theme=%s",
        settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        len(items),
        req.length,
        req.theme[:40],
    )
    return FallenPhraseResponse(items=items)


async def _call_gemini(prompt: str) -> str:
    """Seam for tests; keeps the shared client call in one place."""
    return await call_gemini_json(
        prompt=prompt,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=FallenPhraseModelOutput,
        label="fallen-phrase",
    )


# Test helpers (pure, no network)
def build_prompt_for_tests(req: FallenPhraseRequest) -> str:
    return _build_prompt(req)


def parse_fallen_phrase_json_for_tests(raw: str) -> dict[str, Any]:
    return parse_json_object(raw)


def normalize_sayings_for_tests(
    raw_items: list[Any], *, length: str, want: int
) -> list[str]:
    return _normalize_sayings(raw_items, length=length, want=want)
