from __future__ import annotations

from typing import List

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.studio_variety import StudioVarietyRequest


class RetirementAnagramRequest(StudioVarietyRequest):
    """Words to scramble, each with the clue that reaches it.

    The letter band and the clue budget are part of the request because the
    page cannot widen either. Both are fixed before a word exists: the band is
    the level's, and the clue budget is the width of the column the clue prints
    in. A pool written to some other band comes back mostly unusable, and every
    discarded row is a paid call the seller made for nothing.
    """

    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="Life after work", min_length=1, max_length=120)
    count: int = Field(default=16, ge=4, le=40)
    min_letters: int = Field(default=5, ge=3, le=12, alias="minLetters")
    max_letters: int = Field(default=8, ge=4, le=12, alias="maxLetters")
    max_clue_chars: int = Field(default=42, ge=16, le=60, alias="maxClueChars")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)

    @model_validator(mode="after")
    def _ordered_band(self) -> "RetirementAnagramRequest":
        if self.max_letters < self.min_letters:
            raise ValueError("maxLetters must be at least minLetters")
        return self


class RetirementAnagramClue(BaseModel):
    word: str
    clue: str


class RetirementAnagramModelOutput(BaseModel):
    """Gemini response_schema — one answer word per clue."""

    items: List[RetirementAnagramClue]


class RetirementAnagramResponse(BaseModel):
    items: List[RetirementAnagramClue]
