"""Generate Word Ladder start/target pairs via Gemini.

The puzzle's promise — every rung a real word, exactly one solution — is proved
in the browser, which holds the dictionary and the solver. What a language model
is actually good at is the part the graph does badly: choosing two end words that
belong to a theme and read well together (COLD to WARM, HEAD to TAIL) instead of
whatever random pair the word list happened to connect.

So this service returns *candidates*, not finished puzzles. It enforces the rules
it can check without a dictionary (letters, length, and the arithmetic of how far
apart two words can be in N moves) and passes the model's suggested chain through
only when every rung of it holds up. The client re-checks everything against the
dictionary and falls back to its own solver for anything that does not.
"""

from __future__ import annotations

import logging
import re
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_word_ladder import (
    WordLadderModelOutput,
    WordLadderPair,
    WordLadderRequest,
    WordLadderResponse,
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

GAME = "word-ladder"

_NON_LETTERS = re.compile(r"[^A-Z]")

# Below this the sheet is barely themed and the client is better off with its
# own word list, so say so rather than printing one AI pair and five random ones.
MIN_USABLE_PAIRS = 2


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
    label="word ladder",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class WordLadderRateLimitError(StudioRateLimitError):
    """User exceeded the short-window word-ladder generation quota."""


class WordLadderGenerationError(StudioGenerationError):
    """Model output could not be parsed into usable pairs."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise WordLadderRateLimitError(str(exc)) from exc


def _scope(req: WordLadderRequest, user_id: str) -> VarietyScope:
    """Theme plus shape: the same three decide which words can come back."""
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.theme, req.word_length, req.steps),
        seed=req.seed,
    )


def _build_prompt(req: WordLadderRequest) -> str:
    theme = req.theme.strip()
    length = req.word_length
    steps = req.steps
    variety = rotate(_variety_hints(), req.seed)
    language_line = locale_line(section(_config(), "locale"), req.locale)
    want = req.pair_count + int_value(_limits(), "overRequest")
    example = (
        '{"start": "COLD", "target": "WARM", '
        '"path": ["COLD", "CORD", "WORD", "WARD", "WARM"]}'
    )

    return f"""List {want} word pairs for a word-ladder puzzle.
Theme (must match both words): {theme}
A word ladder climbs from the first word to the second by changing ONE letter at
a time, and every rung along the way is itself a real word.
Seed for variety: {req.seed}. Within the theme only, {variety}.

Hard rules for every pair:
- Both words are EXACTLY {length} letters. Count the letters before you write
  them; a word of any other length is discarded.
- Letters A-Z only: no spaces, hyphens, accents, digits or punctuation.
- The two words must differ, and they must differ in AT MOST {steps} positions —
  a ladder of {steps} moves cannot change more letters than that.
- Everyday vocabulary an older adult would recognise on sight. No brand names,
  no proper nouns, no abbreviations, no plurals of a word already listed.
- No duplicate pairs, and do not reuse a word in two pairs.

Theme fidelity — the sheet is ruined if the words drift off-theme:
- Both words should clearly belong to "{theme}". A reasonable adult should
  instantly agree they fit.
- Return as many solid on-theme pairs as you can, up to {want}. Stay inside the
  theme rather than padding the list from a different category.
{language_line}

For each pair also write "path": the full chain from start to target, including
both end words, as {steps + 1} words of {length} letters where each word differs
from the one before it in exactly one position. Every word in the chain must be a
real English word. If you cannot find a chain you are sure of, write "path": []
and keep the pair — a pair with no chain is still useful.

Write the pairs in "pairs", e.g. {example}.
"""


def _clean_word(value: Any, length: int) -> str:
    word = _NON_LETTERS.sub("", str(value).strip().upper())
    return word if len(word) == length else ""


def _hamming(a: str, b: str) -> int:
    return sum(1 for x, y in zip(a, b) if x != y)


def _clean_path(
    raw: Any, *, start: str, target: str, steps: int, length: int
) -> list[str]:
    """The model's chain, kept only if every rung of it holds up.

    Real-word-ness is the client's job (it has the dictionary); everything about
    the *shape* of the chain can be settled here, and a chain that fails it would
    only be thrown away after a round trip.
    """
    if not isinstance(raw, list) or len(raw) != steps + 1:
        return []
    path = [_clean_word(entry, length) for entry in raw]
    if not all(path) or len(set(path)) != len(path):
        return []
    if path[0] != start or path[-1] != target:
        return []
    if any(_hamming(path[i - 1], path[i]) != 1 for i in range(1, len(path))):
        return []
    return path


def _normalize_pairs(
    raw_pairs: list[Any], *, length: int, steps: int, want: int
) -> list[WordLadderPair]:
    seen_words: set[str] = set()
    out: list[WordLadderPair] = []
    for entry in raw_pairs:
        if not isinstance(entry, dict):
            continue
        start = _clean_word(entry.get("start"), length)
        target = _clean_word(entry.get("target"), length)
        if not start or not target or start == target:
            continue
        # More than `steps` differing letters cannot be walked in `steps` moves,
        # however good the dictionary is.
        if _hamming(start, target) > steps:
            continue
        if start in seen_words or target in seen_words:
            continue
        seen_words.add(start)
        seen_words.add(target)
        out.append(
            WordLadderPair(
                start=start,
                target=target,
                path=_clean_path(
                    entry.get("path"),
                    start=start,
                    target=target,
                    steps=steps,
                    length=length,
                ),
            )
        )
        if len(out) >= want:
            break
    return out


def _validate_shape(data: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(data.get("pairs"), list) or not data["pairs"]:
        raise ValueError("missing pairs")
    return data


def _parse_ladder_json(raw: str) -> dict[str, Any]:
    return _validate_shape(parse_json_object(raw))


async def _call_gemini(prompt: str) -> str:
    """Seam for tests; keeps the shared client call in one place."""
    return await call_gemini_json(
        prompt=prompt,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=WordLadderModelOutput,
        label="word_ladder",
    )


async def generate_word_ladder(
    req: WordLadderRequest, user_id: str
) -> WordLadderResponse:
    _check_rate_limit(user_id)
    scope = _scope(req, user_id)
    prompt = with_variety(_build_prompt(req), scope, client_avoid=req.avoid)
    started = time.perf_counter()

    try:
        raw = await _call_gemini(prompt)
        data = _parse_ladder_json(raw)
    except StudioGenerationError as exc:
        # Keep the upstream wording (key missing, truncated, blocked, …).
        logger.warning("studio_word_ladder_gemini_failed error=%s", exc)
        raise WordLadderGenerationError(str(exc)) from exc
    except Exception as exc:
        logger.warning(
            "studio_word_ladder_generation_failed error=%s", exc, exc_info=True
        )
        raise WordLadderGenerationError(
            "Model did not return valid word-ladder JSON"
        ) from exc

    pairs = _normalize_pairs(
        data["pairs"],
        length=req.word_length,
        steps=req.steps,
        want=req.pair_count,
    )
    if len(pairs) < min(MIN_USABLE_PAIRS, req.pair_count):
        logger.warning(
            "studio_word_ladder_too_few_pairs got=%s want=%s raw=%s",
            len(pairs),
            req.pair_count,
            data.get("pairs"),
        )
        raise WordLadderGenerationError(
            "Could not get enough themed words of this length. "
            "Try a broader theme, or a different word length."
        )

    remember(scope, [word for pair in pairs for word in (pair.start, pair.target)])

    logger.info(
        "studio_word_ladder_generated model=%s latency_ms=%s pairs=%s with_path=%s "
        "length=%s steps=%s theme=%s",
        settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        len(pairs),
        sum(1 for pair in pairs if pair.path),
        req.word_length,
        req.steps,
        req.theme[:40],
    )
    return WordLadderResponse(pairs=pairs)


# Test helpers (pure, no network)
def build_prompt_for_tests(req: WordLadderRequest) -> str:
    return _build_prompt(req)


def parse_ladder_json_for_tests(raw: str) -> dict[str, Any]:
    return _parse_ladder_json(raw)


def normalize_pairs_for_tests(
    raw_pairs: list[Any], *, length: int, steps: int, want: int
) -> list[WordLadderPair]:
    return _normalize_pairs(raw_pairs, length=length, steps=steps, want=want)
