from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

Tier = Literal["plain", "category", "qualitative"]
Category = Literal["mixed", "produce", "pantry", "household"]
Difficulty = Literal["easy", "standard", "challenging"]


class ListRecallRequest(StudioVarietyRequest):
    model_config = ConfigDict(populate_by_name=True)

    list_length: int = Field(default=8, ge=5, le=20, alias="listLength")
    distractor_count: int = Field(default=8, ge=4, le=20, alias="distractorCount")
    distractor_difficulty: Difficulty = Field(
        default="standard", alias="distractorDifficulty"
    )
    category: Category = "mixed"
    theme: Optional[str] = Field(default=None, max_length=120)
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class ListDistractorDraft(BaseModel):
    """LLM-facing decoy shape (tier optional — defaulted after parse)."""

    label: str
    tier: Tier = "plain"


class ListModelOutput(BaseModel):
    """Gemini response_schema for Shopping List Recall JSON."""

    targets: list[str]
    distractors: list[ListDistractorDraft]


class ListItem(BaseModel):
    label: str
    isTarget: bool
    tier: Optional[Tier] = None


class ListRecallResponse(BaseModel):
    targets: list[str]
    options: list[ListItem]
