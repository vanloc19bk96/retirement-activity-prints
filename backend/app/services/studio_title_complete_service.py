"""Generate title-complete items via Gemini with legality + accuracy validation."""

from __future__ import annotations

import json
import logging
import random
import re
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_title_complete import (
    TitleCompleteModelOutput,
    TitleCompleteRequest,
    TitleCompleteResponse,
    TitleItem,
    TitleItemCategory,
)
from app.services.studio_gemini import (
    RateLimiter,
    StudioGenerationError,
    StudioRateLimitError,
    call_gemini_json,
    parse_json_object,
)
from app.services.prompt_data import (
    DATA_ROOT,
    float_value,
    int_value,
    load_config,
    locale_line,
    regex_pattern,
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

GAME = "titles"

_CURATED_DIR = DATA_ROOT / GAME


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


def max_title_words() -> int:
    return int_value(_limits(), "maxTitleWords")


def min_confidence() -> float:
    return float_value(_limits(), "minConfidence")


@lru_cache(maxsize=1)
def _blank_token() -> str:
    return str(_config()["blankToken"])


@lru_cache(maxsize=1)
def _lyric_signals() -> re.Pattern[str]:
    return regex_pattern(string_list(_config(), "lyricSignals"))


@lru_cache(maxsize=1)
def _answer_stopwords() -> frozenset[str]:
    """Blanking a stopword leaves nothing to recall."""
    return frozenset(string_list(_config(), "answerStopwords"))


@lru_cache(maxsize=1)
def _category_files() -> Mapping[str, str]:
    return section(_config(), "categoryFiles")


_rate_limiter = RateLimiter(
    label="title-complete",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class TitleCompleteRateLimitError(StudioRateLimitError):
    """User exceeded the short-window title-complete generation quota."""


class TitleCompleteGenerationError(StudioGenerationError):
    """Model output could not be turned into a valid title-complete page."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise TitleCompleteRateLimitError(str(exc)) from exc


def _norm(title: str) -> str:
    return re.sub(r"\s+", " ", title).strip().casefold()


def _answer_parts(answer: str) -> list[str]:
    return [p.strip() for p in re.split(r"\s*/\s*", answer) if p.strip()]


def _blank_out(full: str, answer: str) -> str | None:
    display = full
    for part in _answer_parts(answer):
        if part not in display:
            return None
        display = display.replace(part, _blank_token(), 1)
    if _blank_token() not in display:
        return None
    # Blank-only lines give the reader nothing to complete.
    if not _has_visible_cue(display):
        return None
    return display


def _has_visible_cue(display: str) -> bool:
    without_blanks = display.replace(_blank_token(), "")
    return bool(re.search(r"[A-Za-z0-9]", without_blanks))


def _restore(display: str, answer: str) -> str | None:
    result = display
    for part in _answer_parts(answer):
        if _blank_token() not in result:
            return None
        result = result.replace(_blank_token(), part, 1)
    if _blank_token() in result:
        return None
    return result


def _item_category(raw: dict[str, Any], req: TitleCompleteRequest) -> TitleItemCategory:
    candidate = str(raw.get("category", "")).strip().casefold()
    if candidate in string_list(_config(), "itemCategories"):
        return candidate  # type: ignore[return-value]
    fallback = section(_config(), "categoryItemFallback").get(req.category)
    if fallback:
        return fallback  # type: ignore[return-value]
    # "mixed" and custom focus phrases — trust the model label when present above.
    return str(_config()["defaultItemCategory"])  # type: ignore[return-value]


def _validate(items: list[dict[str, Any]], req: TitleCompleteRequest) -> list[TitleItem]:
    clean: list[TitleItem] = []
    seen: set[str] = set()
    max_blanks = int_value(_limits(), "maxBlanks")

    for raw in items:
        if not isinstance(raw, dict):
            continue
        full = str(raw.get("fullTitle", "")).strip()
        ans = str(raw.get("answer", "")).strip()
        if not full or not ans:
            continue
        confidence = float(raw.get("confidence", 0) or 0)
        if confidence < min_confidence():
            continue
        if len(full.split()) > max_title_words():
            continue
        if _lyric_signals().search(full):
            continue

        parts = _answer_parts(ans)
        if not parts or len(parts) > max_blanks:
            continue
        if any(p.casefold() in _answer_stopwords() for p in parts):
            continue
        if any(p not in full for p in parts):
            continue

        display = _blank_out(full, ans)
        if display is None:
            continue
        restored = _restore(display, ans)
        if restored != full:
            continue

        key = _norm(full)
        if key in seen:
            continue
        seen.add(key)

        year_raw = raw.get("year")
        year: int | None = None
        if year_raw is not None and str(year_raw).strip():
            try:
                year = int(year_raw)
            except (TypeError, ValueError):
                year = None

        clean.append(
            TitleItem(
                displayTitle=display,
                answer=ans,
                fullTitle=full,
                category=_item_category(raw, req),
                year=year,
            )
        )
    return clean


def _parse_titles_json(raw: str) -> list[dict[str, Any]]:
    items = parse_json_object(raw).get("items")
    if not isinstance(items, list):
        raise ValueError("missing items")
    return [it for it in items if isinstance(it, dict)]


def _build_prompt(req: TitleCompleteRequest, needed: int) -> str:
    config = _config()
    blank_rule = str(config["blankRule"])
    level = section(config, "difficultyLevels")[req.difficulty]
    era_lines = section(config, "eraLines")
    era_line = (
        str(era_lines["specific"]).format(era=req.era)
        if req.era and req.era != "any"
        else str(era_lines["any"])
    )
    category_lines = section(config, "categoryLines")
    key = (
        "preset"
        if req.category in string_list(config, "presetCategories")
        else "custom"
    )
    category_line = str(category_lines[key]).format(category=req.category)
    language_line = locale_line(section(config, "locale"), req.locale)
    stopword_examples = ", ".join(string_list(config, "promptStopwordExamples"))

    return f"""Generate {needed} "complete the title" items for a large-print puzzle book for older adults.

{category_line} {era_line} Difficulty: {req.difficulty} ({level}).
Seed for variety: {req.seed}.

STRICT RULES — this book is printed and sold:
- Use ONLY the TITLE of a well-known song, film or TV show.
- NEVER include song lyrics, a line from a song, a quotation, or any text beyond the title itself.
- NEVER ask for "the next line" of anything.
- Titles must be at most {max_title_words()} words.
- Write the title exactly as published — same words, same spelling, no subtitle,
  no "The" added or dropped. If unsure it is exactly right, skip it.
- Vary the works: do not concentrate on one artist, studio or franchise.
{language_line}

HOW THE BLANK WORKS:
- {blank_rule}
- "answer" is that word, copied character-for-character from "fullTitle". The
  page is built by finding "answer" inside "fullTitle" and replacing it, so an
  answer that does not appear there exactly is discarded.
- Pick a distinctive content word — never a stopword ({stopword_examples})
  and never the whole title. At least one visible word must remain as a cue.
- If the word appears twice in the title, choose a different word.

Set "category" to "song", "film" or "tv", "year" to the release year, and
"confidence" to your honest probability (0.0-1.0) that the title is exactly
right. Anything below {min_confidence()} is discarded, so do not inflate it.
"""


async def _call_gemini(prompt: str) -> str:
    """Seam for tests; keeps the shared client call in one place."""
    return await call_gemini_json(
        prompt=prompt,
        # Low temperature and a real thinking budget: an almost-right title is
        # worse than no title once it is printed.
        temperature=float_value(_limits(), "temperature"),
        thinking_level="low",
        # 20 titles + validation over-request needs headroom above 4k with thinking.
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=TitleCompleteModelOutput,
        label="title_complete",
    )


def _load_curated_file(filename: str) -> list[dict[str, Any]]:
    path = _CURATED_DIR / filename
    if not path.exists():
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        return []
    return [e for e in raw if isinstance(e, dict)]


def _load_curated_pool(req: TitleCompleteRequest) -> list[dict[str, Any]]:
    bank_key = req.category if req.category in _category_files() else "mixed"
    if bank_key == "mixed":
        pool: list[dict[str, Any]] = []
        for name in _category_files().values():
            pool.extend(_load_curated_file(name))
    else:
        pool = _load_curated_file(_category_files()[bank_key])

    if req.era and req.era != "any":
        filtered = [e for e in pool if str(e.get("era", "")) == req.era]
        if filtered:
            pool = filtered
    return pool


def _entry_to_item(entry: dict[str, Any], req: TitleCompleteRequest) -> TitleItem | None:
    full = str(entry.get("fullTitle", "")).strip()
    ans = str(entry.get("answer", "")).strip()
    if not full or not ans:
        return None
    display = _blank_out(full, ans)
    if display is None or _restore(display, ans) != full:
        return None
    year_raw = entry.get("year")
    year: int | None = None
    if year_raw is not None and str(year_raw).strip():
        try:
            year = int(year_raw)
        except (TypeError, ValueError):
            year = None
    return TitleItem(
        displayTitle=display,
        answer=ans,
        fullTitle=full,
        category=_item_category(entry, req),
        year=year,
    )


def _append_curated_items(
    existing: list[TitleItem],
    seen: set[str],
    pool: list[dict[str, Any]],
    req: TitleCompleteRequest,
) -> None:
    for entry in pool:
        if len(existing) >= req.item_count:
            return
        item = _entry_to_item(entry, req)
        if item is None:
            continue
        key = _norm(item.full_title)
        if key in seen:
            continue
        existing.append(item)
        seen.add(key)


def _top_up_from_curated(
    existing: list[TitleItem],
    req: TitleCompleteRequest,
) -> list[TitleItem]:
    if len(existing) >= req.item_count:
        return existing

    seen = {_norm(item.full_title) for item in existing}
    rng = random.Random(req.seed)

    primary = list(_load_curated_pool(req))
    rng.shuffle(primary)
    _append_curated_items(existing, seen, primary, req)

    # Some era slices have <20 hand-checked titles (e.g. 1990s=19). Widen to
    # the full category bank so itemCount can still be satisfied.
    if len(existing) < req.item_count and req.era and req.era != "any":
        wide = req.model_copy(update={"era": "any"})
        secondary = list(_load_curated_pool(wide))
        rng.shuffle(secondary)
        _append_curated_items(existing, seen, secondary, req)

    return existing


def _scope(req: TitleCompleteRequest, user_id: str) -> VarietyScope:
    """Category + era decide which titles the model reaches for first."""
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.category, req.era, req.difficulty),
        seed=req.seed,
    )


async def _generate_batch(
    req: TitleCompleteRequest, needed: int, seed: int, scope: VarietyScope
) -> list[TitleItem]:
    prompt = with_variety(
        _build_prompt(req, needed + int_value(_limits(), "overRequest")),
        scope.at_seed(seed),
        client_avoid=req.avoid,
    )
    raw = await _call_gemini(prompt)
    parsed = _parse_titles_json(raw)
    return _validate(parsed, req)


async def generate_title_complete(
    req: TitleCompleteRequest, user_id: str
) -> TitleCompleteResponse:
    _check_rate_limit(user_id)
    scope = _scope(req, user_id)
    started = time.perf_counter()
    raw_count = 0
    kept: list[TitleItem] = []

    try:
        batch = await _generate_batch(req, req.item_count, req.seed, scope)
        raw_count += len(batch)
        kept.extend(batch)

        if len(kept) < req.item_count:
            top_up = await _generate_batch(
                req, req.item_count - len(kept), req.seed + 1, scope
            )
            raw_count += len(top_up)
            seen = {_norm(item.full_title) for item in kept}
            for item in top_up:
                key = _norm(item.full_title)
                if key in seen:
                    continue
                kept.append(item)
                seen.add(key)
                if len(kept) >= req.item_count:
                    break
    except TitleCompleteGenerationError:
        raise
    except Exception as exc:
        logger.warning(
            "studio_title_complete_generation_failed",
            extra={
                "user_id": user_id,
                "model": settings.STUDIO_GEMINI_MODEL,
                "error": str(exc),
            },
        )
        kept = []

    before_curated = len(kept)
    kept = _top_up_from_curated(kept, req)
    if not kept:
        raise TitleCompleteGenerationError(
            "Model did not return valid title-complete JSON"
        )

    kept = kept[: req.item_count]
    drop_rate = 0.0
    if raw_count > 0:
        drop_rate = max(0.0, 1.0 - (before_curated / raw_count))

    remember(scope, (item.full_title for item in kept))

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "studio_title_complete_generated",
        extra={
            "user_id": user_id,
            "model": settings.STUDIO_GEMINI_MODEL,
            "latency_ms": elapsed_ms,
            "category": req.category,
            "era": req.era,
            "item_count": len(kept),
            "validation_drop_rate": round(drop_rate, 3),
            "curated_top_up": max(0, len(kept) - before_curated),
        },
    )

    return TitleCompleteResponse(items=kept)


# Test helpers (pure, no network)
def validate_title_items_for_tests(
    items: list[dict[str, Any]], req: TitleCompleteRequest
) -> list[TitleItem]:
    return _validate(items, req)


def parse_titles_json_for_tests(raw: str) -> list[dict[str, Any]]:
    return _parse_titles_json(raw)


def blank_out_for_tests(full: str, answer: str) -> str | None:
    return _blank_out(full, answer)


def restore_for_tests(display: str, answer: str) -> str | None:
    return _restore(display, answer)


def has_visible_cue_for_tests(display: str) -> bool:
    return _has_visible_cue(display)


def top_up_from_curated_for_tests(
    existing: list[TitleItem], req: TitleCompleteRequest
) -> list[TitleItem]:
    return _top_up_from_curated(existing, req)
