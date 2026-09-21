from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

Difficulty = Literal["relaxed", "classic", "challenge"]


class MissingVowelsRequest(StudioVarietyRequest):
    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="Life After Work", min_length=1, max_length=120)
    item_count: int = Field(default=12, ge=8, le=18, alias="itemCount")
    difficulty: Difficulty = "classic"
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class MissingVowelsModelOutput(BaseModel):
    """Gemini response_schema for missing-vowels JSON."""

    items: List[str]


class MissingVowelsResponse(BaseModel):
    items: List[str]
