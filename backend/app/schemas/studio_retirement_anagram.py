from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

Difficulty = Literal["easy", "medium", "hard"]


class RetirementAnagramRequest(StudioVarietyRequest):
    model_config = ConfigDict(populate_by_name=True)

    topic: str = Field(
        default="Retirement Life",
        min_length=1,
        max_length=120,
    )
    item_count: int = Field(default=12, ge=8, le=20, alias="itemCount")
    difficulty: Difficulty = "medium"
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class RetirementAnagramModelOutput(BaseModel):
    """Gemini response_schema — plain words only (no hints on the sheet)."""

    items: List[str]


class RetirementAnagramResponse(BaseModel):
    items: List[str]
