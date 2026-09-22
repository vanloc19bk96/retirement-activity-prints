"""Generate a retirement saying plus a word-search pool to hide it in via Gemini.

Everything here is printed and sold on KDP, so the gates below drop three kinds
of copy rather than set them: copy that puts a title at risk (brands, health
claims, finance advice), copy that talks down to the reader the book is for, and
words the puzzle itself cannot be honest about — palindromes and words nested
inside other words, both of which give a grid two right answers and an answer
key that circles one.

One rule is particular to this game. A hidden-message grid is filled exactly:
every cell the listed words do not claim holds one letter of the saying, in
reading order. So the saying's length is not a stylistic preference, it is the
thing the page was laid out around, and a saying outside the requested band is
rejected here rather than shipped for the client to fail on.
"""

from __future__ import annotations

import logging
import re
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_hidden_message import (
    HiddenMessageModelOutput,
    HiddenMessageRequest,
    HiddenMessageResponse,
)
from app.services.prompt_data import (
    int_value,
    load_config,
    locale_line,
    rotate,
    section,
    string_list,
)
from app.services.studio_gemini import (
    RateLimiter,
    StudioGenerationError,
    StudioRateLimitError,
    call_gemini_json,
    parse_json_object,
)
from app.services.studio_variety import (
    VarietyScope,
    bucket_key,
    remember,
    with_variety,
)

logger = logging.getLogger(__name__)

GAME = "hidden-message-word-search"
FINAL_ERROR = "Could not build a hidden-message word search. Try again, or pick a broader theme."
_LETTER_RE = re.compile(r"[^A-Z]")
_MEDICAL_RE = re.compile(
    r"\bprevent\s+dementia\b|\breverse\s+aging\b|\bcure\s+memory\s+loss\b|"
    r"\btreat\s+alzheimer|\bcure\s+alzheimer|\banti[\s-]?aging\s+cure\b|"
    r"\bmemory\s+loss\b",
    re.IGNORECASE,
)
_BRAND_RE = re.compile(
    r"\bnintendo\b|\bdisney\b|\bmarvel\b|\bstarbucks\b|\bmcdonald|"
    r"\bcoca[\s-]?cola\b|\bharry\s+potter\b|\btaylor\s+swift\b|\bstar\s+wars\b",
    re.IGNORECASE,
)
_FINANCE_RE = re.compile(
    r"\bguaranteed\s+(return|income|profit)|\binvest\s+now\b|\bget[\s-]?rich\b|"
    r"\bcrypto|\bbitcoin\b|\bday[\s-]?trad|\bpenny\s+stock|\bno[\s-]?risk\s+invest",
    re.IGNORECASE,
)
# Mirrors AGE_STEREOTYPE_PATTERNS in
# frontend/src/utils/studio/retirement-word-search/content-quality.ts.
_STEREOTYPE_RE = re.compile(
    r"\bfrail\b|\bforgetful\b|\bsenile\b|\bold[\s-]?timer\b|\bdecline\b|"
    r"\bfeeble\b|\buseless\b",
    re.IGNORECASE,
)


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


