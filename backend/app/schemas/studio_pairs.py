from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

PairType = Literal["arbitrary", "related", "word-picture"]


class PairRequest(StudioVarietyRequest):
    model_config = ConfigDict(populate_by_name=True)

    pair_type: PairType = Field(default="arbitrary", alias="pairType")
    pair_count: int = Field(default=6, ge=4, le=10, alias="pairCount")
    exercise_count: int = Field(default=10, ge=1, le=40, alias="exerciseCount")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class WordPair(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    left: str
    right: str
    rightImageUrl: Optional[str] = None
    rightNaturalWidth: Optional[int] = None
    rightNaturalHeight: Optional[int] = None


class PairSet(BaseModel):
    pairs: List[WordPair]


class PairDraft(BaseModel):
    """LLM-facing pair shape — no image fields, those are attached later."""

    left: str
    right: str


class PairSetDraft(BaseModel):
    pairs: List[PairDraft]


class PairsModelOutput(BaseModel):
    """Gemini response_schema for Perfect Pairs JSON."""

    sets: List[PairSetDraft]


class PairResponse(BaseModel):
    sets: List[PairSet]
