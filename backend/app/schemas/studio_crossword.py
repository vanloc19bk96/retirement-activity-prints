from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.studio_variety import StudioVarietyRequest


class CrosswordCluesRequest(StudioVarietyRequest):
    """Theme mode: AI invents words+clues. Words mode: AI writes clues for given answers."""

    model_config = ConfigDict(populate_by_name=True)

    words: List[str] = Field(default_factory=list, max_length=40)
    theme: str = Field(default="", max_length=120)
    item_count: int = Field(default=24, ge=4, le=40, alias="itemCount")
    min_letters: int = Field(default=4, ge=3, le=12, alias="minLetters")
    max_letters: int = Field(default=12, ge=3, le=12, alias="maxLetters")
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    # Printed clue lists are set two to a column in large print; a clue past
    # this runs to a third line and pushes the grid down the page.
    max_clue_chars: int = Field(default=60, ge=24, le=120, alias="maxClueChars")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)

    @model_validator(mode="after")
    def check_mode_and_letters(self) -> "CrosswordCluesRequest":
        if self.min_letters > self.max_letters:
            raise ValueError("minLetters must not exceed maxLetters")
        has_words = any(str(w).strip() for w in self.words)
        has_theme = bool(self.theme.strip())
        if not has_words and not has_theme:
            raise ValueError("Provide a theme or a list of words")
        return self


class CrosswordClueItem(BaseModel):
    word: str
    clue: str


class CrosswordModelOutput(BaseModel):
    """Gemini response_schema for crossword word+clue JSON."""

    clues: List[CrosswordClueItem]


class CrosswordCluesResponse(BaseModel):
    clues: List[CrosswordClueItem]
