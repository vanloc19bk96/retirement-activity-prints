from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

WorkLingoLevel = Literal["gentle", "classic", "challenging"]


class WorkLingoRequest(StudioVarietyRequest):
    """Pairs for one Work Lingo Match page.

    The length budgets are part of the request because the page fixes them
    before a pair exists: every phrase has to set on one line of its row, and
    every meaning in the lines the page reserved. A pair written past either is
    dropped here rather than shipped for the page to discover at layout time.

    ``level`` says how familiar the phrases should be.
    """

    model_config = ConfigDict(populate_by_name=True)

    level: WorkLingoLevel = "classic"
    count: int = Field(default=14, ge=1, le=16)
    max_phrase_chars: int = Field(default=28, ge=12, le=32, alias="maxPhraseChars")
    max_meaning_chars: int = Field(default=50, ge=24, le=56, alias="maxMeaningChars")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class WorkLingoPair(BaseModel):
    """One verified pair: the workplace phrase and its plain-English meaning.

    The meaning travels with its phrase in one record, so no ordering or
    lettering step on the page can pair it with another phrase. ``verified`` is
    only ever true on pairs that passed the blind check, as members of the very
    set they are returned in.
    """

    model_config = ConfigDict(populate_by_name=True)

    phrase: str
    meaning: str
    verified: bool = False


class WorkLingoModelItem(BaseModel):
    """What the writer fills for one pair, in the order it should think."""

    brief: int
    area: str
    phrase: str
    meaning: str


class WorkLingoModelOutput(BaseModel):
    """Gemini response_schema for the writer."""

    items: List[WorkLingoModelItem]


class WorkLingoCheckItem(BaseModel):
    """The checker's reading of one phrase: which shown meaning fits, and its ratings.

    ``match`` is a plain string rather than an enum: the reply is read
    defensively anyway, and anything that is not a shown letter counts as no
    match.
    """

    index: int
    match: str
    real: bool
    accurate: bool
    one_meaning: bool
    familiar: bool
    suitable: bool


class WorkLingoCheckOutput(BaseModel):
    """Gemini response_schema for the blind check."""

    items: List[WorkLingoCheckItem]


class WorkLingoResponse(BaseModel):
    """Every pair is a distinct phrase whose meaning fits it and no other pair's phrase.

    The pairs were checked together, as one set: any subset of them is a fair
    matching puzzle, but pairs from two responses were never checked against
    each other and must not share a page.
    """

    model_config = ConfigDict(populate_by_name=True)

    pairs: List[WorkLingoPair]
