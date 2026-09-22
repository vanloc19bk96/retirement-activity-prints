from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

Tone = Literal["funny", "heartfelt", "classy", "sassy"]
Difficulty = Literal["easy", "medium", "hard"]
PrintStyle = Literal["large-print", "standard"]


class WordSearchRequest(StudioVarietyRequest):
    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="Life after work", min_length=1, max_length=120)
    tone: Tone = "heartfelt"
    difficulty: Difficulty = "medium"
    print_style: PrintStyle = Field(default="large-print", alias="printStyle")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class WordSearchModelOutput(BaseModel):
    words: List[str]


class WordSearchResponse(BaseModel):
    words: List[str]
