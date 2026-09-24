from __future__ import annotations

from typing import List

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest


class FillInFunniesRequest(StudioVarietyRequest):
    """Stories for one Fill-in Funnies activity.

    The budgets are part of the request because the page fixes them before a
    story exists: every blank needs a row on the word list and every word a
    place on the story page. A story written past them is dropped here rather
    than shipped for the page to discover at layout time.

    ``mixed_topics`` lets every story pick its own retirement situation rather
    than writing all of them on ``theme`` -- the default a book wants.
    """

    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="Life after work", min_length=1, max_length=120)
    mixed_topics: bool = Field(default=True, alias="mixedTopics")
    count: int = Field(default=3, ge=1, le=4)
    min_blanks: int = Field(default=8, ge=6, le=12, alias="minBlanks")
    max_blanks: int = Field(default=10, ge=6, le=14, alias="maxBlanks")
    max_words: int = Field(default=100, ge=60, le=160, alias="maxWords")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class FillInFunniesStory(BaseModel):
    """One story, printed as written.

    ``paragraphs`` carry the placeholders ``[1]``, ``[2]`` ... in order of first
    appearance; ``blanks[i]`` is the kind of word placeholder ``i + 1`` asks
    for. ``premise`` and ``topic`` are never printed: they are what the
    repeat checks compare. ``verified`` is only true on stories that passed
    the blind grammar check.
    """

    model_config = ConfigDict(populate_by_name=True)

    title: str
    paragraphs: List[str]
    blanks: List[str]
    premise: str = ""
    topic: str = ""
    verified: bool = False


class FillInFunniesModelBlank(BaseModel):
    n: int
    kind: str


class FillInFunniesModelStory(BaseModel):
    """What the model fills for one story.

    ``premise`` is named first -- the one situation the story is about -- so
    the story has a clear beginning and ending instead of a list of gags.
    """

    brief: int
    premise: str
    title: str
    paragraphs: List[str]
    blanks: List[FillInFunniesModelBlank]


class FillInFunniesModelOutput(BaseModel):
    """Gemini response_schema for the writer."""

    stories: List[FillInFunniesModelStory]


class FillInFunniesCheckBlank(BaseModel):
    n: int
    fits: List[str]


class FillInFunniesCheckStory(BaseModel):
    index: int
    blanks: List[FillInFunniesCheckBlank]
    complete: bool
    funny: bool
    suitable: bool


class FillInFunniesCheckOutput(BaseModel):
    """Gemini response_schema for the blind checker."""

    stories: List[FillInFunniesCheckStory]


class FillInFunniesResponse(BaseModel):
    """Every story is whole, verified and distinct from the others."""

    model_config = ConfigDict(populate_by_name=True)

    stories: List[FillInFunniesStory]
