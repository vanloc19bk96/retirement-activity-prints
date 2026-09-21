"""Generate a retirement saying plus a word-search pool via Gemini."""

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
_LETTER_RE = re.compile(r"[^A-Z]")
_MEDICAL_RE = re.compile(
    r"\bprevent\s+dementia\b|\breverse\s+aging\b|\bcure\s+memory\s+loss\b|"
    r"\btreat\s+alzheimer|\bcure\s+alzheimer|\banti[\s-]?aging\s+cure\b",
    re.IGNORECASE,
)
_BRAND_RE = re.compile(
    r"\bnintendo\b|\bdisney\b|\bmarvel\b|\bstarbucks\b|\bmcDonald|"
    r"\bcoca[\s-]?cola\b|\bharry\s+potter\b|\btaylor\s+swift\b|\bstar\s+wars\b",
    re.IGNORECASE,
)
_FINANCE_RE = re.compile(
    r"\bguaranteed\s+(return|income|profit)|\binvest\s+now\b|\bget[\s-]?rich\b|"
    r"\bcrypto|\bbitcoin\b|\bday[\s-]?trad|\bpenny\s+stock|\bno[\s-]?risk\s+invest",
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
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.theme, req.tone, req.difficulty),
        seed=seed,
    )


def _letter_token(text: str) -> str:
    return _LETTER_RE.sub("", text.upper())


def normalize_message(raw: str) -> tuple[str, str] | None:
    display = re.sub(r"\s+", " ", (raw or "").strip())
    if not display:
        return None
    letters = _letter_token(display)
    low = int_value(_limits(), "minMessageLetters")
    high = int_value(_limits(), "maxMessageLetters")
    if len(letters) < low or len(letters) > high:
        return None
    return display, letters


def _is_palindrome(token: str) -> bool:
    return bool(token) and token == token[::-1]


def _is_unsafe(text: str) -> bool:
    return bool(_MEDICAL_RE.search(text) or _BRAND_RE.search(text) or _FINANCE_RE.search(text))


def _normalize_word(raw: Any) -> str | None:
    text = re.sub(r"\s+", " ", str(raw or "").strip())
    if not text:
        return None
    token = _letter_token(text)
    low = int_value(_limits(), "minWordLetters")
    high = int_value(_limits(), "maxWordLetters")
    if len(token) < low or len(token) > high:
        return None
    letters_only = re.sub(r"[\s'\u2019-]", "", text.upper())
    if letters_only != token:
        return None
    if _is_palindrome(token) or _is_unsafe(text):
        return None
    return text.upper()


def filter_word_pool(raw_words: list[Any]) -> list[str]:
    seen: set[str] = set()
    entries: list[tuple[str, str]] = []
    for raw in raw_words:
        display = _normalize_word(raw)
        if not display:
            continue
        token = _letter_token(display)
        if token in seen:
            continue
        seen.add(token)
        entries.append((display, token))
    entries.sort(key=lambda item: len(item[1]), reverse=True)
    kept: list[tuple[str, str]] = []
    for display, token in entries:
        if any(other[1].find(token) >= 0 for other in kept):
            continue
        kept.append((display, token))
    return [display for display, _token in kept]


def _min_pool(difficulty: str) -> int:
    listed = int(section(_config(), "listedWordsByDifficulty")[difficulty])
    return listed + 8


def _parse_payload(raw: str) -> tuple[str, list[Any]]:
    data = parse_json_object(raw)
    message = data.get("message")
    words = data.get("words")
    if not isinstance(message, str) or not message.strip():
        raise ValueError("invalid JSON: missing message")
    if not isinstance(words, list) or not words:
        raise ValueError("invalid JSON: missing words")
    return message, words


def _build_prompt(req: HiddenMessageRequest, *, custom_message: str | None) -> str:
    want = int_value(_limits(), "poolSize")
    min_w = int_value(_limits(), "minWordLetters")
    max_w = int_value(_limits(), "maxWordLetters")
    min_m = int_value(_limits(), "minMessageLetters")
    max_m = int_value(_limits(), "maxMessageLetters")
    tone_line = str(section(_config(), "tones")[req.tone])
    angle = rotate(string_list(_config(), "varietyAngles"), req.seed)
    language_line = locale_line(section(_config(), "locale"), req.locale)
    if custom_message:
        message_rules = (
            f'The secret saying is already chosen: "{custom_message}". '
            "Return that exact message string. Write only the word pool."
        )
    else:
        message_rules = (
            f'Write an original retirement saying of {min_m}-{max_m} letters '
            "(do not count spaces or punctuation). Tone: "
            f"{tone_line}. Not a quote, not song lyrics, not a real person's words."
        )
    return f"""Create a hidden-message word search about: {req.theme.strip()}.
Focus angle for variety: {angle}.
{message_rules}
Also list {want} single words or short phrases on the same theme.

Rules:
- words: {min_w}-{max_w} letters each (do not count spaces). A-Z only.
- Mix lengths, including some 3-4 letter words so the leftover count can match.
- Familiar adult vocabulary. No brand names, no finance advice, no health claims.
- No palindromes. No word that is contained inside another word in the list.
- No duplicates.
{language_line}

Return JSON only: {{ "message": "EVERY DAY IS SATURDAY NOW", "words": ["PENSION", "HAMMOCK"] }}
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
    custom_message: str | None,
    difficulty: str,
) -> HiddenMessageResponse | None:
    chosen = custom_message if custom_message else message_raw
    normalized = normalize_message(chosen)
    if normalized is None:
        return None
    display, _letters = normalized
    words = filter_word_pool(words_raw)
    if len(words) < _min_pool(difficulty):
        return None
    return HiddenMessageResponse(message=display, words=words)


async def generate_hidden_message(
    req: HiddenMessageRequest, user_id: str
) -> HiddenMessageResponse:
    _check_rate_limit(user_id)
    custom = None
    if req.custom_message and req.custom_message.strip():
        custom_norm = normalize_message(req.custom_message)
        if custom_norm is None:
            raise HiddenMessageGenerationError(
                "The secret saying must be 15–35 letters (not counting spaces or punctuation)."
            )
        custom = custom_norm[0]

    attempts = int_value(_limits(), "maxAttempts")
    last_error = "Could not build a hidden-message word search from this theme."
    started = time.perf_counter()

    for attempt in range(attempts):
        seed = req.seed + attempt * 97
        scope = _scope(req, user_id, seed)
        prompt = with_variety(_build_prompt(req, custom_message=custom), scope, client_avoid=req.avoid)
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

        result = _validate(
            message_raw,
            words_raw,
            custom_message=custom,
            difficulty=req.difficulty,
        )
        if result is None:
            last_error = (
                "Could not get a valid saying and word pool. "
                "Try a shorter saying or a broader theme."
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
    custom = None
    if req.custom_message and req.custom_message.strip():
        normalized = normalize_message(req.custom_message)
        custom = normalized[0] if normalized else req.custom_message.strip()
    return _build_prompt(req, custom_message=custom)


def parse_payload_for_tests(raw: str) -> tuple[str, list[Any]]:
    return _parse_payload(raw)


def filter_word_pool_for_tests(raw_words: list[Any]) -> list[str]:
    return filter_word_pool(raw_words)
