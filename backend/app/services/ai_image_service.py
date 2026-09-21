from __future__ import annotations

import io
import logging
import random
from functools import lru_cache
from typing import Any, Mapping, Optional

import numpy as np
import requests
from PIL import Image

from app.core.config import settings
from app.services.book_cover_aspect_ratio_mapper import (
    aspect_ratio_pixel_dimensions,
    cover_print_pixel_dimensions,
    map_cover_ratio_to_aspect_ratio,
)
from app.services.book_cover_image_resizer import resize_image_bytes_exact
from app.services.grsaiapi_image_provider import (
    generate_batch_raw_image_bytes as grsai_generate_batch,
    generate_raw_image_bytes as grsai_generate_raw,
)
from app.services.prompt_data import (
    PROMPT_ROOT,
    load_config,
    load_template,
    render_template,
    section,
)
from app.services.storage_service import upload_user_image_bytes
from app.services.user_service import get_user_service

# First entry: fixed asset on your Supabase (browser uses localhost; server fetch rewrites to SUPABASE_URL in Docker).
_LOCALHOST_SUPABASE_API_PREFIXES: tuple[str, ...] = (
    "http://localhost:8000/",
    "http://127.0.0.1:8000/",
    "http://localhost:54321/",
    "http://127.0.0.1:54321/",
)


def _rewrite_localhost_storage_url_for_server_fetch(url: str) -> str:
    """
    Backend fetches may run inside Docker: localhost would hit this container, not Kong.
    Rewrite host to SUPABASE_URL while keeping path (e.g. /storage/v1/object/public/...).
    """
    stripped = (url or "").strip()
    for prefix in _LOCALHOST_SUPABASE_API_PREFIXES:
        if stripped.startswith(prefix):
            remainder = stripped[len(prefix) :].lstrip("/")
            base = settings.SUPABASE_URL.rstrip("/")
            return f"{base}/{remainder}" if remainder else base
    return stripped


COLORING_PAGE_SYSTEM_INSTRUCTION = load_template("coloring-page", "system", root=PROMPT_ROOT)

BOOK_COVER_SYSTEM_INSTRUCTION = load_template("book-cover", "system", root=PROMPT_ROOT)


@lru_cache(maxsize=1)
def _coloring_config() -> Mapping[str, Any]:
    return load_config("coloring-page", root=PROMPT_ROOT)


@lru_cache(maxsize=1)
def _cover_config() -> Mapping[str, Any]:
    return load_config("book-cover", root=PROMPT_ROOT)


# Axis 1: Style — shape language, proportions, and aesthetic feel ONLY.
# Axis 2: Line weight — outline stroke thickness ONLY. Independent of Style.
# Both live in app/data/prompts/coloring-page/prompt.json.
def _styles() -> Mapping[str, str]:
    return section(_coloring_config(), "styles")


def _line_weights() -> Mapping[str, str]:
    return section(_coloring_config(), "lineWeights")


def build_book_cover_prompt(
    *,
    title: str,
    aspect_ratio: str | None = None,
    subtitle: str | None = None,
    author: str | None = None,
    theme: str | None = None,
    mood: str | None = None,
    color_preference: str | None = None,
) -> str:
    config = _cover_config()
    blocks = section(config, "blocks")
    defaults = section(config, "defaults")

    parts: list[str] = [
        render_template(
            str(blocks["base"]),
            aspect_ratio=aspect_ratio or defaults["aspectRatio"],
        ),
        "",
        render_template(str(blocks["title"]), title=title),
    ]
    if subtitle:
        parts.append(render_template(str(blocks["subtitle"]), subtitle=subtitle))
    if author:
        parts.append(render_template(str(blocks["author"]), author=author))

    parts.append(str(blocks["typography"]))
    parts.append(
        render_template(
            str(blocks["artwork"]),
            theme=theme or defaults["theme"],
            mood=mood or defaults["mood"],
            color_preference=color_preference or defaults["colorPreference"],
        )
    )
    parts.append(str(blocks["printSafeMargins"]))
    parts.append(str(blocks["style"]))

    return "\n".join(parts)


