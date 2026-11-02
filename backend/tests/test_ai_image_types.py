"""Tests for the AI image form's image types."""
from __future__ import annotations

from typing import get_args

import pytest
from pydantic import ValidationError

from app.schemas.ai_images import GenerateInteriorImagesRequest, ImageType
from app.services import ai_image_types as image_types

STYLED_TYPES = [
    key
    for key in get_args(ImageType)
    if key not in (image_types.NO_IMAGE_TYPE, image_types.COLORING_IMAGE_TYPE)
]
WHITE_BACKGROUND_TYPES = ["coloring", "mandala", "silhouette", "clipart"]


def test_schema_and_prompt_data_offer_the_same_types() -> None:
    assert set(get_args(ImageType)) == set(image_types.image_type_keys())


@pytest.mark.parametrize("image_type", STYLED_TYPES)
def test_every_styled_type_has_a_system_prompt(image_type: str) -> None:
    assert image_types.image_type_system_instruction(image_type).startswith("You are a professional")


@pytest.mark.parametrize("image_type", WHITE_BACKGROUND_TYPES)
def test_white_background_types_keep_whitespace_processing(image_type: str) -> None:
    type_settings = image_types.resolve_image_type_settings(image_type)
    assert type_settings.should_strip_frame is True
    assert type_settings.should_autocrop is True


@pytest.mark.parametrize(
    "image_type",
    [key for key in get_args(ImageType) if key not in WHITE_BACKGROUND_TYPES],
)
def test_other_types_skip_whitespace_processing(image_type: str) -> None:
    type_settings = image_types.resolve_image_type_settings(image_type)
    assert type_settings.should_strip_frame is False
    assert type_settings.should_autocrop is False


@pytest.mark.parametrize("image_type", ["page_border", "background"])
def test_full_page_types_are_portrait(image_type: str) -> None:
    assert image_types.resolve_image_type_settings(image_type).aspect_ratio == "2:3"


def test_other_types_default_to_square() -> None:
    assert image_types.resolve_image_type_settings("none").aspect_ratio == "1:1"


def test_unknown_type_is_rejected_by_the_service_helper() -> None:
    with pytest.raises(ValueError):
        image_types.resolve_image_type_settings("hologram")


def test_prompt_carries_the_idea() -> None:
    assert image_types.build_image_type_prompt(idea="a cat") == "SUBJECT: a cat"


def test_request_defaults_to_coloring_for_older_clients() -> None:
    assert GenerateInteriorImagesRequest(idea="a cat").image_type == "coloring"


def test_request_accepts_the_frontend_field_name() -> None:
    request = GenerateInteriorImagesRequest(idea="a cat", imageType="none")
    assert request.model_dump(by_alias=False)["image_type"] == "none"


def test_request_rejects_an_unknown_type() -> None:
    with pytest.raises(ValidationError):
        GenerateInteriorImagesRequest(idea="a cat", imageType="hologram")
