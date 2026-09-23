from __future__ import annotations

from typing import List

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.studio_variety import StudioVarietyRequest


class RiddleScrambleRequest(StudioVarietyRequest):
    """One pun riddle per page, plus the word pool its answer is spelled from.

    Both halves travel in one request because neither is usable alone. The page
    prints one scrambled word per letter of the riddle answer, and each of those
    words has to *contain* its letter — so a riddle without a matching pool is
    not half a page, it is no page, and a second paid call to fix that is a
    second chance to fail.

    ``answer_letters`` is exact rather than a band. It is the number of words
    the page prints, and a book whose pages hold five words, then four, then
    six, is a book that looks assembled rather than made. The browser asks for
    several riddles at that one length and keeps the first whose letters its
    word pool can actually spell.
    """

    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="Life after work", min_length=1, max_length=120)
    riddle_count: int = Field(default=8, ge=2, le=16, alias="riddleCount")
    answer_letters: int = Field(default=5, ge=4, le=6, alias="answerLetters")
    max_riddle_chars: int = Field(default=72, ge=24, le=80, alias="maxRiddleChars")
    word_count: int = Field(default=26, ge=8, le=40, alias="wordCount")
    min_letters: int = Field(default=5, ge=3, le=12, alias="minLetters")
    max_letters: int = Field(default=8, ge=4, le=12, alias="maxLetters")
    max_clue_chars: int = Field(default=30, ge=16, le=40, alias="maxClueChars")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)

    @model_validator(mode="after")
    def _ordered_band(self) -> "RiddleScrambleRequest":
        if self.max_letters < self.min_letters:
            raise ValueError("maxLetters must be at least minLetters")
        return self


class RiddleScrambleRiddle(BaseModel):
    riddle: str
    answer: str


class RiddleScrambleWord(BaseModel):
    word: str
    clue: str


class RiddleScrambleModelOutput(BaseModel):
    """Gemini response_schema — riddles and the word pool in one reply."""

    riddles: List[RiddleScrambleRiddle]
    words: List[RiddleScrambleWord]


class RiddleScrambleResponse(BaseModel):
    riddles: List[RiddleScrambleRiddle]
    words: List[RiddleScrambleWord]
