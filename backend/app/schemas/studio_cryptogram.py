from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

SayingLength = Literal["short", "medium", "long"]


class CryptogramRequest(StudioVarietyRequest):
    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="everyday wisdom", min_length=1, max_length=120)
    item_count: int = Field(default=2, ge=1, le=6, alias="itemCount")
    length: SayingLength = "medium"
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class CryptogramModelOutput(BaseModel):
    """Gemini response_schema for cryptogram saying JSON."""

    items: List[str]


class CryptogramResponse(BaseModel):
    """Uppercase A–Z sayings with single spaces, ready to encipher."""

    items: List[str]