_rate_limiter = RateLimiter(
    label="hidden-message",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class HiddenMessageRateLimitError(StudioRateLimitError):
    """User exceeded the short-window hidden-message quota."""


class HiddenMessageGenerationError(StudioGenerationError):
    """Model output could not be turned into a usable saying plus word pool."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise HiddenMessageRateLimitError(str(exc)) from exc


def _scope(req: HiddenMessageRequest, user_id: str, seed: int) -> VarietyScope:
    """Same theme and same word band is what risks repeating an earlier page."""
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.theme, str(req.min_letters), str(req.max_letters)),
        seed=seed,
    )


def _letter_band(req: HiddenMessageRequest) -> tuple[int, int]:
    """The request's word band, clamped to what any grid this app draws holds."""
    low = max(int_value(_limits(), "minWordLetters"), req.min_letters)
    high = min(int_value(_limits(), "maxWordLetters"), req.max_letters)
    return low, max(low, high)


def _message_band(req: HiddenMessageRequest) -> tuple[int, int]:
    """The request's saying band, clamped to the hard bounds in prompt.json."""
    low = max(int_value(_limits(), "minMessageLetters"), req.min_message_letters)
    high = min(int_value(_limits(), "maxMessageLetters"), req.max_message_letters)
    return low, max(low, high)


def _letter_token(text: str) -> str:
    return _LETTER_RE.sub("", text.upper())


def normalize_message(raw: str, *, low: int, high: int) -> tuple[str, str] | None:
    """The saying as it prints, plus the A-Z run the leftover cells must spell."""
    display = re.sub(r"\s+", " ", (raw or "").strip())
    if not display:
        return None
    if _is_unsafe(display):
        return None
    letters = _letter_token(display)
    if len(letters) < low or len(letters) > high:
        return None
    return display, letters


def _is_unsafe(text: str) -> bool:
    return bool(
        _MEDICAL_RE.search(text)
        or _BRAND_RE.search(text)
        or _FINANCE_RE.search(text)
        or _STEREOTYPE_RE.search(text)
    )


def _normalize_word(raw: Any, *, low: int, high: int) -> tuple[str, str] | None:
    display = re.sub(r"\s+", " ", str(raw or "").strip())
    if not display:
        return None
    token = _letter_token(display)
    if len(token) < low or len(token) > high:
        return None
    letters_only = re.sub(r"[\s'’-]", "", display.upper())
    if letters_only != token:
        return None
    # A palindrome reads the same in both directions, so the grid holds two
    # correct answers and the key can only circle one of them.
    if token == token[::-1] or _is_unsafe(display):
        return None
    return display, token


def filter_word_pool(raw_words: list[Any], *, low: int, high: int, cap: int) -> list[str]:
    seen: set[str] = set()
    entries: list[tuple[str, str]] = []
    for raw in raw_words:
        normalized = _normalize_word(raw, low=low, high=high)
        if normalized is None:
            continue
        display, token = normalized
        if token in seen:
            continue
        seen.add(token)
        entries.append((display, token))

    # Longest first, so GARDENING survives and the GARDEN nested inside it goes.
    entries.sort(key=lambda item: (-len(item[1]), item[1]))
    kept: list[tuple[str, str]] = []
    for display, token in entries:
        if any(token in other_token for _other_display, other_token in kept):
            continue
        kept.append((display, token))
    return [display for display, _token in kept[:cap]]


def _min_pool(req: HiddenMessageRequest) -> int:
    """Below this the page cannot fill its grid, so the attempt is wasted.

    The client already over-requests: ``count`` is the candidate budget, not the
    number of words that print. A hidden-message page needs more of that budget
    to survive than a plain word search does, because which words happen to add
    up to the free cells is the whole difficulty.
    """
    return max(10, (req.count * 2) // 3)


def _parse_payload(raw: str) -> tuple[str, list[Any]]:
    data = parse_json_object(raw)
    message = data.get("message")
    words = data.get("words")
    if not isinstance(message, str) or not message.strip():
        raise ValueError("invalid JSON: missing message")
    if not isinstance(words, list) or not words:
        raise ValueError("invalid JSON: missing words")
    return message, words


def _build_prompt(
    req: HiddenMessageRequest,
    *,
    custom_message: str | None,
    seed: int | None = None,
) -> str:
    low, high = _letter_band(req)
    min_m, max_m = _message_band(req)
    want = min(int_value(_limits(), "poolSize"), req.count)
    tone_line = str(section(_config(), "tones")[req.tone])
    prompt_seed = req.seed if seed is None else seed
    angle = rotate(string_list(_config(), "varietyAngles"), prompt_seed)
    language = locale_line(section(_config(), "locale"), req.locale)

    if custom_message:
        message_rules = (
            f'The hidden saying is already chosen: "{custom_message}".\n'
            "- Return that exact string as "
            '"message". Write only the word pool.'
        )
    else:
        message_rules = (
            f"- Write one original retirement saying of {min_m} to {max_m} letters,\n"
            "  counting only A-Z and ignoring spaces and punctuation. Count before writing.\n"
            f"- Tone: {tone_line}.\n"
            "- Your own words: not a quotation, not song lyrics, not a real person's line."
        )

    return f"""Create a hidden-message word search about: {req.theme.strip()}.
Variety angle: {angle}

The saying:
{message_rules}

The word pool — {want} retirement words or short phrases on the same theme:
- {low} to {high} letters each, once spaces, apostrophes and hyphens are removed.
- Mix the lengths across that whole band. The grid is filled exactly, so a pool
  of one length cannot be made to add up.
- Every entry clearly fits the theme, and is warm and positive about later life.
- Familiar vocabulary an older adult would recognise on sight.
- Letters A-Z only. Two-word phrases are welcome; keep their space for display.
- Write each entry in Title Case, the way it should print in the word list.
- No duplicates, no palindromes, and no entry contained inside another entry.
- No brand names, copyrighted characters, health claims, or finance advice.
- Nothing about frailty, memory loss or decline. This book is for its reader.
{language}

Return JSON only: {{ "message": "Every Day Is Saturday Now", "words": ["Free Time", "Garden"] }}
"""


async def _call_gemini(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=HiddenMessageModelOutput,
        label="hidden_message",
    )


def _validate(
    message_raw: str,
    words_raw: list[Any],
    *,
    req: HiddenMessageRequest,
    custom_message: str | None,
) -> HiddenMessageResponse | None:
    low, high = _letter_band(req)
    min_m, max_m = _message_band(req)
    normalized = normalize_message(
        custom_message if custom_message else message_raw, low=min_m, high=max_m
    )
    if normalized is None:
        return None
    display, _letters = normalized
    words = filter_word_pool(words_raw, low=low, high=high, cap=req.count)
    if len(words) < _min_pool(req):
        return None
    return HiddenMessageResponse(message=display, words=words)


async def generate_hidden_message(
    req: HiddenMessageRequest, user_id: str
) -> HiddenMessageResponse:
    _check_rate_limit(user_id)

    min_m, max_m = _message_band(req)
    custom = None
    if req.custom_message and req.custom_message.strip():
        custom_norm = normalize_message(req.custom_message, low=min_m, high=max_m)
        if custom_norm is None:
            raise HiddenMessageGenerationError(
                f"The hidden message must be {min_m}-{max_m} letters, "
                "not counting spaces or punctuation."
            )
        custom = custom_norm[0]

    attempts = int_value(_limits(), "maxAttempts")
    last_error = FINAL_ERROR
    started = time.perf_counter()

    for attempt in range(attempts):
        seed = req.seed + attempt * 97
        scope = _scope(req, user_id, seed)
        prompt = with_variety(
            _build_prompt(req, custom_message=custom, seed=seed),
            scope,
            client_avoid=req.avoid,
        )
        try:
            raw = await _call_gemini(prompt)
            message_raw, words_raw = _parse_payload(raw)
        except Exception as exc:
            logger.warning(
                "studio_hidden_message_attempt_failed attempt=%s error=%s",
                attempt + 1,
                exc,
            )
            last_error = "The AI did not return a valid saying and word list. Please try again."
            continue

        result = _validate(message_raw, words_raw, req=req, custom_message=custom)
        if result is None:
            last_error = (
                "Could not get a valid saying and word pool. "
                "Try a broader theme, or a gentler level."
            )
            continue

        remember(scope, [result.message, *result.words])
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        logger.info(
            "studio_hidden_message_generated model=%s latency_ms=%s words=%s theme=%s",
            settings.STUDIO_GEMINI_MODEL,
            elapsed_ms,
            len(result.words),
            req.theme[:40],
        )
        return result

    raise HiddenMessageGenerationError(last_error)


def build_prompt_for_tests(req: HiddenMessageRequest) -> str:
    min_m, max_m = _message_band(req)
    custom = None
    if req.custom_message and req.custom_message.strip():
        normalized = normalize_message(req.custom_message, low=min_m, high=max_m)
        custom = normalized[0] if normalized else req.custom_message.strip()
    return _build_prompt(req, custom_message=custom)


def parse_payload_for_tests(raw: str) -> tuple[str, list[Any]]:
    return _parse_payload(raw)


def filter_word_pool_for_tests(
    raw_words: list[Any], *, low: int = 4, high: int = 8, cap: int = 40
) -> list[str]:
    return filter_word_pool(raw_words, low=low, high=high, cap=cap)
