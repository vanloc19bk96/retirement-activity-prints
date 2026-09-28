"""Shared Gemini plumbing for Studio content services.

Every studio_* content service goes through :func:`call_gemini_json`, so the
awkward parts of the Gemini contract live in exactly one place:

* **Thinking tokens.** Gemini 3 spends reasoning tokens out of the same
  ``max_output_tokens`` budget as the answer. Left on the default level a
  1600-token budget is eaten by thinking and the JSON body is cut off
  mid-object (``finish_reason=MAX_TOKENS``), which used to surface as a
  ``JSONDecodeError`` and a 502. Studio prompts are shape-constrained, so the
  cheapest thinking level is enough.
* **Structured output.** Callers pass a pydantic ``response_schema`` so the
  model cannot invent a different envelope.
* **Truncation.** If a response is still cut short we retry once with a bigger
  budget, then salvage the valid prefix rather than failing the whole page.
"""

from __future__ import annotations

import json
import logging
import re
import time
from collections import defaultdict, deque
from functools import lru_cache
from typing import Any

from app.core.config import settings
from app.services.prompt_data import load_template

logger = logging.getLogger(__name__)

_FENCE_RE = re.compile(r"^```(?:json)?\s*([\s\S]*?)\s*```$", re.IGNORECASE)
_DEFAULT_WINDOW_SECONDS = 60.0

# Cheapest Gemini 3 reasoning level: enough for "fill this schema", and it
# leaves the whole token budget for the JSON body.
DEFAULT_THINKING_LEVEL = "minimal"
DEFAULT_MAX_OUTPUT_TOKENS = 4096
# Ceiling for the automatic retry after a MAX_TOKENS truncation.
MAX_RETRY_OUTPUT_TOKENS = 16384

