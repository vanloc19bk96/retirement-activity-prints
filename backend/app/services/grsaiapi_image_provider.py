"""GrsAI API image generation provider.

Uses the GrsAI **direct call** API with aiohttp for async I/O, following
the recommended pattern from https://grsai.com (no submit+poll, no webhook).

Primary endpoint (Supabase ai_runtime_settings.grsai_primary_endpoint):
- "nano-banana"  -> POST /v1/draw/nano-banana  (model: grsai_nano_banana_model)
- "completions"  -> POST /v1/draw/completions  (model: grsai_completions_model)

When primary is completions, nano-banana is still used once as fallback after retries fail.

Key improvements over the previous submit+poll approach:
- Direct API call: the server blocks until the image is ready and returns
  the result in a single round-trip - eliminates polling overhead entirely.
- Async with aiohttp + asyncio.Semaphore: efficient I/O for batch generation,
  can handle dozens of concurrent requests in a single thread.
- Rate-limit (429) gets aggressive exponential backoff: 2^(attempt+1) seconds.
- Server errors (5xx) get standard exponential backoff.
- Client errors (4xx except 429) are NOT retried.

API docs: https://grsai.com/dashboard/models
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
from typing import Any

import aiohttp

from app.services.ai_runtime_settings_service import get_ai_runtime_settings

logger = logging.getLogger(__name__)

_DIRECT_CALL_TIMEOUT_SEC = 180
_DOWNLOAD_TIMEOUT_SEC = 60
_GPT_IMAGE_VALID_SIZES = {"auto", "1:1", "3:2", "2:3"}


def _get_api_key() -> str:
    api_key = get_ai_runtime_settings().grsai_api_key.strip()
    if not api_key:
        raise ValueError("Missing GRSAI API key (set retirement_activity_prints.ai_runtime_settings.grsai_api_key)")
    return api_key


def _get_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_get_api_key()}",
        "Content-Type": "application/json",
    }


def _map_aspect_ratio_to_gpt_image_size(aspect_ratio: str) -> str:
    if aspect_ratio in _GPT_IMAGE_VALID_SIZES:
        return aspect_ratio
    try:
        w_str, h_str = aspect_ratio.split(":")
        ratio = float(w_str) / float(h_str)
    except (ValueError, ZeroDivisionError):
        return "auto"
    if abs(ratio - 1.0) < 0.15:
        return "1:1"
    if ratio > 1.0:
        return "3:2"
    return "2:3"


def _extract_image_urls(body: dict[str, Any]) -> list[str]:
    """Extract image URLs from GrsAI API response (both direct-call and poll formats)."""
    data = body.get("data", body)
    urls: list[str] = []
    for item in data.get("results", []) or []:
        url = item.get("url")
        if url:
            urls.append(url)
    return urls


def _response_is_event_stream(resp: aiohttp.ClientResponse) -> bool:
    ct = (resp.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
    return "text/event-stream" in ct or "event-stream" in ct


async def _read_grsai_response_json(resp: aiohttp.ClientResponse) -> dict[str, Any]:
    """Parse JSON body; GrsAI /v1/draw/completions may return SSE instead of application/json."""
    if _response_is_event_stream(resp):
        return await _parse_sse_response_to_dict(resp)
    try:
        return await resp.json()
    except aiohttp.ContentTypeError:
        text = await resp.text()
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                f"GrsAI returned non-JSON body (mimetype={resp.content_type!r}): {text[:500]}"
            ) from exc


async def _parse_sse_response_to_dict(resp: aiohttp.ClientResponse) -> dict[str, Any]:
    """Read text/event-stream: collect `data:` JSON lines, return last payload with image URLs."""
    buffer = b""
    parsed_with_urls: dict[str, Any] | None = None
    last_parsed: dict[str, Any] | None = None

    async for chunk in resp.content.iter_any():
        buffer += chunk
        while True:
            nl = buffer.find(b"\n")
            if nl < 0:
                break
            raw_line = buffer[:nl]
            buffer = buffer[nl + 1 :]
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line or line.startswith(":"):
                continue
            if line.startswith("data:"):
                payload_str = line[5:].strip()
            else:
                payload_str = line
            if not payload_str or payload_str == "[DONE]":
                continue
            try:
                obj = json.loads(payload_str)
            except json.JSONDecodeError:
                logger.debug("GrsAI SSE skip non-JSON: %s...", payload_str[:120])
                continue
            if not isinstance(obj, dict):
                continue
            last_parsed = obj
            if _extract_image_urls(obj):
                parsed_with_urls = obj

    if parsed_with_urls is not None:
        return parsed_with_urls
    if last_parsed is not None:
        if last_parsed.get("code") not in (0, None):
            raise RuntimeError(
                f"GrsAI SSE error (code={last_parsed.get('code')}): {last_parsed.get('msg')}"
            )
        return last_parsed
    raise ValueError("GrsAI SSE stream contained no JSON payloads")


def _is_completions_primary() -> bool:
    return get_ai_runtime_settings().grsai_primary_endpoint == "completions"


def _resolve_nano_banana_endpoint_and_payload(
    *,
    aspect_ratio: str,
    base_url: str,
) -> tuple[str, str, dict[str, Any]]:
    model = get_ai_runtime_settings().grsai_nano_banana_model
    endpoint_url = f"{base_url}/v1/draw/nano-banana"
    extra: dict[str, Any] = {
        "aspectRatio": aspect_ratio,
        "imageSize": "1K",
    }
    return endpoint_url, model, extra


def _resolve_endpoint_and_payload(
    *,
    aspect_ratio: str,
    base_url: str,
) -> tuple[str, str, dict[str, Any]]:
    """Return (endpoint_url, model_name, extra_payload) from grsai_primary_endpoint."""
    runtime = get_ai_runtime_settings()

    if runtime.grsai_primary_endpoint == "completions":
        model = runtime.grsai_completions_model
        endpoint_url = f"{base_url}/v1/draw/completions"
        extra = {
            "size": _map_aspect_ratio_to_gpt_image_size(aspect_ratio),
            "variants": 1,
        }
        return endpoint_url, model, extra
    return _resolve_nano_banana_endpoint_and_payload(
        aspect_ratio=aspect_ratio,
        base_url=base_url,
    )


def _is_retryable_text(error: Exception) -> bool:
    txt = str(error).lower()
    return any(
        m in txt
        for m in (
            "resource exhausted",
            "deadline exceeded",
            "service unavailable",
            "temporarily unavailable",
            "internal error",
            "backend error",
            "server busy",
            "unavailable",
            "timeout",
            "retryable",
        )
    )


async def _async_generate_single(
    session: aiohttp.ClientSession,
    prompt: str,
    *,
    endpoint_url: str,
    model: str,
    payload_extra: dict[str, Any],
    retries: int,
    backoff_base_seconds: float,
) -> list[str]:
    """Make a single direct API call with retry; return image URLs."""
    payload: dict[str, Any] = {"model": model, "prompt": prompt, **payload_extra}
    last_error: Exception | None = None

    for attempt in range(1, retries + 1):
        try:
            async with session.post(endpoint_url, json=payload) as resp:
                if resp.status == 200:
                    body = await _read_grsai_response_json(resp)
                    if body.get("code") not in (0, None):
                        raise RuntimeError(f"GrsAI error (code={body.get('code')}): {body.get('msg')}")
                    urls = _extract_image_urls(body)
                    if not urls:
                        raise ValueError("Something went wrong, please try again.")
                    return urls

                error_text = await resp.text()
                last_error = RuntimeError(f"GrsAI HTTP {resp.status}: {error_text[:300]}")

                if resp.status == 429:
                    wait = 2 ** (attempt + 1) + random.uniform(0, 1.0)
                    logger.warning(
                        "GrsAI rate-limited (429) attempt %s/%s. Retrying in %.1fs.",
                        attempt,
                        retries,
                        wait,
                    )
                    await asyncio.sleep(wait)
                    continue

                if resp.status >= 500:
                    wait = backoff_base_seconds * (2 ** (attempt - 1)) + random.uniform(0, 0.4)
                    logger.warning(
                        "GrsAI server error %s attempt %s/%s. Retrying in %.1fs.",
                        resp.status,
                        attempt,
                        retries,
                        wait,
                    )
                    await asyncio.sleep(wait)
                    continue

                raise last_error

        except (asyncio.TimeoutError, aiohttp.ClientError, asyncio.CancelledError) as exc:
            last_error = exc
            if attempt < retries:
                wait = backoff_base_seconds * (2 ** (attempt - 1)) + random.uniform(0, 0.4)
                logger.warning(
                    "GrsAI network error attempt %s/%s (%s). Retrying in %.1fs.",
                    attempt,
                    retries,
                    exc,
                    wait,
                )
                await asyncio.sleep(wait)
            else:
                raise

        except Exception as exc:
            last_error = exc
            if attempt < retries and _is_retryable_text(exc):
                wait = backoff_base_seconds * (2 ** (attempt - 1)) + random.uniform(0, 0.4)
                logger.warning(
                    "GrsAI retryable error attempt %s/%s (%s). Retrying in %.1fs.",
                    attempt,
                    retries,
                    exc,
                    wait,
                )
                await asyncio.sleep(wait)
            else:
                raise

    if last_error is not None:
        raise last_error
    raise ValueError("GrsAI generation failed without a specific error")


async def _async_download_image(session: aiohttp.ClientSession, url: str) -> bytes:
    """Download image bytes from a GrsAI result URL."""
    download_timeout = aiohttp.ClientTimeout(total=_DOWNLOAD_TIMEOUT_SEC)
    async with session.get(url, timeout=download_timeout) as resp:
        if resp.status != 200:
            raise RuntimeError(f"Failed to download GrsAI image: HTTP {resp.status}")
        return await resp.read()


async def _async_generate_one_image(
    session: aiohttp.ClientSession,
    prompt: str,
    *,
    endpoint_url: str,
    model: str,
    payload_extra: dict[str, Any],
    retries: int,
    backoff_base_seconds: float,
) -> bytes:
    """Generate one image (call API + download) - returns raw bytes."""
    urls = await _async_generate_single(
        session,
        prompt,
        endpoint_url=endpoint_url,
        model=model,
        payload_extra=payload_extra,
        retries=retries,
        backoff_base_seconds=backoff_base_seconds,
    )
    return await _async_download_image(session, urls[0])


async def _async_generate_one_image_with_gpt_fallback(
    session: aiohttp.ClientSession,
    prompt: str,
    *,
    aspect_ratio: str,
    base_url: str,
    retries: int,
    backoff_base_seconds: float,
) -> bytes:
    """Try gpt-image completions; on failure, fall back to nano-banana."""
    primary_url, primary_model, primary_extra = _resolve_endpoint_and_payload(
        aspect_ratio=aspect_ratio,
        base_url=base_url,
    )
    try:
        return await _async_generate_one_image(
            session,
            prompt,
            endpoint_url=primary_url,
            model=primary_model,
            payload_extra=primary_extra,
            retries=retries,
            backoff_base_seconds=backoff_base_seconds,
        )
    except Exception as exc:
        if not _is_completions_primary():
            raise
        fb_url, fb_model, fb_extra = _resolve_nano_banana_endpoint_and_payload(
            aspect_ratio=aspect_ratio,
            base_url=base_url,
        )
        logger.warning(
            "GrsAI primary completions model=%s failed (%s); falling back to nano-banana model=%s",
            primary_model,
            exc,
            fb_model,
        )
        return await _async_generate_one_image(
            session,
            prompt,
            endpoint_url=fb_url,
            model=fb_model,
            payload_extra=fb_extra,
            retries=retries,
            backoff_base_seconds=backoff_base_seconds,
        )


async def async_generate_raw_image_bytes(
    prompt: str,
    *,
    aspect_ratio: str = "1:1",
    system_instruction: str | None = None,
    max_attempts: int = 3,
    backoff_base_seconds: float = 1.0,
) -> bytes:
    """Generate a single image via GrsAI direct call - async version."""
    base_url = get_ai_runtime_settings().grsai_base_url.rstrip("/")
    cleaned_instruction = (system_instruction or "").strip()
    full_prompt = f"{cleaned_instruction}\n\n{prompt}" if cleaned_instruction else prompt

    timeout = aiohttp.ClientTimeout(total=_DIRECT_CALL_TIMEOUT_SEC)
    async with aiohttp.ClientSession(headers=_get_headers(), timeout=timeout) as session:
        return await _async_generate_one_image_with_gpt_fallback(
            session,
            full_prompt,
            aspect_ratio=aspect_ratio,
            base_url=base_url,
            retries=max_attempts,
            backoff_base_seconds=backoff_base_seconds,
        )


async def async_generate_batch_raw_image_bytes(
    prompts: list[str],
    *,
    aspect_ratio: str = "1:1",
    system_instruction: str | None = None,
    max_attempts: int = 3,
    backoff_base_seconds: float = 1.0,
    max_concurrent: int = 10,
) -> list[bytes]:
    """Generate multiple images concurrently via GrsAI direct calls.

    Uses a shared aiohttp session and asyncio.Semaphore for concurrency control,
    following the batch pattern recommended by GrsAI docs.
    """
    base_url = get_ai_runtime_settings().grsai_base_url.rstrip("/")
    primary_url, primary_model, _ = _resolve_endpoint_and_payload(
        aspect_ratio=aspect_ratio,
        base_url=base_url,
    )
    cleaned_instruction = (system_instruction or "").strip()
    full_prompts = (
        [f"{cleaned_instruction}\n\n{prompt}" for prompt in prompts]
        if cleaned_instruction
        else prompts
    )
    semaphore = asyncio.Semaphore(max_concurrent)

    async def _bounded_generate(idx: int, prompt: str) -> tuple[int, bytes]:
        async with semaphore:
            if idx > 0:
                await asyncio.sleep(0.05 * idx)
            raw = await _async_generate_one_image_with_gpt_fallback(
                session,
                prompt,
                aspect_ratio=aspect_ratio,
                base_url=base_url,
                retries=max_attempts,
                backoff_base_seconds=backoff_base_seconds,
            )
            return idx, raw

    timeout = aiohttp.ClientTimeout(total=_DIRECT_CALL_TIMEOUT_SEC)
    async with aiohttp.ClientSession(headers=_get_headers(), timeout=timeout) as session:
        logger.info(
            "GrsAI batch: starting %d tasks (max_concurrent=%d, primary model=%s, endpoint=%s, nano-banana fallback enabled)",
            len(full_prompts),
            max_concurrent,
            primary_model,
            primary_url,
        )
        tasks = [_bounded_generate(i, prompt) for i, prompt in enumerate(full_prompts)]
        results = await asyncio.gather(*tasks)

    ordered = sorted(results, key=lambda x: x[0])
    return [raw for _, raw in ordered]


def _run_async(coro: Any) -> Any:
    """Run an async coroutine from a sync context, handling existing event loops."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)

    import concurrent.futures

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


def generate_raw_image_bytes(
    prompt: str,
    *,
    aspect_ratio: str = "1:1",
    system_instruction: str | None = None,
    max_attempts: int = 3,
    backoff_base_seconds: float = 1.0,
) -> bytes:
    """Generate a single image via GrsAI direct call (sync wrapper)."""
    return _run_async(
        async_generate_raw_image_bytes(
            prompt,
            aspect_ratio=aspect_ratio,
            system_instruction=system_instruction,
            max_attempts=max_attempts,
            backoff_base_seconds=backoff_base_seconds,
        )
    )


def generate_batch_raw_image_bytes(
    prompts: list[str],
    *,
    aspect_ratio: str = "1:1",
    system_instruction: str | None = None,
    max_attempts: int = 3,
    backoff_base_seconds: float = 1.0,
    max_concurrent: int = 10,
) -> list[bytes]:
    """Generate multiple images concurrently via GrsAI direct calls (sync wrapper)."""
    return _run_async(
        async_generate_batch_raw_image_bytes(
            prompts,
            aspect_ratio=aspect_ratio,
            system_instruction=system_instruction,
            max_attempts=max_attempts,
            backoff_base_seconds=backoff_base_seconds,
            max_concurrent=max_concurrent,
        )
    )
