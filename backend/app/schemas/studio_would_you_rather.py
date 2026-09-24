from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

WouldYouRatherStyle = Literal["balanced", "thoughtful", "playful"]


class WouldYouRatherRequest(StudioVarietyRequest):
    """Questions for one Would You Rather page, each a pair of balanced choices.

    The option budget is part of the request because the page fixes it before a
    question exists: every choice has to set in the lines its box reserved. A
    pair written past it is dropped here rather than shipped for the page to
    discover at layout time.

    ``mixed_topics`` asks for one retirement topic per question rather than a
    whole page on ``theme`` -- the default a book wants.
    """

    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="Life after work", min_length=1, max_length=120)
    mixed_topics: bool = Field(default=True, alias="mixedTopics")
    style: WouldYouRatherStyle = "balanced"
    count: int = Field(default=7, ge=1, le=10)
    max_option_chars: int = Field(default=60, ge=30, le=80, alias="maxOptionChars")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class WouldYouRatherItem(BaseModel):
    """One dilemma. ``topic`` is the brief it answered; never printed."""

    option_a: str = Field(alias="optionA")
    option_b: str = Field(alias="optionB")
    topic: str = ""

    model_config = ConfigDict(populate_by_name=True)


class WouldYouRatherModelItem(BaseModel):
    """What the model is asked to fill before it writes the two choices.

    ``setup`` is the one situation both choices share and ``dilemma`` the two
    opposite ends of it ("quiet vs lively"). Committing to both first is what
    keeps the sides in one scenario: a pair the model cannot sum up as "X vs Y"
    over a shared setup is usually two unrelated sentences.
    """

    brief: int
    topic: str
    setup: str
    dilemma: str
    optionA: str
    optionB: str


class WouldYouRatherModelOutput(BaseModel):
    """Gemini response_schema for Would You Rather JSON."""

    items: List[WouldYouRatherModelItem]


class WouldYouRatherResponse(BaseModel):
    """Every item is two valid, distinct, balanced choices."""

    model_config = ConfigDict(populate_by_name=True)

    items: List[WouldYouRatherItem]
