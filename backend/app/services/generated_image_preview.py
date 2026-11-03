"""Light copy of a generated image for the AI panel; the full file stays the one placed and printed."""

from __future__ import annotations

import io
import logging

from PIL import Image

from app.services.storage_service import upload_user_image_bytes

logger = logging.getLogger(__name__)

PREVIEW_MAX_EDGE_PX = 640
PREVIEW_WEBP_QUALITY = 80


def build_preview_bytes(image_bytes: bytes) -> bytes:
    image = Image.open(io.BytesIO(image_bytes))
    has_alpha = image.mode in ("RGBA", "LA", "PA") or "transparency" in image.info
    preview = image.convert("RGBA" if has_alpha else "RGB")
    preview.thumbnail((PREVIEW_MAX_EDGE_PX, PREVIEW_MAX_EDGE_PX), Image.LANCZOS)
    output_buffer = io.BytesIO()
    preview.save(output_buffer, format="WEBP", quality=PREVIEW_WEBP_QUALITY, method=4)
    return output_buffer.getvalue()


def upload_generated_image_preview(*, image_bytes: bytes, user_id: str) -> str | None:
    """Public URL of the preview, or None: without one the panel shows the full file, so never fail a paid image."""
    try:
        uploaded = upload_user_image_bytes(
            image_bytes=build_preview_bytes(image_bytes),
            user_id=user_id,
            content_type="image/webp",
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("generated_image_preview_failed user=%s err=%s", user_id, exc)
        return None
    return uploaded.public_url
