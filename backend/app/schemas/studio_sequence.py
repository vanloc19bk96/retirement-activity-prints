from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

SequenceType = Literal["arbitrary", "steps", "story", "everyday"]


class SequenceRequest(StudioVarietyRequest):
    model_config = ConfigDict(populate_by_name=True)

    sequence_type: SequenceType = Field(default="arbitrary", alias="sequenceType")
    item_count: int = Field(default=5, ge=4, le=8, alias="itemCount")
    sequence_count: int = Field(default=10, ge=1, le=40, alias="sequenceCount")
    theme: Optional[str] = Field(default=None, max_length=120)
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class SequenceItem(BaseModel):
    text: str


class SequenceSet(BaseModel):
    title: Optional[str] = None
    items: List[SequenceItem]


class SequenceSetDraft(BaseModel):
    """LLM-facing sequence shape; `title` is null for arbitrary lists."""

    title: Optional[str] = None
    items: List[SequenceItem]


class SequenceModelOutput(BaseModel):
    """Gemini response_schema for Put-It-In-Order JSON."""

    sequences: List[SequenceSetDraft]


class SequenceResponse(BaseModel):
    sequences: List[SequenceSet]
