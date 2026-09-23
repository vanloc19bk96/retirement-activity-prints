from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.studio_variety import StudioVarietyRequest

Difficulty = Literal["easy", "medium", "hard"]


class TriviaCluesRequest(StudioVarietyRequest):
    """Clue + answer pairs for one trivia-clue word search page.

    Every band is part of the request because the page cannot widen any of
    them. The letter band is the grid's: an answer longer than the grid is wide
    cannot be placed at all, and one shorter than four letters turns up by
    accident in the filler, which hands the page two right answers.

    ``max_clue_chars`` is the width of the printed clue column expressed as
    characters. A clue past it wraps onto a line the page did not reserve, so
    it is dropped here while substitutes remain rather than shipped for the
    client to discover at layout time.
    """

    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="Life after work", min_length=1, max_length=120)
    difficulty: Difficulty = "medium"
    count: int = Field(default=20, ge=6, le=32)
    min_letters: int = Field(default=4, ge=4, le=10, alias="minLetters")
    max_letters: int = Field(default=8, ge=4, le=10, alias="maxLetters")
    max_clue_chars: int = Field(default=58, ge=20, le=80, alias="maxClueChars")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)

    @model_validator(mode="after")
    def _ordered_band(self) -> "TriviaCluesRequest":
        if self.max_letters < self.min_letters:
            raise ValueError("maxLetters must be at least minLetters")
        return self


class TriviaClueItem(BaseModel):
    """One printed clue and the single word it resolves to."""

    answer: str
    clue: str


class TriviaCluesModelOutput(BaseModel):
    """Gemini response_schema for trivia-clue JSON."""

    items: List[TriviaClueItem]


class TriviaCluesResponse(BaseModel):
    """Answers are bare uppercase A-Z words — the grid token and the key both."""

    items: List[TriviaClueItem]
