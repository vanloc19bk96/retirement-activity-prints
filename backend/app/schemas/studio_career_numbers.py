from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

CareerNumbersWorkplace = Literal["any", "office", "school", "healthcare", "service", "trades"]
CareerNumbersTone = Literal["playful", "nostalgic"]
CareerNumbersDistance = Literal["miles", "km"]


class CareerNumbersRequest(StudioVarietyRequest):
    """Questions for one Career By the Numbers set.

    The full form plans ``questions`` estimates from different themes plus
    spares, so the book's own checks can drop a few without the set running
    short. ``themes`` is the top-up form: the client names themes its set does
    not use yet, ``count`` how many more questions it wants from them and
    ``tone`` the tone its set is short of, if any.

    Nothing about the retiree is sent -- no name, no employer, no dates. The
    retiree writes every number by hand in the printed book.

    The question and unit budgets are on the request because the page fixes
    them before a question exists: every question has to set within the lines
    its row allows, and every unit beside a writing line of fixed length.
    """

    model_config = ConfigDict(populate_by_name=True)

    workplace: CareerNumbersWorkplace = "any"
    distance: CareerNumbersDistance = "miles"
    questions: int = Field(default=8, ge=4, le=20)
    themes: Optional[List[str]] = Field(default=None, max_length=30)
    count: Optional[int] = Field(default=None, ge=1, le=28)
    tone: Optional[CareerNumbersTone] = None
    max_question_chars: int = Field(default=110, ge=60, le=110, alias="maxQuestionChars")
    max_unit_chars: int = Field(default=16, ge=8, le=16, alias="maxUnitChars")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class CareerNumbersItem(BaseModel):
    """One estimate question and the unit printed beside its writing line.

    ``theme``, ``tone`` and ``shape`` are the brief it was written to, so the
    client can balance a set. ``concept`` names what is being counted. None
    of them is printed.
    """

    question: str
    unit: str
    theme: str
    tone: CareerNumbersTone
    shape: str
    concept: str = ""


class CareerNumbersModelItem(BaseModel):
    """What the model fills for one question.

    ``concept`` names the thing counted in a few plain words ("cups of
    coffee", "meetings attended") so two questions counting the same thing in
    different words can be told apart from two that merely share a word.
    """

    brief: int
    concept: str
    question: str
    unit: str


class CareerNumbersModelOutput(BaseModel):
    """Gemini response_schema for Career By the Numbers JSON."""

    items: List[CareerNumbersModelItem]


class CareerNumbersResponse(BaseModel):
    """Every item is one valid question, distinct from every other in the reply."""

    questions: List[CareerNumbersItem]