# Frontend sends kebab-case for some entries; style ids use snake_case keys.
@lru_cache(maxsize=1)
def _style_aliases() -> Mapping[str, str]:
    return section(_coloring_config(), "aliases")


def _resolve_style_key(style: str) -> str:
    key = style.lower().strip()
    canonical = _style_aliases().get(key, key)
    if canonical in _styles():
        return canonical
    return str(_coloring_config()["defaultStyle"])


def _resolve_style_description(style: str) -> str:
    """Map UI style key to prompt text."""
    key = style.lower().strip()
    if key == "random":
        resolved_key = random.choice(tuple(_styles()))
    else:
        resolved_key = _resolve_style_key(style)
    return _styles()[resolved_key]


def _resolve_line_weight_description(line_weight: str) -> str:
    weights = _line_weights()
    key = line_weight.lower().strip()
    return weights.get(key, weights[str(_coloring_config()["defaultLineWeight"])])


def build_interior_prompt(*, idea: str, style: str, line_weight: str = "medium") -> str:
    """User prompt for interior outline generation (style axis + line-weight axis).

    Composition/format rules (background, centering, closed shapes, no border) are
    already in COLORING_PAGE_SYSTEM_INSTRUCTION. Keep this prompt focused on the
    three variables: subject, style, and line weight — shorter prompts generate faster.
    """
    return render_template(
        str(_coloring_config()["interiorTemplate"]),
        idea=idea,
        style=_resolve_style_description(style),
        line_weight=_resolve_line_weight_description(line_weight),
    )


def build_custom_interior_prompt(*, custom_prompt: str) -> str:
    return custom_prompt


def _is_likely_webp(data: bytes) -> bool:
    return len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP"


def _sniff_image_content_type(data: bytes) -> str | None:
    if len(data) < 4:
        return None
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if _is_likely_webp(data):
        return "image/webp"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return "image/gif"
    return None


