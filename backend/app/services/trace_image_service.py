from __future__ import annotations

import uuid
from dataclasses import dataclass

import requests
from requests import RequestException

from app.services.storage_service import (
    delete_user_processed_object_by_public_url,
    upload_user_processed_image_bytes,
)
from app.services.trace_service import TraceService

_LOCALHOST_SUPABASE_API_PREFIXES: tuple[str, ...] = (
    "http://localhost:8000/",
    "http://127.0.0.1:8000/",
    "http://localhost:54321/",
    "http://127.0.0.1:54321/",
    "https://localhost:8443/",
    "https://127.0.0.1:8443/",
    "http://localhost:8443/",
    "http://127.0.0.1:8443/",
)


def _rewrite_localhost_storage_url_for_server_fetch(url: str, *, supabase_base_url: str) -> str:
    stripped = (url or "").strip()
    if not stripped:
        return stripped
    for prefix in _LOCALHOST_SUPABASE_API_PREFIXES:
        if stripped.startswith(prefix):
            remainder = stripped[len(prefix) :].lstrip("/")
            base = supabase_base_url.rstrip("/")
            return f"{base}/{remainder}" if remainder else base
    return stripped


@dataclass(frozen=True)
class TraceImageResult:
    public_url: str
    bucket: str
    path: str
    contours_count: int


class TraceImageService:
    def __init__(self, *, supabase_url: str) -> None:
        self.supabase_url = supabase_url

    def _download_image_bytes(self, source_url: str) -> bytes:
        normalized_source_url = (source_url or "").strip()
        if not normalized_source_url:
            raise ValueError("Image URL is required")
        if normalized_source_url.startswith("blob:") or normalized_source_url.startswith("data:"):
            raise ValueError("Unsupported image URL format. Please use a storage/public image URL.")

        rewritten = _rewrite_localhost_storage_url_for_server_fetch(
            normalized_source_url,
            supabase_base_url=self.supabase_url,
        )
        try:
            response = requests.get(rewritten, timeout=(10, 60))
            response.raise_for_status()
        except RequestException as exc:
            raise ValueError("Could not download selected image for trace generation.") from exc
        return response.content

    def generate_from_image_url(
        self,
        *,
        image_url: str,
        replace_image_url: str | None,
        user_id: str,
        line_color: str,
        thickness: float,
        dash_length: float,
        dash_gap: float,
        sensitivity: float,
    ) -> TraceImageResult:
        source_bytes = self._download_image_bytes(image_url)
        metadata, png_bytes = TraceService.generate_trace(
            image=source_bytes,
            line_color=line_color,
            thickness=thickness,
            dash_length=dash_length,
            dash_gap=dash_gap,
            sensitivity=sensitivity,
        )
        if not png_bytes:
            message = (
                str(metadata.get("message", "Trace generation failed"))
                if isinstance(metadata, dict)
                else "Trace generation failed"
            )
            raise ValueError(message)

        contours_count = 0
        if isinstance(metadata, dict) and metadata.get("contours_count") is not None:
            contours_count = int(metadata["contours_count"])

        filename = f"{uuid.uuid4()}.png"
        uploaded = upload_user_processed_image_bytes(
            image_bytes=png_bytes,
            filename=filename,
            user_id=user_id,
        )
        if replace_image_url:
            delete_user_processed_object_by_public_url(
                user_id=user_id,
                public_url=replace_image_url,
            )
        return TraceImageResult(
            public_url=uploaded.public_url,
            bucket=uploaded.bucket,
            path=uploaded.path,
            contours_count=contours_count,
        )
