from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

CoverTextPosition = Literal["top", "center", "bottom"]
AuthorPosition = Literal["top", "bottom"]


class CoverTextField(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    enabled: bool = False
    text: str = ""
    position: CoverTextPosition = "top"

    @field_validator("text")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return (value or "").strip()


class AuthorTextField(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    enabled: bool = False
    text: str = ""
    position: AuthorPosition = "bottom"

    @field_validator("text")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return (value or "").strip()


class CoverDimensions(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    width_px: int = Field(..., alias="widthPx", gt=0, le=8000)
    height_px: int = Field(..., alias="heightPx", gt=0, le=8000)
    dpi: int = Field(default=300, ge=72, le=600)
    bleed_px: int = Field(default=0, alias="bleedPx", ge=0)


class GenerateCoverRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    description: str = Field(..., min_length=5, max_length=2000)
    title: CoverTextField = Field(default_factory=CoverTextField)
    subtitle: CoverTextField = Field(default_factory=CoverTextField)
    author: AuthorTextField = Field(default_factory=AuthorTextField)
    cover_dimensions: CoverDimensions = Field(..., alias="coverDimensions")

    @field_validator("description")
    @classmethod
    def strip_description(cls, value: str) -> str:
        cleaned = (value or "").strip()
        if len(cleaned) < 5:
            raise ValueError("description must be at least 5 characters")
        return cleaned

    @model_validator(mode="after")
    def validate_enabled_text_fields(self) -> "GenerateCoverRequest":
        if self.title.enabled and not self.title.text:
            raise ValueError("title.text is required when title is enabled")
        if len(self.title.text) > 80:
            raise ValueError("title.text must be at most 80 characters")
        if self.subtitle.enabled and not self.subtitle.text:
            raise ValueError("subtitle.text is required when subtitle is enabled")
        if len(self.subtitle.text) > 120:
            raise ValueError("subtitle.text must be at most 120 characters")
        if self.author.enabled and not self.author.text:
            raise ValueError("author.text is required when author is enabled")
        if len(self.author.text) > 60:
            raise ValueError("author.text must be at most 60 characters")
        return self


class GenerateCoverSuccessResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    success: Literal[True] = True
    image_url: str = Field(..., alias="imageUrl")
    generation_id: str = Field(..., alias="generationId")


class GenerateCoverErrorResponse(BaseModel):
    success: Literal[False] = False
    error_code: Literal[
        "AI_GENERATION_FAILED",
        "STORAGE_UPLOAD_FAILED",
        "VALIDATION_ERROR",
    ] = Field(
        ...,
        alias="errorCode",
    )
    message: str
