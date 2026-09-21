"""Generate single themed words via Gemini for grid puzzles (word search, …).

Length bounds are caller-driven because a word only fits if it is shorter than the
grid it must be hidden in.
"""

from __future__ import annotations

import logging
import re
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_theme_words import (
    ThemeWordsModelOutput,
    ThemeWordsRequest,
    ThemeWordsResponse,
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

GAME = "theme-words"

_WORD_RE = re.compile(r"^[A-Z]+$")


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


@lru_cache(maxsize=1)
def _variety_hints() -> tuple[str, ...]:
    """Rotated by seed for variety — always subordinate to the user's theme."""
    return string_list(_config(), "varietyHints")


_rate_limiter = RateLimiter(
    label="themed word",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class ThemeWordsRateLimitError(StudioRateLimitError):
    """User exceeded the short-window themed-word generation quota."""


class ThemeWordsGenerationError(StudioGenerationError):
    """Model output could not be parsed into usable words."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise ThemeWordsRateLimitError(str(exc)) from exc


def _scope(req: ThemeWordsRequest, user_id: str) -> VarietyScope:
    """Theme plus letter range: the same pair yields the same word list."""
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.theme, f"{req.min_letters}-{req.max_letters}"),
        seed=req.seed,
    )


def _build_prompt(req: ThemeWordsRequest) -> str:
    theme = req.theme.strip()
    variety = rotate(_variety_hints(), req.seed)
    language_line = locale_line(section(_config(), "locale"), req.locale)
    want = req.item_count + int_value(_limits(), "overRequest")

    return f"""List {want} common single words for a word-search puzzle.
Theme (must match every word): {theme}
These words are hidden in a letter grid, so length is a hard constraint.
Seed for variety: {req.seed}. Within the theme only, {variety}.

STRICT theme fidelity — the puzzle is ruined if words drift off-theme:
- Every word must clearly belong to "{theme}". A reasonable adult should
  instantly agree it fits; near-misses and loose associations are rejected.
- Do NOT pad with animals, plants, foods, or objects from a different setting
  just to fill the count (e.g. for a beach theme: shell, towel, seagull, tide
  are fine; moose, owl, hyena, gibbon, turkey, toad, or freshwater fish are not).
- Return as many solid on-theme words as you can, up to {want}. Stay inside
  the theme — never jump to a different category to pad the list.

Length and form rules:
- Every word is {req.min_letters}-{req.max_letters} letters long. Count the
  letters before you write each one; a word outside that range is discarded.
- Letters A-Z only: one word per entry, no spaces, hyphens, accents, digits or
  punctuation.
- Everyday vocabulary an older adult would recognise on sight.
- No brand names, no proper nouns, no plurals of a word already listed.
- No duplicates.
{language_line}

Write the words in "items".
"""


def _normalize_words(
    raw_items: list[Any], *, min_letters: int, max_letters: int, want: int
) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for entry in raw_items:
        text = re.sub(r"[^A-Z]", "", str(entry).strip().upper())
        if not text or text in seen or not _WORD_RE.match(text):
            continue
        if len(text) < min_letters or len(text) > max_letters:
            continue
        seen.add(text)
        out.append(text)
        if len(out) >= want:
            break
    return out


async def generate_theme_words(
    req: ThemeWordsRequest, user_id: str
) -> ThemeWordsResponse:
    _check_rate_limit(user_id)
    started = time.perf_counter()

    items: list[str] = []
    last_error: Exception | None = None
    # Two attempts — production Gemini blips should not 502 the whole form.
    for attempt in range(2):
        try:
            attempt_req = req if attempt == 0 else req.model_copy(update={"seed": req.seed + attempt})
            # Scope follows the attempt seed, so a retry asks for a new angle too.
            raw = await _call_gemini(
                with_variety(
                    _build_prompt(attempt_req),
                    _scope(attempt_req, user_id),
                    client_avoid=req.avoid,
                )
            )
            items_raw = parse_string_items(raw)
            items = _normalize_words(
                items_raw,
                min_letters=req.min_letters,
                max_letters=req.max_letters,
                want=req.item_count,
            )
            if len(items) >= 3:
                break
            last_error = ThemeWordsGenerationError(
                "Could not get enough words that fit this letter range. "
                "Try a larger grid, fewer words, or a broader theme."
            )
            logger.warning(
                "studio_theme_words_too_few_items attempt=%s got=%s want=%s",
                attempt + 1,
                len(items),
                req.item_count,
            )
        except ThemeWordsGenerationError as exc:
            last_error = exc
            logger.warning(
                "studio_theme_words_attempt_failed attempt=%s error=%s",
                attempt + 1,
                exc,
            )
        except StudioGenerationError as exc:
            # Keep the upstream wording (key missing, truncated, blocked, …).
            last_error = ThemeWordsGenerationError(str(exc))
            logger.warning(
                "studio_theme_words_gemini_failed attempt=%s error=%s",
                attempt + 1,
                exc,
            )
        except Exception as exc:
            last_error = ThemeWordsGenerationError(
                "Themed word generation failed. Please try again."
            )
            logger.warning(
                "studio_theme_words_generation_failed attempt=%s error=%s",
                attempt + 1,
                exc,
                exc_info=True,
            )

    if len(items) < 3:
        raise last_error or ThemeWordsGenerationError(
            "Could not get enough words that fit this letter range. "
            "Try a larger grid, fewer words, or a broader theme."
        )

    if len(items) < req.item_count:
        logger.warning(
            "studio_theme_words_partial_list got=%s want=%s theme=%s",
            len(items),
            req.item_count,
            req.theme[:40],
        )
    remember(_scope(req, user_id), items)

    logger.info(
        "studio_theme_words_generated model=%s latency_ms=%s item_count=%s theme=%s",
        settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        len(items),
        req.theme[:40],
    )
    return ThemeWordsResponse(items=items)


async def _call_gemini(prompt: str) -> str:
    """Seam for tests; keeps the shared client call in one place."""
    return await call_gemini_json(
        prompt=prompt,
        # A short word list does not need a large budget — keeps server latency down.
        max_output_tokens=1024,
        response_schema=ThemeWordsModelOutput,
        label="theme_words",
    )


# Test helpers (pure, no network)
def build_prompt_for_tests(req: ThemeWordsRequest) -> str:
    return _build_prompt(req)


def normalize_words_for_tests(
    raw_items: list[Any], *, min_letters: int, max_letters: int, want: int
) -> list[str]:
    return _normalize_words(
        raw_items, min_letters=min_letters, max_letters=max_letters, want=want
    )
