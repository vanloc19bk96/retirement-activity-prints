from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest


class CategoryFluencyRequest(StudioVarietyRequest):
    model_config = ConfigDict(populate_by_name=True)

    difficulty: Literal["easy", "standard", "hard"] = "standard"
    category_hint: Optional[str] = Field(
        default=None, max_length=120, alias="categoryHint"
    )
    # Must match printable answer lines on the worksheet (frontend 8–30).
    line_count: int = Field(default=15, ge=8, le=30, alias="lineCount")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class CategoryFluencyModelOutput(BaseModel):
    """Gemini response_schema for category fluency JSON."""

    category: str
    examples: List[str]


class CategoryFluencyResponse(BaseModel):
    category: str
    examples: List[str]
