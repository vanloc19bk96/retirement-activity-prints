from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

WeeksOfFirstsFocus = Literal["balanced", "close-to-home", "out-and-about", "creative", "social"]


class WeeksOfFirstsAreaAsk(BaseModel):
    """One area the client wants topped up, and by how many ideas."""

    key: str = Field(min_length=1, max_length=40)
    count: int = Field(ge=1, le=10)


class WeeksOfFirstsRequest(StudioVarietyRequest):
    """Ideas for one 52 Weeks of Firsts year.

    The service spreads the fifty-two weeks over its areas (every area, the
    mix's boost areas weighted up) and writes spares on top, so the book's own
    checks can drop a few without the year running short.

    ``areas`` is the top-up form: when the client's checks left an area short,
    it names those areas and how many more each needs, and the service writes
    only those.

    The idea budget is on the request because the page fixes it before an idea
    exists: every prompt has to set within the lines its week reserved.
    """

    model_config = ConfigDict(populate_by_name=True)

    focus: WeeksOfFirstsFocus = "balanced"
    areas: Optional[List[WeeksOfFirstsAreaAsk]] = Field(default=None, max_length=20)
    max_idea_chars: int = Field(default=60, ge=30, le=60, alias="maxIdeaChars")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class WeeksOfFirstsItem(BaseModel):
    """One weekly idea, printed as written. ``concept`` is never printed."""

    idea: str
    concept: str = ""


class WeeksOfFirstsArea(BaseModel):
    """One area of the year: how many weeks it takes, and its ideas, spares included.

    Planned areas are returned even when every batch for them failed (with no
    items), so the client can name them in a top-up.
    """

    key: str
    target: int
    items: List[WeeksOfFirstsItem] = Field(default_factory=list)


class WeeksOfFirstsModelItem(BaseModel):
    """What the model fills for one idea.

    ``concept`` names the underlying experience in a few plain words ("thai
    green curry", "birdsong by ear"), so two ideas that are the same thing in
    different words can be told apart from two that merely share a verb.
    """

    brief: int
    concept: str
    idea: str


class WeeksOfFirstsModelOutput(BaseModel):
    """Gemini response_schema for 52 Weeks of Firsts JSON."""

    items: List[WeeksOfFirstsModelItem]


class WeeksOfFirstsResponse(BaseModel):
    """Every item is one valid weekly idea, distinct from every other in the reply."""

    areas: List[WeeksOfFirstsArea]
