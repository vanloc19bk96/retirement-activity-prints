from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

Tone = Literal["gentle", "playful", "reflective"]
Mode = Literal["life-story", "journal"]
TimeFrame = Literal["past", "present", "future", "mixed"]


class LifeTimelineRequest(StudioVarietyRequest):
    model_config = ConfigDict(populate_by_name=True)

    mode: Mode = "life-story"
    # Life stage, journal theme, or a custom label (`stage` kept for older
    # clients). Empty is a journal asking for "a bit of everything".
    stage: str = Field(
        default="childhood",
        max_length=80,
        validation_alias=AliasChoices("stageOrTheme", "stage"),
    )
    time_frame: Optional[TimeFrame] = Field(default=None, alias="timeFrame")
    # Journal books may request many distinct prompts in one call.
    prompt_count: int = Field(default=4, ge=1, le=120, alias="promptCount")
    tone: Tone = "gentle"
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=16)


class LifeTimelineModelOutput(BaseModel):
    """Gemini response_schema for life-story / journal prompt JSON."""

    prompts: List[str]


class LifeTimelineResponse(BaseModel):
    stage: str
    prompts: List[str]
