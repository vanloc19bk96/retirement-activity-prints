from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

BucketListFocus = Literal["balanced", "close-to-home", "adventure", "creative", "people"]


class BucketListSectionAsk(BaseModel):
    """One theme the client wants topped up, and by how many ideas."""

    key: str = Field(min_length=1, max_length=40)
    count: int = Field(ge=1, le=20)


class BucketListRequest(StudioVarietyRequest):
    """Ideas for one Retirement Bucket List.

    ``count`` is the list's length; the service picks the themes and how many
    ideas each carries, and writes spares so the book's own checks can drop a
    few without the list running short.

    ``sections`` is the top-up form: when the client's checks left a theme
    short, it names those themes and how many more each needs, and the service
    writes only those.

    The idea budget is on the request because the page fixes it before an idea
    exists: every idea has to set within the lines its row reserved.
    """

    model_config = ConfigDict(populate_by_name=True)

    count: int = Field(default=100, ge=10, le=120)
    focus: BucketListFocus = "balanced"
    sections: Optional[List[BucketListSectionAsk]] = Field(default=None, max_length=12)
    max_idea_chars: int = Field(default=52, ge=30, le=60, alias="maxIdeaChars")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class BucketListItem(BaseModel):
    """One idea, printed as written. ``concept`` is never printed."""

    idea: str
    concept: str = ""


class BucketListSection(BaseModel):
    """One theme heading and its ideas, spares included, in brief order."""

    model_config = ConfigDict(populate_by_name=True)

    key: str
    title: str
    target: int
    items: List[BucketListItem]


class BucketListModelItem(BaseModel):
    """What the model fills for one idea.

    ``concept`` names the underlying experience in a few plain words ("train
    journey", "watercolour painting"), so two ideas that are the same thing in
    different words can be told apart from two that merely share a verb.
    """

    brief: int
    concept: str
    idea: str


class BucketListModelOutput(BaseModel):
    """Gemini response_schema for Bucket List JSON."""

    items: List[BucketListModelItem]


class BucketListResponse(BaseModel):
    """Every item is one valid idea, distinct from every other in the reply."""

    model_config = ConfigDict(populate_by_name=True)

    sections: List[BucketListSection]
