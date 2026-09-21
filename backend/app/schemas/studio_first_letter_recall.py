from __future__ import annotations

from typing import Dict, List

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.studio_variety import StudioVarietyRequest


class FirstLetterRecallRequest(StudioVarietyRequest):
    model_config = ConfigDict(populate_by_name=True)

    letters: List[str] = Field(min_length=1, max_length=3)
    # Must match printable answer lines on the worksheet (frontend 8–30).
    line_count: int = Field(default=15, ge=8, le=30, alias="lineCount")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)

    @field_validator("letters")
    @classmethod
    def normalize_letters(cls, value: List[str]) -> List[str]:
        out: list[str] = []
        seen: set[str] = set()
        for raw in value:
            letter = str(raw).strip().upper()[:1]
            if not letter or letter < "A" or letter > "Z":
                raise ValueError("letters must be A–Z")
            if letter in seen:
                continue
            seen.add(letter)
            out.append(letter)
        if not out:
            raise ValueError("letters must include at least one A–Z letter")
        return out


class FirstLetterGroup(BaseModel):
    """One requested letter and its example words."""

    letter: str
    words: List[str]


class FirstLetterRecallModelOutput(BaseModel):
    """Gemini response_schema for first-letter recall JSON.

    A list of groups rather than a `{letter: words}` map: JSON Schema cannot
    describe dynamic object keys, so a map would drop out of structured output.
    """

    groups: List[FirstLetterGroup]


class FirstLetterRecallResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    by_letter: Dict[str, List[str]] = Field(alias="byLetter")
