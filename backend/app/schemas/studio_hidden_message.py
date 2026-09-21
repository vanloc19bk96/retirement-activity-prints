from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

Tone = Literal["funny", "heartfelt", "classy", "sassy"]
Difficulty = Literal["easy", "medium", "hard"]


class HiddenMessageRequest(StudioVarietyRequest):
    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="Life after work", min_length=1, max_length=120)
    tone: Tone = "heartfelt"
    difficulty: Difficulty = "medium"
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)
    custom_message: Optional[str] = Field(default=None, alias="customMessage", max_length=80)


class HiddenMessageModelOutput(BaseModel):
    """Gemini response_schema for hidden-message JSON."""

    message: str
    words: List[str]


class HiddenMessageResponse(BaseModel):
    message: str
    words: List[str]
