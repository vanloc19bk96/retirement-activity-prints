from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

class GenerateInteriorImagesRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    idea: Optional[str] = Field(default=None, description="Subject or scene for one interior coloring page")
    custom_prompt: Optional[str] = Field(
        default=None,
        alias="customPrompt",
        description="Use a fully custom prompt; if provided, idea/style/lineWeight are ignored",
    )
    style: str = Field(default="random", min_length=1, description="Image style")
    line_weight: str = Field(
        default="medium",
        min_length=1,
        alias="lineWeight",
        description="Outline thickness: thin, medium, or thick",
    )

    @field_validator("idea", "custom_prompt")
    @classmethod
    def strip_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = (value or "").strip()
        return cleaned or None

    @field_validator("style")
    @classmethod
    def strip_style(cls, value: str) -> str:
        cleaned = (value or "").strip()
        return cleaned or "random"

    @field_validator("line_weight")
    @classmethod
    def strip_line_weight(cls, value: str) -> str:
        cleaned = (value or "").strip()
        return cleaned or "medium"

    @model_validator(mode="after")
    def validate_prompt_source(self) -> "GenerateInteriorImagesRequest":
        if self.custom_prompt:
            return self
        if self.idea:
            return self
        raise ValueError("idea is required when customPrompt is not provided")


class GeneratedImageItem(BaseModel):
    idea: Optional[str] = None
    public_url: str
    bucket: str
    path: str


class GenerateImagesResponse(BaseModel):
    mode: Literal["interior"]
    images: list[GeneratedImageItem]


class AiImageJobAcceptedResponse(BaseModel):
    job_id: str
    status: Literal["queued"]


class AiImageJobStatusResponse(BaseModel):
    job_id: str
    status: Literal["queued", "started", "finished", "failed"]
    result: Optional[GenerateImagesResponse] = None
    error: Optional[str] = None
