from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

PhraseLength = Literal["short", "medium", "long"]


class FallenPhraseRequest(StudioVarietyRequest):
    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="retirement lifestyle hobbies", min_length=1, max_length=120)
    item_count: int = Field(default=1, ge=1, le=3, alias="itemCount")
    length: PhraseLength = "medium"
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class FallenPhraseModelOutput(BaseModel):
    """Gemini response_schema for fallen-phrase saying JSON."""

    items: List[str]


class FallenPhraseResponse(BaseModel):
    """Uppercase A-Z sayings with single spaces, ready to set into a grid."""

    items: List[str]
