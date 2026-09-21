from __future__ import annotations

from typing import List

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest


class WordLadderRequest(StudioVarietyRequest):
    """Themed end words for one sheet of ladders.

    Word length and step count travel with the request because they decide
    whether a pair is usable at all: the browser can only join two words that
    are the same length and no further apart than the number of moves printed.
    """

    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="everyday objects", min_length=1, max_length=120)
    word_length: int = Field(default=4, ge=3, le=5, alias="wordLength")
    steps: int = Field(default=4, ge=2, le=6)
    pair_count: int = Field(default=6, ge=1, le=12, alias="pairCount")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class WordLadderPairDraft(BaseModel):
    """Gemini response_schema pair — `path` is the model's suggested chain."""

    start: str
    target: str
    path: List[str] = Field(default_factory=list)


class WordLadderModelOutput(BaseModel):
    """Gemini response_schema for word-ladder JSON."""

    pairs: List[WordLadderPairDraft]


class WordLadderPair(BaseModel):
    """One usable pair. `path` is empty unless every rung checked out."""

    start: str
    target: str
    path: List[str] = Field(default_factory=list)


class WordLadderResponse(BaseModel):
    pairs: List[WordLadderPair]
