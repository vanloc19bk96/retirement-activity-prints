from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

PhraseLength = Literal["short", "medium", "long"]


class PhraseFinderRequest(StudioVarietyRequest):
    """One retirement saying per puzzle, each with the clue that reaches it.

    ``length`` is the only shape field, and it carries the layout with it. The
    page sets a phrase as a run of write-in blanks that wraps across rows, so
    the letter count decides how tall a puzzle stands and therefore how many
    fit a trim. Word counts are enforced here rather than asked for, because
    the rule behind them is a layout rule: a word is never broken across rows,
    and a row is read by counting its blanks.

    ``max_clue_chars`` arrives on the request for the same reason the band
    does: the clue prints in a column the page has already sized, and a clue
    written past that budget is a layout bug rather than a slightly long clue.

    ``item_count`` over-requests on purpose. The page keeps the candidates it
    can both lay out and fairly hide, and the fairness gate is the strict one —
    a phrase of nothing but short words has nowhere to put a given letter — so
    a reply of exactly two may print one.
    """

    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(
        default="retirement lifestyle hobbies", min_length=1, max_length=120
    )
    item_count: int = Field(default=3, ge=1, le=6, alias="itemCount")
    length: PhraseLength = "medium"
    max_clue_chars: int = Field(default=52, ge=16, le=80, alias="maxClueChars")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class PhraseFinderItem(BaseModel):
    """One puzzle: the saying as it prints, and the clue that points to it.

    The clue is not decoration. These sayings are written fresh for a theme
    rather than drawn from common knowledge, so a page of blanks and a handful
    of given letters has no route back to the one wording the answer page
    prints — several plain English sentences fit the same shape. The clue is
    what makes exactly one of them the answer.
    """

    text: str
    clue: str


class PhraseFinderModelOutput(BaseModel):
    """Gemini response_schema for phrase-finder JSON."""

    items: List[PhraseFinderItem]


class PhraseFinderResponse(BaseModel):
    """Uppercase phrases: A-Z, single spaces, and the supported marks only."""

    items: List[PhraseFinderItem]
