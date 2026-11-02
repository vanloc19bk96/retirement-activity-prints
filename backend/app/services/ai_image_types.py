"""Image types offered by the AI image form (prompts and output settings)."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Mapping

from app.services.prompt_data import PROMPT_ROOT, load_config, load_template, render_template, section

NO_IMAGE_TYPE = "none"
COLORING_IMAGE_TYPE = "coloring"
FULL_PAGE_IMAGE_SIZE = "full_page"


@dataclass(frozen=True)
class ImageTypeSettings:
    should_strip_frame: bool
    should_autocrop: bool


@lru_cache(maxsize=1)
def _image_types_config() -> Mapping[str, Any]:
    return load_config("image-types", root=PROMPT_ROOT)


def image_type_keys() -> tuple[str, ...]:
    return tuple(section(_image_types_config(), "types"))


def resolve_image_type_settings(image_type: str) -> ImageTypeSettings:
    types = section(_image_types_config(), "types")
    if image_type not in types:
        raise ValueError(f"Unsupported image type: {image_type!r}")
    config = types[image_type]
    return ImageTypeSettings(
        should_strip_frame=bool(config["stripFrame"]),
        should_autocrop=bool(config["autocrop"]),
    )


def image_type_system_instruction(image_type: str) -> str:
    """System prompt for a styled type (none sends no system prompt; coloring has its own)."""
    return load_template("image-types", image_type, root=PROMPT_ROOT)


def build_image_type_prompt(*, idea: str) -> str:
    return render_template(str(_image_types_config()["interiorTemplate"]), idea=idea)
