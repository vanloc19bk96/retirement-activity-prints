"""Book cover aspect ratio helpers."""

from __future__ import annotations

import math
from typing import Final

# Pixel dimensions per aspect ratio (matches the AI image provider's native output sizes).
ASPECT_RATIO_PIXEL_DIMENSIONS: Final[dict[str, tuple[int, int]]] = {
    "1:1":  (1024, 1024),
    "16:9": (1672,  941),
    "9:16": ( 941, 1672),
    "4:3":  (1443, 1090),
    "3:4":  (1090, 1443),
    "3:2":  (1536, 1024),
    "2:3":  (1024, 1536),
    "5:4":  (1408, 1120),
    "4:5":  (1120, 1408),
    "21:9": (1920,  832),
    "9:21": ( 832, 1920),
    "1:2":  ( 896, 1792),
    "2:1":  (1792,  896),
}

SUPPORTED_ASPECT_RATIOS: Final[frozenset[str]] = frozenset(ASPECT_RATIO_PIXEL_DIMENSIONS)


def aspect_ratio_pixel_dimensions(aspect_ratio: str) -> tuple[int, int]:
    """Return (width_px, height_px) for a supported aspect ratio label."""
    dims = ASPECT_RATIO_PIXEL_DIMENSIONS.get(aspect_ratio)
    if dims is None:
        raise ValueError(f"Unsupported aspect ratio: {aspect_ratio!r}")
    return dims


# ---------------------------------------------------------------------------
# Legacy helpers kept for any callers outside the book-cover generation path.
# ---------------------------------------------------------------------------

_LEGACY_RATIOS: Final[tuple[tuple[str, float], ...]] = tuple(
    (label, w / h) for label, (w, h) in ASPECT_RATIO_PIXEL_DIMENSIONS.items()
)

PRINT_DPI = 300


def map_cover_ratio_to_aspect_ratio(width_over_height: float) -> str:
    """Pick the closest supported aspect ratio label (log-space distance)."""
    if width_over_height <= 0 or not math.isfinite(width_over_height):
        raise ValueError("cover aspect ratio must be a positive finite number")
    log_target = math.log(width_over_height)
    best_label = _LEGACY_RATIOS[0][0]
    best_distance = float("inf")
    for label, ratio in _LEGACY_RATIOS:
        distance = abs(log_target - math.log(ratio))
        if distance < best_distance:
            best_distance = distance
            best_label = label
    return best_label


def map_cover_ratio_to_gemini_aspect_ratio(width_over_height: float) -> str:
    return map_cover_ratio_to_aspect_ratio(width_over_height)


def cover_print_pixel_dimensions(width_inches: float, height_inches: float) -> tuple[int, int]:
    """Pixel size at 300 DPI for one front/back trim panel."""
    if width_inches <= 0 or height_inches <= 0:
        raise ValueError("trim dimensions in inches must be positive")
    return max(1, int(round(width_inches * PRINT_DPI))), max(1, int(round(height_inches * PRINT_DPI)))
