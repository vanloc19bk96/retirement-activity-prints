"""
Stretch generated book cover art to exact print pixels for one panel (front or back trim) at 300 DPI.
Uses OpenCV LANCZOS4 interpolation for high-quality resize without external API calls.
"""

from __future__ import annotations

import cv2
import numpy as np


def resize_image_bytes_exact(image_bytes: bytes, *, width: int, height: int) -> bytes:
    """Resize to exact width x height without preserving aspect ratio."""
    if width < 1 or height < 1:
        raise ValueError("width and height must be positive")

    decoded = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if decoded is None:
        raise ValueError("Failed to decode image bytes")

    resized = cv2.resize(decoded, (width, height), interpolation=cv2.INTER_LANCZOS4)
    success, encoded = cv2.imencode(".png", resized)
    if not success:
        raise ValueError("Failed to encode resized image")
    return encoded.tobytes()