def autocrop_whitespace(
    image_bytes: bytes,
    *,
    padding: int = 20,
    threshold: int = 252,
    target_size: tuple[int, int] | None = None,
    max_crop_fraction: float = 0.25,
) -> bytes:
    """
    Trim surrounding whitespace without cutting foreground content.

    Pipeline:
    1) Convert to RGB.
    2) Build a conservative near-white background mask.
    3) Scan from all 4 edges and trim only rows/cols that are background-only
       (with very small noise tolerance for JPEG artifacts).
    4) Safety: never scans more than *max_crop_fraction* of the image from any edge.
    5) Expand crop box with padding and clamp to image bounds.
    6) Crop original image (to preserve original line quality).
    7) Pad to square with white background.
    8) Resize to target_size if provided.
    """
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    pixels = np.array(image)
    background_mask = np.all(pixels >= threshold, axis=2)
    non_background_mask = ~background_mask

    height, width = non_background_mask.shape
    if height == 0 or width == 0:
        return image_bytes

    row_noise_allowance = max(1, width // 1000)
    col_noise_allowance = max(1, height // 1000)

    max_crop_v = int(height * max_crop_fraction)
    max_crop_h = int(width * max_crop_fraction)

    row_non_bg_counts = non_background_mask.sum(axis=1)
    col_non_bg_counts = non_background_mask.sum(axis=0)

    top = 0
    while top < max_crop_v and row_non_bg_counts[top] <= row_noise_allowance:
        top += 1

    bottom = height - 1
    while bottom >= max(top, height - max_crop_v) and row_non_bg_counts[bottom] <= row_noise_allowance:
        bottom -= 1

    left = 0
    while left < max_crop_h and col_non_bg_counts[left] <= col_noise_allowance:
        left += 1

    right = width - 1
    while right >= max(left, width - max_crop_h) and col_non_bg_counts[right] <= col_noise_allowance:
        right -= 1

    if top > bottom or left > right:
        return image_bytes

    right += 1
    bottom += 1

    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(width, right + padding)
    bottom = min(height, bottom + padding)

    cropped = image.crop((left, top, right, bottom))
    cropped_width, cropped_height = cropped.size
    square_side = max(cropped_width, cropped_height)

    square = Image.new("RGB", (square_side, square_side), (255, 255, 255))
    offset_x = (square_side - cropped_width) // 2
    offset_y = (square_side - cropped_height) // 2
    square.paste(cropped, (offset_x, offset_y))

    final = square.resize(target_size, Image.LANCZOS) if target_size else square
    output_buffer = io.BytesIO()
    final.save(output_buffer, format="PNG")
    return output_buffer.getvalue()


def strip_border_frame(
    image_bytes: bytes,
    *,
    dark_threshold: int = 80,
    row_density_threshold: float = 0.55,
    max_border_fraction: float = 0.05,
    min_edges_for_strip: int = 2,
) -> bytes:
    """
    Remove a rectangular border/frame that the model sometimes draws around the subject.

    Detection: a border row/column has a very high density of dark pixels (>55 %),
    while actual drawing content has sparse dark pixels (typically 5-30 %).
    We strip consecutive dense rows/columns from each edge inward,
    up to 5 % of the image dimension.

    Safety: requires border detection on at least *min_edges_for_strip* edges
    to distinguish a real rectangular frame from normal content that happens
    to be near one edge (e.g. thick outlines at the bottom of a character).
    """
    image = Image.open(io.BytesIO(image_bytes)).convert("L")
    pixels = np.array(image)
    dark_mask = pixels < dark_threshold
    height, width = dark_mask.shape

    if height < 20 or width < 20:
        return image_bytes

    max_strip_v = int(height * max_border_fraction)
    max_strip_h = int(width * max_border_fraction)

    def _row_dark_ratio(row_idx: int) -> float:
        return float(dark_mask[row_idx].sum()) / width

    def _col_dark_ratio(col_idx: int) -> float:
        return float(dark_mask[:, col_idx].sum()) / height

    top = 0
    while top < max_strip_v and _row_dark_ratio(top) > row_density_threshold:
        top += 1

    bottom = height
    while bottom > (height - max_strip_v) and _row_dark_ratio(bottom - 1) > row_density_threshold:
        bottom -= 1

    left = 0
    while left < max_strip_h and _col_dark_ratio(left) > row_density_threshold:
        left += 1

    right = width
    while right > (width - max_strip_h) and _col_dark_ratio(right - 1) > row_density_threshold:
        right -= 1

    edges_detected = sum([top > 0, bottom < height, left > 0, right < width])
    if edges_detected < min_edges_for_strip:
        return image_bytes

    cropped = Image.open(io.BytesIO(image_bytes)).convert("RGB").crop((left, top, right, bottom))
    buf = io.BytesIO()
    cropped.save(buf, format="PNG")
    return buf.getvalue()


def enforce_pure_black_white(
    image_bytes: bytes,
    *,
    threshold: int = 200,
) -> bytes:
    """
    Force every pixel to pure black or pure white.

    The model sometimes returns subtle gray anti-aliasing, faint color tints, or
    slight shading even when instructed to produce pure B&W line art.
    This guarantees the output is a clean two-tone coloring page.

    Pixels brighter than *threshold* (per-channel mean) become white;
    the rest become black.
    """
    image = Image.open(io.BytesIO(image_bytes)).convert("L")
    bw = image.point(lambda px: 255 if px >= threshold else 0, mode="1")
    buf = io.BytesIO()
    bw.convert("RGB").save(buf, format="PNG")
    return buf.getvalue()


class AiImageService:
    def __init__(self) -> None:
        self.generation_max_attempts = max(1, int(settings.GEMINI_GENERATION_MAX_ATTEMPTS))
        self.generation_backoff_base_seconds = max(
            0.1,
            float(settings.GEMINI_GENERATION_BACKOFF_BASE_SECONDS),
        )
        self.user_service = get_user_service()
        self.logger = logging.getLogger(__name__)

    @staticmethod
    def _download_image_bytes(source_url: str) -> tuple[bytes, str]:
        source_url = _rewrite_localhost_storage_url_for_server_fetch(source_url)
        response = requests.get(source_url, timeout=(10, 60))
        response.raise_for_status()
        raw_type = (response.headers.get("Content-Type") or "image/jpeg").split(";", 1)[0].strip()
        content_type = raw_type if raw_type.lower().startswith("image/") else "image/jpeg"
        return response.content, content_type

    def _resolve_upload_content_type(self, *, image_bytes: bytes, content_type: str) -> str:
        ct = (content_type or "").strip()
        if not ct.lower().startswith("image/"):
            sniffed = _sniff_image_content_type(image_bytes)
            ct = sniffed or "image/png"
            if sniffed is None:
                self.logger.warning(
                    "Unknown image MIME from API; bytes length=%s, first8=%r",
                    len(image_bytes),
                    image_bytes[:8],
                )
        return ct

    def _upload_generated_image(
        self,
        *,
        image_bytes: bytes,
        content_type: str,
        user_id: str,
    ) -> dict[str, str]:
        ct = self._resolve_upload_content_type(image_bytes=image_bytes, content_type=content_type)
        uploaded = upload_user_image_bytes(
            image_bytes=image_bytes,
            user_id=user_id,
            content_type=ct,
        )
        return {
            "public_url": uploaded.public_url,
            "bucket": uploaded.bucket,
            "path": uploaded.path,
        }

    def _generate_image_bytes(
        self,
        prompt: str,
        *,
        aspect_ratio: str = "1:1",
        system_instruction: str | None = COLORING_PAGE_SYSTEM_INSTRUCTION,
        should_autocrop_whitespace: bool = True,
        autocrop_target_size: tuple[int, int] | None = (1024, 1024),
        should_strip_frame: bool = False,
        should_enforce_bw: bool = False,
        max_attempts: int | None = None,
    ) -> tuple[bytes, str]:
        total_attempts = max(
            1,
            max_attempts if max_attempts is not None else self.generation_max_attempts,
        )
        best_bytes = grsai_generate_raw(
            prompt,
            aspect_ratio=aspect_ratio,
            system_instruction=system_instruction,
            max_attempts=total_attempts,
            backoff_base_seconds=self.generation_backoff_base_seconds,
        )
        if should_strip_frame:
            best_bytes = strip_border_frame(best_bytes)
        if should_enforce_bw:
            best_bytes = enforce_pure_black_white(best_bytes)
        if should_autocrop_whitespace:
            best_bytes = autocrop_whitespace(
                best_bytes,
                padding=20,
                threshold=248,
                target_size=autocrop_target_size,
            )
        return best_bytes, "image/png"

    def _batch_generate(
        self,
        prompts: list[tuple[str, str]],
        *,
        system_instruction: str | None = COLORING_PAGE_SYSTEM_INSTRUCTION,
    ) -> list[tuple[str, bytes, str]]:
        total_attempts = max(1, self.generation_max_attempts)
        prompt_texts = [prompt for _idea, prompt in prompts]
        max_concurrent = min(len(prompts), 10)

        batch_bytes = grsai_generate_batch(
            prompt_texts,
            system_instruction=system_instruction,
            max_attempts=total_attempts,
            backoff_base_seconds=self.generation_backoff_base_seconds,
            max_concurrent=max_concurrent,
        )

        results: list[tuple[str, bytes, str]] = []
        for (idea, _prompt), raw_bytes in zip(prompts, batch_bytes):
            processed = strip_border_frame(raw_bytes)
            processed = autocrop_whitespace(
                processed, padding=20, threshold=248, target_size=(1024, 1024),
            )
            results.append((idea, processed, "image/png"))
        return results

    def generate_interior_images(
        self,
        *,
        idea: Optional[str],
        custom_prompt: Optional[str] = None,
        style: str = "random",
        line_weight: str = "medium",
        user_id: str,
    ) -> dict[str, object]:
        cleaned_custom_prompt = (custom_prompt or "").strip()
        cleaned_idea = (idea or "").strip()
        if not cleaned_custom_prompt and not cleaned_idea:
            raise ValueError("idea is required when custom prompt is not provided")

        use_default_system_prompt = not bool(cleaned_custom_prompt)
        interior_system_instruction = (
            COLORING_PAGE_SYSTEM_INSTRUCTION if use_default_system_prompt else None
        )

        display_idea = cleaned_custom_prompt or cleaned_idea
        prompt_text = (
            build_custom_interior_prompt(custom_prompt=cleaned_custom_prompt)
            if cleaned_custom_prompt
            else build_interior_prompt(idea=cleaned_idea, style=style, line_weight=line_weight)
        )
        generation_results = self._batch_generate(
            [(display_idea, prompt_text)],
            system_instruction=interior_system_instruction,
        )

        images: list[dict[str, str]] = []
        for idea_label, raw_bytes, content_type in generation_results:
            images.append(
                {
                    "idea": idea_label,
                    **self._upload_generated_image(
                        image_bytes=raw_bytes,
                        content_type=content_type,
                        user_id=user_id,
                    ),
                }
            )

        return {"images": images}

    def generate_book_cover_image(
        self,
        *,
        title: str,
        subtitle: Optional[str] = None,
        author: Optional[str] = None,
        theme: Optional[str] = None,
        mood: Optional[str] = None,
        color_preference: Optional[str] = None,
        aspect_ratio: str = "2:3",
        cover_width_inches: Optional[float] = None,
        cover_height_inches: Optional[float] = None,
        user_id: str,
    ) -> dict[str, object]:
        cleaned_title = (title or "").strip()
        if not cleaned_title:
            raise ValueError("title is required")

        if cover_width_inches and cover_height_inches:
            # Generate at the ratio closest to the actual cover panel (trim + bleed),
            # then resize to exact print pixels so the editor's "Fit Front/Back"
            # cover-fill never crops text or artwork.
            aspect_ratio = map_cover_ratio_to_aspect_ratio(
                cover_width_inches / cover_height_inches
            )
            print_width_px, print_height_px = cover_print_pixel_dimensions(
                cover_width_inches, cover_height_inches
            )
        else:
            print_width_px, print_height_px = aspect_ratio_pixel_dimensions(aspect_ratio)

        prompt = build_book_cover_prompt(
            title=cleaned_title,
            aspect_ratio=aspect_ratio,
            subtitle=(subtitle or "").strip() or None,
            author=(author or "").strip() or None,
            theme=(theme or "").strip() or None,
            mood=(mood or "").strip() or None,
            color_preference=(color_preference or "").strip() or None,
        )
        image_bytes, _content_type = self._generate_image_bytes(
            prompt,
            aspect_ratio=aspect_ratio,
            system_instruction=BOOK_COVER_SYSTEM_INSTRUCTION,
            should_autocrop_whitespace=False,
            autocrop_target_size=None,
        )
        resized_bytes = resize_image_bytes_exact(
            image_bytes,
            width=print_width_px,
            height=print_height_px,
        )
        stored = self._upload_generated_image(
            image_bytes=resized_bytes,
            content_type="image/png",
            user_id=user_id,
        )
        return {"images": [stored]}


_ai_image_service: Optional[AiImageService] = None


def get_ai_image_service() -> AiImageService:
    global _ai_image_service
    if _ai_image_service is None:
        _ai_image_service = AiImageService()
    return _ai_image_service
