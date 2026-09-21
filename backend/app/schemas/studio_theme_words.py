from __future__ import annotations

from typing import List

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.studio_variety import StudioVarietyRequest


class ThemeWordsRequest(StudioVarietyRequest):
    """Single themed words for grid puzzles — length bounds come from the caller."""

    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="everyday objects", min_length=1, max_length=120)
    item_count: int = Field(default=12, ge=3, le=40, alias="itemCount")
    min_letters: int = Field(default=3, ge=2, le=20, alias="minLetters")
    max_letters: int = Field(default=12, ge=3, le=24, alias="maxLetters")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)

    @model_validator(mode="after")
    def check_letter_range(self) -> "ThemeWordsRequest":
        if self.min_letters > self.max_letters:
            raise ValueError("minLetters must not exceed maxLetters")
        return self


class ThemeWordsModelOutput(BaseModel):
    """Gemini response_schema for themed-word JSON."""

    items: List[str]


class ThemeWordsResponse(BaseModel):
    """Uppercase A–Z words, no spaces."""

    items: List[str]
