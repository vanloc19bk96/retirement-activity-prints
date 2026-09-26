from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

OfficeAwardsWorkplace = Literal["any", "office", "school", "healthcare", "service", "trades"]
OfficeAwardsTone = Literal["playful", "warm"]


class OfficeAwardsRequest(StudioVarietyRequest):
    """Award titles for one Office Awards: Retirement Edition set.

    The full form plans ``awards`` titles from different themes plus spares,
    so the book's own checks can drop a few without the set running short.
    ``themes`` is the top-up form: the client names themes its set does not
    use yet, ``count`` how many more titles it wants from them and ``tone``
    the tone its set is short of, if any.

    Nothing about the retiree or the team is sent -- no names, no coworker
    list. Coworkers write the winners' names in the printed book.

    The title budget is on the request because the page fixes it before a
    title exists: every title has to set within the lines its card allows.
    """

    model_config = ConfigDict(populate_by_name=True)

    workplace: OfficeAwardsWorkplace = "any"
    awards: int = Field(default=12, ge=4, le=24)
    themes: Optional[List[str]] = Field(default=None, max_length=30)
    count: Optional[int] = Field(default=None, ge=1, le=32)
    tone: Optional[OfficeAwardsTone] = None
    max_award_chars: int = Field(default=48, ge=24, le=48, alias="maxAwardChars")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class OfficeAwardsItem(BaseModel):
    """One award title, printed as written.

    ``theme``, ``tone`` and ``shape`` are the brief it was written to, so the
    client can balance a set. ``concept`` names the underlying habit or
    quality. None of them is printed.
    """

    award: str
    theme: str
    tone: OfficeAwardsTone
    shape: str
    concept: str = ""


class OfficeAwardsModelItem(BaseModel):
    """What the model fills for one award.

    ``concept`` names the idea behind the title in a few plain words ("spare
    pen supply", "printer rescue") so two titles for the same idea in
    different words can be told apart from two that merely share a word.
    """

    brief: int
    concept: str
    award: str


class OfficeAwardsModelOutput(BaseModel):
    """Gemini response_schema for Office Awards JSON."""

    items: List[OfficeAwardsModelItem]


class OfficeAwardsResponse(BaseModel):
    """Every item is one valid award, distinct from every other in the reply."""

    awards: List[OfficeAwardsItem]
