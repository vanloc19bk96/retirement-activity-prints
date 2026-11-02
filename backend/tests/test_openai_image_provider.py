"""Tests for the OpenAI image provider (HTTP stubbed; no network)."""
from __future__ import annotations

import base64
from typing import Any

import pytest

from app.core.config import settings
from app.services import openai_image_provider as provider
from app.services.book_cover_aspect_ratio_mapper import ASPECT_RATIO_PIXEL_DIMENSIONS

IMAGE_BYTES = b"openai-image"
OK_RESPONSE = (200, {"data": [{"b64_json": base64.b64encode(IMAGE_BYTES).decode()}]})


class _FakeResponse:
    def __init__(self, status: int, body: Any) -> None:
        self.status = status
        self._body = body

    async def __aenter__(self) -> "_FakeResponse":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        return None

    async def json(self) -> Any:
        return self._body

    async def text(self) -> str:
        return str(self._body)


def _install_http(monkeypatch: pytest.MonkeyPatch, responses: list[Any]) -> list[dict[str, Any]]:
    """Stub aiohttp to replay responses; return the list of captured payloads."""
    payloads: list[dict[str, Any]] = []
    queue = iter(responses)

    class _FakeSession:
        def __init__(self, **_kwargs: Any) -> None:
            pass

        async def __aenter__(self) -> "_FakeSession":
            return self

        async def __aexit__(self, *_exc: object) -> None:
            return None

        def post(self, _url: str, *, json: dict[str, Any]) -> _FakeResponse:
            payloads.append(json)
            status, body = next(queue)
            return _FakeResponse(status, body)

    async def _no_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr(provider.aiohttp, "ClientSession", _FakeSession)
    monkeypatch.setattr(provider.asyncio, "sleep", _no_sleep)
    return payloads


def _install_fallback(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Stub the GrsAI fallback; return the list of prompts it received."""
    prompts: list[str] = []

    async def _fake_grsai(prompt: str, **_kwargs: Any) -> bytes:
        prompts.append(prompt)
        return b"grsai-image"

    monkeypatch.setattr(provider, "grsai_async_generate_raw", _fake_grsai)
    return prompts


@pytest.fixture(autouse=True)
def _api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "test-key")


def test_every_supported_ratio_maps_to_a_size_openai_accepts() -> None:
    for label in ASPECT_RATIO_PIXEL_DIMENSIONS:
        width, height = (int(edge) for edge in provider._map_aspect_ratio_to_size(label).split("x"))
        assert width % 16 == 0 and height % 16 == 0
        assert 1 / 3 <= width / height <= 3
        assert max(width, height) <= 3840
        assert 655_360 <= width * height <= 8_294_400


def test_unknown_ratio_lets_openai_choose_the_size() -> None:
    assert provider._map_aspect_ratio_to_size("7:3") == "auto"


def test_sends_configured_model_and_joined_prompt(monkeypatch: pytest.MonkeyPatch) -> None:
    payloads = _install_http(monkeypatch, [OK_RESPONSE])

    result = provider.generate_raw_image_bytes(
        "a cat", aspect_ratio="2:3", system_instruction="line art"
    )

    assert result == IMAGE_BYTES
    assert payloads[0]["model"] == "gpt-image-2.5-flare"
    assert payloads[0]["prompt"] == "line art\n\na cat"
    assert payloads[0]["size"] == "1024x1536"
    assert payloads[0]["background"] == "opaque"


@pytest.mark.parametrize("status", [429, 500])
def test_retries_rate_limits_and_server_errors(
    monkeypatch: pytest.MonkeyPatch, status: int
) -> None:
    payloads = _install_http(monkeypatch, [(status, "busy"), OK_RESPONSE])
    fallback = _install_fallback(monkeypatch)

    assert provider.generate_raw_image_bytes("a cat") == IMAGE_BYTES
    assert len(payloads) == 2
    assert fallback == []


def test_client_error_skips_retries_and_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    payloads = _install_http(monkeypatch, [(400, "bad request")])
    fallback = _install_fallback(monkeypatch)

    assert provider.generate_raw_image_bytes("a cat") == b"grsai-image"
    assert len(payloads) == 1
    assert fallback == ["a cat"]


def test_falls_back_once_retries_run_out(monkeypatch: pytest.MonkeyPatch) -> None:
    payloads = _install_http(monkeypatch, [(500, "down")] * 3)
    fallback = _install_fallback(monkeypatch)

    assert provider.generate_raw_image_bytes("a cat", max_attempts=3) == b"grsai-image"
    assert len(payloads) == 3
    assert fallback == ["a cat"]


def test_missing_key_falls_back_without_calling_openai(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "OPENAI_API_KEY", None)
    payloads = _install_http(monkeypatch, [])
    fallback = _install_fallback(monkeypatch)

    assert provider.generate_raw_image_bytes("a cat") == b"grsai-image"
    assert payloads == []
    assert fallback == ["a cat"]


def test_fallback_gets_instruction_exactly_once(monkeypatch: pytest.MonkeyPatch) -> None:
    _install_http(monkeypatch, [(400, "bad request")])
    fallback = _install_fallback(monkeypatch)

    provider.generate_raw_image_bytes("a cat", system_instruction="line art")

    assert fallback == ["line art\n\na cat"]


def test_batch_keeps_prompt_order(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_openai(prompt: str, **_kwargs: Any) -> bytes:
        return prompt.encode()

    monkeypatch.setattr(provider, "_async_generate_openai", _fake_openai)

    assert provider.generate_batch_raw_image_bytes(["a", "b", "c"]) == [b"a", b"b", b"c"]
