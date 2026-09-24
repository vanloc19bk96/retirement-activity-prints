from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

EverOrNeverStyle = Literal["balanced", "gentle", "playful"]


class EverOrNeverRequest(StudioVarietyRequest):
    """Statements for one Ever or Never page.

    The statement budget is part of the request because the page fixes it
    before a statement exists: every one has to set in the lines its row
    reserved. A statement written past it is dropped here rather than shipped
    for the page to discover at layout time.

    ``mixed_topics`` asks for one retirement topic per statement rather than a
    whole page on ``theme`` -- the default a book wants.
    """

    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="Life after work", min_length=1, max_length=120)
    mixed_topics: bool = Field(default=True, alias="mixedTopics")
    style: EverOrNeverStyle = "balanced"
    count: int = Field(default=12, ge=1, le=16)
    max_statement_chars: int = Field(default=64, ge=30, le=80, alias="maxStatementChars")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class EverOrNeverItem(BaseModel):
    """One statement, printed as written ("Ever ... ?"). ``topic`` is never printed."""

    statement: str
    topic: str = ""

    model_config = ConfigDict(populate_by_name=True)


class EverOrNeverModelItem(BaseModel):
    """What the model fills for one statement.

    ``moment`` is the one concrete thing that either happened or did not. Naming
    it first keeps the statement to a single, answerable experience instead of
    a vague habit ("ever enjoyed retirement?") or two things at once.
    """

    brief: int
    topic: str
    moment: str
    statement: str


class EverOrNeverModelOutput(BaseModel):
    """Gemini response_schema for Ever or Never JSON."""

    items: List[EverOrNeverModelItem]


class EverOrNeverResponse(BaseModel):
    """Every item is one valid, distinct statement."""

    model_config = ConfigDict(populate_by_name=True)

    items: List[EverOrNeverItem]
