from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

RiddlesJokesMix = Literal["both", "riddles", "jokes"]
RiddlesJokesKind = Literal["riddle", "joke"]


class RiddlesJokesRequest(StudioVarietyRequest):
    """Items for one Retirement Riddles & Jokes page.

    The length budgets are part of the request because the page fixes them
    before an item exists: every setup has to set in the lines the page
    reserved, and every answer in the lines the answer page reserved. An item
    written past either is dropped here rather than shipped for the page to
    discover at layout time.

    ``mixed_topics`` asks for one retirement topic per item rather than a whole
    page on ``theme`` -- the default a book wants. ``mix`` says whether the page
    holds riddles, jokes or both.
    """

    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="Life after work", min_length=1, max_length=120)
    mixed_topics: bool = Field(default=True, alias="mixedTopics")
    mix: RiddlesJokesMix = "both"
    count: int = Field(default=12, ge=1, le=16)
    max_setup_chars: int = Field(default=90, ge=40, le=120, alias="maxSetupChars")
    max_answer_chars: int = Field(default=56, ge=20, le=80, alias="maxAnswerChars")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class RiddlesJokesItem(BaseModel):
    """One verified item: the question the reader sees and its answer.

    The answer travels with its setup in one record, so no ordering step on the
    page can print it under another item's number. ``verified`` is only ever
    true on items that passed the blind check.
    """

    model_config = ConfigDict(populate_by_name=True)

    kind: RiddlesJokesKind
    setup: str
    answer: str
    verified: bool = False


class RiddlesJokesModelItem(BaseModel):
    """What the writer fills for one item, in the order it should think.

    ``idea`` is the comic idea in a few words. Naming it first keeps the item to
    one joke rather than a setup in search of a punchline; it is never printed.
    """

    brief: int
    kind: str
    idea: str
    setup: str
    answer: str


class RiddlesJokesModelOutput(BaseModel):
    """Gemini response_schema for the writer."""

    items: List[RiddlesJokesModelItem]


class RiddlesJokesCheckItem(BaseModel):
    """The checker's reading of one setup: which shown answer fits, and its ratings.

    ``match`` is a plain string rather than an enum: the reply is read
    defensively anyway, and anything that is not a shown letter counts as no
    match.
    """

    index: int
    match: str
    clear: bool
    payoff: bool
    one_answer: bool
    fresh: bool
    suitable: bool


class RiddlesJokesCheckOutput(BaseModel):
    """Gemini response_schema for the blind check."""

    items: List[RiddlesJokesCheckItem]


class RiddlesJokesResponse(BaseModel):
    """Every item is one distinct riddle or joke that passed every gate and the check."""

    model_config = ConfigDict(populate_by_name=True)

    items: List[RiddlesJokesItem]
