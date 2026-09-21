from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

Difficulty = Literal["easy", "medium", "hard"]


class AnagramRequest(StudioVarietyRequest):
    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="everyday objects", min_length=1, max_length=120)
    item_count: int = Field(default=12, ge=5, le=24, alias="itemCount")
    difficulty: Difficulty = "medium"
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class AnagramItem(BaseModel):
    word: str
    hint: str


class AnagramModelOutput(BaseModel):
    """Gemini response_schema for anagram word+hint JSON."""

    items: List[AnagramItem]


class AnagramResponse(BaseModel):
    items: List[AnagramItem]
