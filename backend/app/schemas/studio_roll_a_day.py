from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

RollADayFocus = Literal["balanced", "home", "outings", "creative", "social"]


class RollADayRequest(StudioVarietyRequest):
    """Activity pools for one Roll-a-Day page.

    The page prints six morning and six afternoon activities, one per face of
    a die. The client asks for spares on each side so its own layout and book
    gates can pass an activity over without leaving a face blank; a top-up
    asks only for the side still short (the other count is zero).

    The character budget is on the request because the page fixes it before an
    activity exists: every activity has to set within the lines its row
    reserved.
    """

    model_config = ConfigDict(populate_by_name=True)

    focus: RollADayFocus = "balanced"
    morning_count: int = Field(default=10, ge=0, le=14, alias="morningCount")
    afternoon_count: int = Field(default=10, ge=0, le=14, alias="afternoonCount")
    max_activity_chars: int = Field(default=34, ge=24, le=40, alias="maxActivityChars")
    seed: int = Field(default=1, ge=0)


class RollADayItem(BaseModel):
    """One activity, printed as written. ``concept`` and ``kind`` are never printed."""

    activity: str
    concept: str = ""
    kind: str = ""


class RollADayModelItem(BaseModel):
    """What the model fills for one activity.

    ``concept`` names the underlying activity in a few plain words ("bread
    baking", "library browse"), so two activities that are the same thing in
    different words can be told apart from two that merely share a verb.
    """

    brief: int
    concept: str
    activity: str


class RollADayModelOutput(BaseModel):
    """Gemini response_schema for Roll-a-Day JSON."""

    morning: List[RollADayModelItem]
    afternoon: List[RollADayModelItem]


class RollADayResponse(BaseModel):
    """Every item is one valid activity for its side, clashing with no other.

    The lists may be shorter than asked when the model kept failing the gates;
    the client tops up or reports an error, and never prints a partial table.
    """

    morning: List[RollADayItem] = Field(default_factory=list)
    afternoon: List[RollADayItem] = Field(default_factory=list)
