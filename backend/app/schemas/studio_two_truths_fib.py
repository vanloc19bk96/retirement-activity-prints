from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

TwoTruthsFibSubject = Literal[
    "mixed", "work", "inventions", "home", "leisure", "travel", "customs", "food", "nature", "custom"
]
TwoTruthsFibLevel = Literal["gentle", "classic", "challenging"]


class TwoTruthsFibRequest(StudioVarietyRequest):
    """Sets for one Two Truths and a Fib page.

    The length budgets are part of the request because the page fixes them
    before a set exists: every statement has to set in the lines its row
    reserved, the title on one line, and the correction in the lines the
    answer page reserved. A set written past any of them is dropped here
    rather than shipped for the page to discover at layout time.

    ``subject`` picks the pool of subject domains the briefs are drawn from;
    ``mixed`` draws every set from a different pool -- the default a book wants.
    ``custom_subject`` is only read when ``subject`` is ``custom``.
    """

    model_config = ConfigDict(populate_by_name=True)

    subject: TwoTruthsFibSubject = "mixed"
    custom_subject: str = Field(default="", max_length=120, alias="customSubject")
    level: TwoTruthsFibLevel = "classic"
    count: int = Field(default=6, ge=1, le=8)
    max_statement_chars: int = Field(default=96, ge=40, le=120, alias="maxStatementChars")
    max_title_chars: int = Field(default=28, ge=12, le=40, alias="maxTitleChars")
    max_fact_chars: int = Field(default=110, ge=40, le=140, alias="maxFactChars")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class TwoTruthsFibItem(BaseModel):
    """One verified set: two true statements, the fib, and the correction.

    The answer is carried by the shape, not by an index: the fib is its own
    field, so no ordering step can ever point the answer key at a true
    statement. The page decides where the fib sits. ``verified`` is only ever
    true on items that passed the blind fact check.
    """

    model_config = ConfigDict(populate_by_name=True)

    title: str
    truths: List[str]
    fib: str
    fact: str
    verified: bool = False


class TwoTruthsFibModelItem(BaseModel):
    """What the writer fills for one set, in the order it should think."""

    brief: int
    title: str
    truths: List[str]
    fib: str
    fact: str


class TwoTruthsFibModelOutput(BaseModel):
    """Gemini response_schema for the writer."""

    items: List[TwoTruthsFibModelItem]


class TwoTruthsFibCheckSet(BaseModel):
    """The checker's reading of one set, statements in the order it was shown them.

    Plain strings rather than enums: the reply is read defensively anyway, and
    anything other than "true" / "false" counts as unsure.
    """

    index: int
    verdicts: List[str]
    coherent: bool
    plausible: bool
    suitable: bool


class TwoTruthsFibCheckFact(BaseModel):
    index: int
    verdict: str


class TwoTruthsFibCheckOutput(BaseModel):
    """Gemini response_schema for the blind fact check."""

    sets: List[TwoTruthsFibCheckSet]
    facts: List[TwoTruthsFibCheckFact]


class TwoTruthsFibResponse(BaseModel):
    """Every item is one distinct set that passed every gate and the fact check."""

    model_config = ConfigDict(populate_by_name=True)

    items: List[TwoTruthsFibItem]
