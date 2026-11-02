"""OpenAI image generation provider.

Calls POST /v1/images/generations directly with aiohttp and exposes the same
functions as grsaiapi_image_provider, so callers only change their import.

When OpenAI fails after retries (or OPENAI_API_KEY is unset), each image falls
back to the GrsAI chain configured in Supabase ai_runtime_settings.

- Rate-limit (429) gets aggressive exponential backoff: 2^(attempt+1) seconds.
- Server and network errors get standard exponential backoff.
- Client errors (4xx except 429) are NOT retried.

API docs: https://developers.openai.com/api/docs/guides/image-generation
"""
from __future__ import annotations

import asyncio
import base64
import logging
import random
from typing import Any

import aiohttp

from app.core.config import settings
from app.services.book_cover_aspect_ratio_mapper import ASPECT_RATIO_PIXEL_DIMENSIONS
from app.services.grsaiapi_image_provider import (
    _run_async,
    async_generate_raw_image_bytes as grsai_async_generate_raw,
)

logger = logging.getLogger(__name__)

_OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations"
# OpenAI rejects custom sizes whose edges are not multiples of 16.
_SIZE_MULTIPLE = 16


def _get_api_key() -> str:
    api_key = (settings.OPENAI_API_KEY or "").strip()
    if not api_key:
        raise ValueError("Missing OpenAI API key (set OPENAI_API_KEY)")
    return api_key


def _round_to_size_multiple(pixels: int) -> int:
    return round(pixels / _SIZE_MULTIPLE) * _SIZE_MULTIPLE


def _map_aspect_ratio_to_size(aspect_ratio: str) -> str:
    dimensions = ASPECT_RATIO_PIXEL_DIMENSIONS.get(aspect_ratio)
    if dimensions is None:
        return "auto"
    width, height = dimensions
    return f"{_round_to_size_multiple(width)}x{_round_to_size_multiple(height)}"


def _join_prompt(prompt: str, system_instruction: str | None) -> str:
    cleaned_instruction = (system_instruction or "").strip()
    return f"{cleaned_instruction}\n\n{prompt}" if cleaned_instruction else prompt


def _extract_image_bytes(body: dict[str, Any]) -> bytes:
    items = body.get("data") or []
    encoded = items[0].get("b64_json") if items else None
    if not encoded:
        raise ValueError("OpenAI response contained no image data")
    return base64.b64decode(encoded)


async def _async_generate_openai(
    prompt: str,
    *,
    aspect_ratio: str,
    max_attempts: int,
    backoff_base_seconds: float,
) -> bytes:
    """Make one OpenAI image call with retry; return raw image bytes."""
    payload = {
        "model": settings.OPENAI_IMAGE_MODEL,
        "prompt": prompt,
        "size": _map_aspect_ratio_to_size(aspect_ratio),
        "quality": settings.OPENAI_IMAGE_QUALITY,
        "output_format": "png",
        # Pages and covers are printed, so transparent output is never wanted.
        "background": "opaque",
        "n": 1,
    }
    headers = {
        "Authorization": f"Bearer {_get_api_key()}",
        "Content-Type": "application/json",
    }
    timeout = aiohttp.ClientTimeout(total=settings.OPENAI_IMAGE_TIMEOUT_SECONDS)
    retries = max(1, max_attempts)

    async with aiohttp.ClientSession(headers=headers, timeout=timeout) as session:
        for attempt in range(1, retries + 1):
            is_last_attempt = attempt == retries
            try:
                async with session.post(_OPENAI_IMAGES_URL, json=payload) as resp:
                    if resp.status == 200:
                        return _extract_image_bytes(await resp.json())
                    status = resp.status
                    error_text = await resp.text()
            except (asyncio.TimeoutError, aiohttp.ClientError) as exc:
                if is_last_attempt:
                    raise
                wait = backoff_base_seconds * (2 ** (attempt - 1)) + random.uniform(0, 0.4)
                logger.warning(
                    "OpenAI network error attempt %s/%s (%s). Retrying in %.1fs.",
                    attempt,
                    retries,
                    exc,
                    wait,
                )
                await asyncio.sleep(wait)
                continue

            error = RuntimeError(f"OpenAI HTTP {status}: {error_text[:300]}")
            if is_last_attempt or (status != 429 and status < 500):
                raise error
            if status == 429:
                wait = 2 ** (attempt + 1) + random.uniform(0, 1.0)
            else:
                wait = backoff_base_seconds * (2 ** (attempt - 1)) + random.uniform(0, 0.4)
            logger.warning(
                "OpenAI HTTP %s attempt %s/%s. Retrying in %.1fs.",
                status,
                attempt,
                retries,
                wait,
            )
            await asyncio.sleep(wait)

    raise ValueError("OpenAI generation failed without a specific error")


async def _async_generate_with_fallback(
    prompt: str,
    *,
    aspect_ratio: str,
    max_attempts: int,
    backoff_base_seconds: float,
) -> bytes:
    """Try OpenAI; on failure, fall back to the GrsAI chain."""
    try:
        return await _async_generate_openai(
            prompt,
            aspect_ratio=aspect_ratio,
            max_attempts=max_attempts,
            backoff_base_seconds=backoff_base_seconds,
        )
    except Exception as exc:
        logger.warning(
            "OpenAI model=%s failed (%s); falling back to GrsAI",
            settings.OPENAI_IMAGE_MODEL,
            exc,
        )
    return await grsai_async_generate_raw(
        prompt,
        aspect_ratio=aspect_ratio,
        max_attempts=max_attempts,
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
    """Generate a single image via OpenAI - async version."""
    return await _async_generate_with_fallback(
        _join_prompt(prompt, system_instruction),
        aspect_ratio=aspect_ratio,
        max_attempts=max_attempts,
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
    """Generate multiple images concurrently, returned in prompt order."""
    semaphore = asyncio.Semaphore(max_concurrent)

    async def _bounded_generate(prompt: str) -> bytes:
        async with semaphore:
            return await _async_generate_with_fallback(
                _join_prompt(prompt, system_instruction),
                aspect_ratio=aspect_ratio,
                max_attempts=max_attempts,
                backoff_base_seconds=backoff_base_seconds,
            )

    return list(await asyncio.gather(*(_bounded_generate(prompt) for prompt in prompts)))


def generate_raw_image_bytes(
    prompt: str,
    *,
    aspect_ratio: str = "1:1",
    system_instruction: str | None = None,
    max_attempts: int = 3,
    backoff_base_seconds: float = 1.0,
) -> bytes:
    """Generate a single image via OpenAI (sync wrapper)."""
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
    """Generate multiple images concurrently via OpenAI (sync wrapper)."""
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
