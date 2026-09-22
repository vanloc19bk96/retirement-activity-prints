from __future__ import annotations

from typing import List

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.studio_variety import StudioVarietyRequest


class MissingVowelsRequest(StudioVarietyRequest):
    """Answers to blank the vowels out of, each with the clue that reaches it.

    The letter band, the word limit and the clue budget are part of the request
    because the page cannot widen any of them. All three are fixed before a word
    exists: the band and the word limit are the level's, and the clue budget is
    the width of the column the clue prints in. A pool written to some other
    band comes back mostly unusable, and every discarded row is a paid call the
    seller made for nothing.
    """

    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="Life after work", min_length=1, max_length=120)
    count: int = Field(default=24, ge=4, le=40)
    min_letters: int = Field(default=6, ge=4, le=12, alias="minLetters")
    max_letters: int = Field(default=8, ge=4, le=14, alias="maxLetters")
    max_words: int = Field(default=2, ge=1, le=2, alias="maxWords")
    max_clue_chars: int = Field(default=42, ge=16, le=60, alias="maxClueChars")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)

    @model_validator(mode="after")
    def _ordered_band(self) -> "MissingVowelsRequest":
        if self.max_letters < self.min_letters:
            raise ValueError("maxLetters must be at least minLetters")
        return self


class MissingVowelsClue(BaseModel):
    answer: str
    clue: str


class MissingVowelsModelOutput(BaseModel):
    """Gemini response_schema — one complete answer per clue."""

    items: List[MissingVowelsClue]


class MissingVowelsResponse(BaseModel):
    items: List[MissingVowelsClue]
