from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

QuoteColoringTone = Literal["mixed", "uplifting", "playful", "reflective"]


class QuoteColoringRequest(StudioVarietyRequest):
    """Sayings for one Quote Coloring Page.

    The page prints one saying as large outline lettering, but asks for a few:
    the page still has to set the one it picks in the lettering it can fit, and
    skip any the book already prints. ``max_chars`` is the page's budget for a
    saying at a colorable letter size; a longer one is dropped here rather
    than shipped for the page to shrink.

    ``mixed_topics`` gives every saying its own retirement topic -- what a book
    wants -- rather than a page of sayings on ``theme``.
    """

    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="Life after work", min_length=1, max_length=120)
    mixed_topics: bool = Field(default=True, alias="mixedTopics")
    tone: QuoteColoringTone = "mixed"
    count: int = Field(default=6, ge=1, le=10)
    max_chars: int = Field(default=64, ge=20, le=90, alias="maxChars")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class QuoteColoringItem(BaseModel):
    """One saying, exactly as it will be lettered.

    ``verified`` is only ever true on sayings that passed the blind check.
    """

    text: str
    verified: bool = False


class QuoteColoringModelItem(BaseModel):
    """What the writer fills for one saying, in the order it should think.

    ``idea`` is the saying's one thought in a few words. Naming it first keeps
    the line to a single idea rather than a string of pleasant words; it is
    never printed.
    """

    brief: int
    idea: str
    text: str


class QuoteColoringModelOutput(BaseModel):
    """Gemini response_schema for the writer."""

    items: List[QuoteColoringModelItem]


class QuoteColoringCheckItem(BaseModel):
    """The checker's reading of one numbered saying."""

    index: int
    original: bool
    natural: bool
    clear: bool
    positive: bool
    suitable: bool
    retirement: bool


class QuoteColoringCheckOutput(BaseModel):
    """Gemini response_schema for the blind check."""

    items: List[QuoteColoringCheckItem]


class QuoteColoringResponse(BaseModel):
    """Every item is one distinct saying that passed every gate and the check."""

    items: List[QuoteColoringItem]
