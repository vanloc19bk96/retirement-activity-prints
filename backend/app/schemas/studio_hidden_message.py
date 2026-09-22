from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.studio_variety import StudioVarietyRequest

Tone = Literal["funny", "heartfelt", "classy", "sassy"]


class HiddenMessageRequest(StudioVarietyRequest):
    """A retirement saying plus a word pool to hide it in.

    Both bands are part of the request because the page cannot widen either.
    The word band is the level's, and a pool written to a three-to-eleven band
    comes back mostly unusable to a page whose grid is nine cells across.

    The message band matters more here than anywhere else in the app. A
    hidden-message grid is filled exactly — every cell the words do not claim
    holds one letter of the saying — so a saying five letters longer than the
    page planned for is not a tight fit, it is an unusable one. Asking for both
    up front is what keeps one paid call enough.
    """

    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="Life after work", min_length=1, max_length=120)
    tone: Tone = "heartfelt"
    count: int = Field(default=30, ge=8, le=40)
    min_letters: int = Field(default=4, ge=3, le=12, alias="minLetters")
    max_letters: int = Field(default=8, ge=4, le=12, alias="maxLetters")
    min_message_letters: int = Field(default=18, ge=10, le=40, alias="minMessageLetters")
    max_message_letters: int = Field(default=28, ge=10, le=48, alias="maxMessageLetters")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)
    custom_message: Optional[str] = Field(default=None, alias="customMessage", max_length=80)

    @model_validator(mode="after")
    def _ordered_bands(self) -> "HiddenMessageRequest":
        if self.max_letters < self.min_letters:
            raise ValueError("maxLetters must be at least minLetters")
        if self.max_message_letters < self.min_message_letters:
            raise ValueError("maxMessageLetters must be at least minMessageLetters")
        return self


class HiddenMessageModelOutput(BaseModel):
    """Gemini response_schema for hidden-message JSON."""

    message: str
    words: List[str]


class HiddenMessageResponse(BaseModel):
    message: str
    """Display strings: Title Case, spaces kept for two-word entries."""
    words: List[str]