# Finish reasons that mean "the model refused", not "the model ran out of room".
_BLOCKED_REASONS = frozenset(
    {"SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "RECITATION", "SPII", "IMAGE_SAFETY"}
)

# Shared house rules for every Studio generation — see
# app/data/studio/shared/system-instruction.md.
SYSTEM_INSTRUCTION = load_template("shared", "system-instruction")


class StudioRateLimitError(Exception):
    """Caller exceeded the short-window generation quota."""


class StudioGenerationError(Exception):
    """Model output could not be turned into a usable payload."""


class StudioTruncatedError(StudioGenerationError):
    """Model hit the output-token ceiling and the JSON could not be salvaged."""


class StudioBlockedError(StudioGenerationError):
    """Model refused the prompt (safety, recitation, blocklist)."""


class RateLimiter:
    """Per-user sliding window. Process-local, so it scales with worker count.

    Idle users are swept once the table grows past ``sweep_threshold`` keys: the
    key is whatever user id the request carried, so without the sweep every id
    ever seen stayed in memory for the life of the worker.
    """

    def __init__(
        self,
        *,
        label: str,
        max_per_window: int,
        window_seconds: float = _DEFAULT_WINDOW_SECONDS,
        sweep_threshold: int = 1024,
    ) -> None:
        self._label = label
        self._max_per_window = max_per_window
        self._window_seconds = window_seconds
        self._sweep_threshold = max(1, sweep_threshold)
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def _sweep(self, now: float) -> None:
        stale = [
            user_id
            for user_id, hits in self._hits.items()
            if not hits or now - hits[-1] > self._window_seconds
        ]
        for user_id in stale:
            del self._hits[user_id]

    def check(self, user_id: str) -> None:
        now = time.monotonic()
        if len(self._hits) >= self._sweep_threshold and user_id not in self._hits:
            self._sweep(now)
            # Everyone still in the table is active; let the next sweep wait
            # until the table has doubled so a busy worker is not swept per call.
            self._sweep_threshold = max(self._sweep_threshold, len(self._hits) * 2)
        hits = self._hits[user_id]
        while hits and now - hits[0] > self._window_seconds:
            hits.popleft()
        if len(hits) >= self._max_per_window:
            raise StudioRateLimitError(
                f"Too many {self._label} requests. Please wait a minute and try again."
            )
        hits.append(now)

    def tracked_users(self) -> int:
        """Keys held right now (for tests and diagnostics)."""
        return len(self._hits)


# ---------------------------------------------------------------- JSON parsing


def strip_json_fences(raw: str) -> str:
    text = raw.strip()
    fence = _FENCE_RE.match(text)
    return fence.group(1).strip() if fence else text


def repair_truncated_json(text: str) -> str | None:
    """Close a JSON document that was cut off mid-write.

    Rewinds to the last point where a value was complete (a comma or a closing
    bracket at container level), drops the half-written tail, then closes every
    container that is still open. Returns ``None`` when there is no such point —
    e.g. the response died inside the very first value.

    Studio prompts over-request items precisely so a salvaged prefix is still a
    usable page.
    """
    stack: list[str] = []
    in_string = False
    escaped = False
    safe_cut: int | None = None
    safe_depth = 0

    for i, ch in enumerate(text):
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
        elif ch == "{":
            stack.append("}")
        elif ch == "[":
            stack.append("]")
        elif ch in "}]":
            if not stack or stack[-1] != ch:
                return None
            stack.pop()
            safe_cut, safe_depth = i + 1, len(stack)
        elif ch == ",":
            # Cut *before* the comma: everything up to here is a whole value.
            safe_cut, safe_depth = i, len(stack)

    if not stack:
        # Nothing was left open; the text is broken for some other reason.
        return None
    if safe_cut is None or safe_depth == 0:
        return None

    # Only pushes can happen after the final safe cut (a pop would have moved
    # it), so the bottom `safe_depth` closers are the ones still open there.
    repaired = text[:safe_cut] + "".join(reversed(stack[:safe_depth]))
    try:
        json.loads(repaired)
    except json.JSONDecodeError:
        return None
    return repaired


def coerce_json_text(raw: str) -> str:
    """Strip fences and, if the JSON is truncated, salvage the valid prefix."""
    text = strip_json_fences(raw)
    try:
        json.loads(text)
        return text
    except json.JSONDecodeError:
        pass

    repaired = repair_truncated_json(text)
    if repaired is None:
        raise StudioGenerationError("Model did not return valid JSON")
    logger.warning(
        "studio_gemini_json_repaired original_chars=%s kept_chars=%s",
        len(text),
        len(repaired),
    )
    return repaired


_EM_DASH_BEFORE_STOP_RE = re.compile(r"\s*—+\s*(?=[,.;:!?)\]]|$)")
_EM_DASH_AFTER_OPEN_RE = re.compile(r"(?:^|(?<=[(\[]))\s*—+\s*")
_EM_DASH_RE = re.compile(r"\s*—+\s*")


def soften_em_dashes(text: str) -> str:
    """Swap the em dash, a telltale of machine-written copy, for a comma.

    A dash that opens or closes a phrase is simply dropped; one between two
    clauses becomes ", ", which reads naturally in almost every sentence.
    """
    if "—" not in text:
        return text
    text = _EM_DASH_BEFORE_STOP_RE.sub("", text)
    text = _EM_DASH_AFTER_OPEN_RE.sub("", text)
    return _EM_DASH_RE.sub(", ", text)


def _soften_json_strings(value: Any) -> Any:
    if isinstance(value, str):
        return soften_em_dashes(value)
    if isinstance(value, list):
        return [_soften_json_strings(item) for item in value]
    if isinstance(value, dict):
        return {key: _soften_json_strings(item) for key, item in value.items()}
    return value


def soften_json_em_dashes(json_text: str) -> str:
    """Apply :func:`soften_em_dashes` to every string value in a JSON document."""
    if "—" not in json_text and "\\u2014" not in json_text.lower():
        return json_text
    return json.dumps(_soften_json_strings(json.loads(json_text)), ensure_ascii=False)


def parse_json_object(raw: str) -> dict[str, Any]:
    """Shape-check helper for services; raises ValueError so callers can wrap it."""
    try:
        data = json.loads(coerce_json_text(raw))
    except (StudioGenerationError, json.JSONDecodeError) as exc:
        raise ValueError("Model did not return valid JSON") from exc
    if not isinstance(data, dict):
        raise ValueError("Model did not return a JSON object")
    return data


def parse_string_items(raw: str) -> list[Any]:
    """Read the `{ "items": [...] }` envelope every studio prompt asks for."""
    data = parse_json_object(raw)
    items = data.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError("missing items")
    return items


# ------------------------------------------------------------- response reading


def response_text(resp: Any) -> str:
    """Extract text without raising on blocked or empty Gemini responses."""
    try:
        text = getattr(resp, "text", None)
        if isinstance(text, str) and text.strip():
            return text
    except Exception:
        pass
    for candidate in getattr(resp, "candidates", None) or []:
        content = getattr(candidate, "content", None)
        chunks = [
            part_text
            for part in getattr(content, "parts", None) or []
            # Thought summaries are separate parts; never splice them into JSON.
            if not getattr(part, "thought", False)
            and isinstance(part_text := getattr(part, "text", None), str)
            and part_text
        ]
        if chunks:
            return "".join(chunks)
    return ""


def finish_reason(resp: Any) -> str:
    for candidate in getattr(resp, "candidates", None) or []:
        reason = getattr(candidate, "finish_reason", None)
        if reason is None:
            continue
        return str(getattr(reason, "name", None) or reason)
    return ""


# ------------------------------------------------------------------ the call


@lru_cache(maxsize=4)
def _client(api_key: str, timeout_seconds: int) -> Any:
    from google import genai
    from google.genai import types

    return genai.Client(
        api_key=api_key,
        # Without a timeout a stalled upstream call pins a worker until the
        # proxy gives up on the browser instead.
        http_options=types.HttpOptions(timeout=timeout_seconds * 1000),
    )


def _thinking_config(types_mod: Any, model: str, level: str) -> Any | None:
    """Pick the thinking field the model actually accepts.

    Gemini 3 and floating ``*-latest`` aliases take ``thinking_level``.
    Explicit 2.x pins take ``thinking_budget``. Anything else gets no thinking
    field.

    Important: do **not** key off bare ``flash-lite``. The default studio model
    ``gemini-flash-lite-latest`` matches that substring but rejects
    ``thinking_budget`` with a generic 400 INVALID_ARGUMENT.
    """
    lowered = model.lower()
    if (
        "gemini-3" in lowered
        or lowered.endswith("-latest")
        or "-latest-" in lowered
    ):
        return types_mod.ThinkingConfig(thinking_level=level)
    if "2.5" in lowered or "2.0" in lowered:
        return types_mod.ThinkingConfig(thinking_budget=0)
    return None


def studio_model() -> str:
    return settings.STUDIO_GEMINI_MODEL


async def call_gemini_json(
    *,
    prompt: str,
    max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
    temperature: float = 0.9,
    response_schema: Any | None = None,
    thinking_level: str = DEFAULT_THINKING_LEVEL,
    system_instruction: str | None = SYSTEM_INSTRUCTION,
    model: str | None = None,
    label: str = "studio",
    soften_dashes: bool = True,
) -> str:
    """One JSON completion, retried once and salvaged if the model runs long.

    Em dashes in string values are rewritten (see :func:`soften_em_dashes`)
    unless ``soften_dashes`` is off for a caller that reads the dash itself.

    Returns text that is guaranteed to parse as JSON — callers keep their own
    shape validation, which is what turns a salvaged prefix into a short-but-
    usable page.
    """
    from google.genai import types

    api_key = settings.GEMINI_API_KEY
    if not api_key:
        raise StudioGenerationError("GEMINI_API_KEY is not configured")

    model_id = model or studio_model()
    client = _client(api_key, settings.STUDIO_GEMINI_TIMEOUT_SECONDS)

    async def once(budget: int, level: str) -> tuple[str, str]:
        def build(thinking: Any | None) -> Any:
            config = types.GenerateContentConfig(
                temperature=temperature,
                response_mime_type="application/json",
                max_output_tokens=budget,
                system_instruction=system_instruction,
                thinking_config=thinking,
            )
            if response_schema is not None:
                config.response_schema = response_schema
            return config

        # No seed: large studio seeds exceed Gemini INT32 and 400 the request.
        async def send(config: Any) -> Any:
            return await client.aio.models.generate_content(
                model=model_id, contents=prompt, config=config
            )

        thinking = _thinking_config(types, model_id, level)
        try:
            resp = await send(build(thinking))
        except Exception as exc:
            # STUDIO_*_MODEL can pin any id; one that rejects the thinking field
            # should still produce a page rather than 502 the whole request.
            # Gemini often returns a generic INVALID_ARGUMENT with no "thinking"
            # in the message, so any failure with a thinking config is retried
            # once without it.
            if thinking is None:
                raise
            logger.warning(
                "studio_gemini_thinking_unsupported model=%s error=%s", model_id, exc
            )
            resp = await send(build(None))
        return response_text(resp), finish_reason(resp)

    text, reason = await once(max_output_tokens, thinking_level)

    if reason in _BLOCKED_REASONS:
        raise StudioBlockedError(
            "The model declined this request. Try a different theme or wording."
        )

    if reason == "MAX_TOKENS":
        retry_budget = min(max_output_tokens * 2, MAX_RETRY_OUTPUT_TOKENS)
        logger.warning(
            "studio_gemini_truncated label=%s model=%s budget=%s retry_budget=%s",
            label,
            model_id,
            max_output_tokens,
            retry_budget,
        )
        if retry_budget > max_output_tokens:
            retry_text, retry_reason = await once(retry_budget, DEFAULT_THINKING_LEVEL)
            if retry_text.strip() and (
                retry_reason != "MAX_TOKENS" or len(retry_text) > len(text)
            ):
                text, reason = retry_text, retry_reason

    if not text.strip():
        # An empty body with MAX_TOKENS means thinking consumed the whole budget.
        if reason == "MAX_TOKENS":
            raise StudioTruncatedError(
                "The model ran out of room before writing an answer. "
                "Try again, or ask for fewer items."
            )
        raise StudioGenerationError("Model returned empty content")

    try:
        json_text = coerce_json_text(text)
        return soften_json_em_dashes(json_text) if soften_dashes else json_text
    except StudioGenerationError:
        if reason == "MAX_TOKENS":
            raise StudioTruncatedError(
                "The model's answer was cut off. Try again, or ask for fewer items."
            ) from None
        raise
