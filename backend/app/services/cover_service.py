from __future__ import annotations

import io
import logging
import uuid
from typing import Optional

from PIL import Image

from app.core.config import settings
from app.schemas.cover import CoverDimensions, GenerateCoverRequest
from app.services.book_cover_aspect_ratio_mapper import map_cover_ratio_to_aspect_ratio
from app.services.book_cover_image_resizer import resize_image_bytes_exact
from app.services.cover_prompt import build_prompt
from app.services.grsaiapi_image_provider import generate_raw_image_bytes as grsai_generate_raw
from app.services.storage_service import upload_user_image_bytes

logger = logging.getLogger(__name__)

_COVER_AI_SYSTEM_INSTRUCTION: str | None = None


class CoverGenerationError(Exception):
    def __init__(self, error_code: str, message: str) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.message = message


def _resize_to_dimensions(image_bytes: bytes, dimensions: CoverDimensions) -> bytes:
    image = Image.open(io.BytesIO(image_bytes))
    if image.size == (dimensions.width_px, dimensions.height_px):
        return image_bytes
    return resize_image_bytes_exact(
        image_bytes,
        width=dimensions.width_px,
        height=dimensions.height_px,
    )


class CoverService:
    def __init__(self) -> None:
        self.generation_max_attempts = max(1, int(settings.GEMINI_GENERATION_MAX_ATTEMPTS))
        self.generation_backoff_base_seconds = max(
            0.1,
            float(settings.GEMINI_GENERATION_BACKOFF_BASE_SECONDS),
        )

    def generate_cover(
        self,
        *,
        request: GenerateCoverRequest,
        user_id: str,
    ) -> dict[str, str]:
        dimensions = request.cover_dimensions
        aspect_ratio = map_cover_ratio_to_aspect_ratio(
            dimensions.width_px / dimensions.height_px,
        )
        prompt = build_prompt(
            request.description,
            request.title,
            request.subtitle,
            request.author,
        )

        try:
            raw_bytes = grsai_generate_raw(
                prompt,
                aspect_ratio=aspect_ratio,
                system_instruction=_COVER_AI_SYSTEM_INSTRUCTION,
                max_attempts=self.generation_max_attempts,
                backoff_base_seconds=self.generation_backoff_base_seconds,
            )
        except Exception as exc:
            logger.exception("cover_ai_generation_failed")
            raise CoverGenerationError(
                "AI_GENERATION_FAILED",
                "Failed to generate cover artwork. Please try again.",
            ) from exc

        try:
            final_bytes = _resize_to_dimensions(raw_bytes, dimensions)
        except Exception as exc:
            logger.exception("cover_resize_failed")
            raise CoverGenerationError(
                "AI_GENERATION_FAILED",
                "Generated artwork but failed to resize for print. Please try again.",
            ) from exc

        generation_id = uuid.uuid4().hex[:12]
        try:
            uploaded = upload_user_image_bytes(
                image_bytes=final_bytes,
                user_id=user_id,
                content_type="image/png",
            )
        except Exception as exc:
            logger.exception("cover_image_upload_failed")
            raise CoverGenerationError(
                "STORAGE_UPLOAD_FAILED",
                "Generated cover artwork but failed to save it. Please try again.",
            ) from exc

        return {
            "image_url": uploaded.public_url,
            "generation_id": generation_id,
        }


_cover_service: Optional[CoverService] = None


def get_cover_service() -> CoverService:
    global _cover_service
    if _cover_service is None:
        _cover_service = CoverService()
    return _cover_service
