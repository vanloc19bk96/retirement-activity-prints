from __future__ import annotations

from typing import List

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.studio_variety import StudioVarietyRequest


class WordSearchRequest(StudioVarietyRequest):
    """A pool of retirement words inside one letter band.

    The band is part of the request because the page cannot widen it: a
    "gentle" word search grid is ten cells across, so a nine-letter word is not
    a word it can use. Asking for the band up front is what keeps one call
    enough; filtering a three-to-eleven pool down to four-to-seven afterwards
    throws most of it away and sends the seller back for a second paid call.
    """

    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="retirement lifestyle hobbies", min_length=1, max_length=120)
    count: int = Field(default=24, ge=4, le=30)
    min_letters: int = Field(default=4, ge=3, le=12, alias="minLetters")
    max_letters: int = Field(default=9, ge=4, le=12, alias="maxLetters")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)

    @model_validator(mode="after")
    def _ordered_letter_band(self) -> "WordSearchRequest":
        if self.max_letters < self.min_letters:
            raise ValueError("maxLetters must be at least minLetters")
        return self


class WordSearchModelOutput(BaseModel):
    """Gemini response_schema for the word pool JSON."""

    words: List[str]


class WordSearchResponse(BaseModel):
    """Display strings: title case, spaces kept for two-word entries."""

    words: List[str]
