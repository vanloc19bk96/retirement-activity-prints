from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

Wh = Literal["who", "what", "where", "when", "why", "howmany"]


class StoryRecallRequest(StudioVarietyRequest):
    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="everyday life", max_length=120)
    length: Literal["short", "medium", "long"] = "medium"
    difficulty: Literal["easy", "standard", "challenging"] = "standard"
    question_count: int = Field(default=5, ge=3, le=8, alias="questionCount")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class StoryQuestionDraft(BaseModel):
    """LLM-facing question shape (no id — assigned after generation)."""

    wh: Wh
    question: str
    answer: str


class StoryModelOutput(BaseModel):
    """Gemini response_schema for Story Recall JSON."""

    title: str
    passage: str
    questions: list[StoryQuestionDraft]


class StoryQuestion(BaseModel):
    id: str
    wh: Wh
    question: str
    answer: str


class StoryRecallResponse(BaseModel):
    title: str
    passage: str
    questions: list[StoryQuestion]
