"""Tests for fitting generated art to exact print pixels."""
from __future__ import annotations

import io

from PIL import Image

from app.services.book_cover_image_resizer import fit_image_bytes_to_size


def _png(size: tuple) -> bytes:
    """Left half red, right half blue."""
    image = Image.new("RGB", size, (255, 0, 0))
    image.paste((0, 0, 255), (size[0] // 2, 0, size[0], size[1]))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_fit_reaches_exact_print_size() -> None:
    fitted = Image.open(io.BytesIO(fit_image_bytes_to_size(_png((1104, 1424)), width=2550, height=3300)))
    assert fitted.size == (2550, 3300)
    assert fitted.format == "PNG"


def test_fit_center_crops_instead_of_stretching() -> None:
    fitted = Image.open(io.BytesIO(fit_image_bytes_to_size(_png((1536, 1024)), width=500, height=500)))
    assert fitted.size == (500, 500)
    # The color split stays centered: a wide source loses its sides rather than being squeezed.
    assert fitted.getpixel((10, 250))[0] > 200
    assert fitted.getpixel((490, 250))[2] > 200
