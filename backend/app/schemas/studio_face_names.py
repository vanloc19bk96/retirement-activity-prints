from __future__ import annotations

from typing import Annotated, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest


class FaceNameRequest(StudioVarietyRequest):
    model_config = ConfigDict(populate_by_name=True)

    count: int = Field(default=6, ge=4, le=12)
    name_style: Annotated[
        Literal["first", "full"],
        Field(alias="nameStyle"),
    ] = "first"
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class FaceNameItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    first: str
    last: Optional[str] = None
    gender: Literal["male", "female", "neutral"]


class FaceNameDraft(BaseModel):
    """LLM-facing name shape; `last` is null for first-name-only sheets."""

    first: str
    last: Optional[str] = None
    gender: Literal["male", "female", "neutral"]


class FaceNamesModelOutput(BaseModel):
    """Gemini response_schema for face–name JSON."""

    names: List[FaceNameDraft]


class FaceNameResponse(BaseModel):
    names: List[FaceNameItem]
