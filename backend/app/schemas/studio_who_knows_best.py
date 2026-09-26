from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

WhoKnowsBestAudience = Literal["mixed", "work", "family"]
WhoKnowsBestAnswer = Literal["word", "phrase", "sentence"]


class WhoKnowsBestRequest(StudioVarietyRequest):
    """Questions for one Who Knows the Retiree Best? set.

    The full form plans twelve questions from twelve different topics plus
    spares, so the book's own checks can drop a few without the set running
    short. ``topics`` is the top-up form: the client names topics its set does
    not use yet, and ``count`` how many more questions it wants from them.

    Nothing about the retiree is sent -- not even a name. The questions are
    written so anyone who knows the retiree can guess, and the retiree writes
    the real answers in the book.

    The question budget is on the request because the page fixes it before a
    question exists: every question has to set within the lines its block
    allows.
    """

    model_config = ConfigDict(populate_by_name=True)

    audience: WhoKnowsBestAudience = "mixed"
    topics: Optional[List[str]] = Field(default=None, max_length=20)
    count: Optional[int] = Field(default=None, ge=1, le=24)
    max_question_chars: int = Field(default=80, ge=40, le=80, alias="maxQuestionChars")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class WhoKnowsBestItem(BaseModel):
    """One question, printed as written.

    ``topic`` and ``shape`` are the brief it was written to, so the client can
    balance a set. ``answer`` is how much room a handwritten answer needs.
    ``concept`` names the detail the question asks about. None of them is
    printed.
    """

    question: str
    topic: str
    shape: str
    answer: WhoKnowsBestAnswer
    concept: str = ""


class WhoKnowsBestModelItem(BaseModel):
    """What the model fills for one question.

    ``concept`` names the underlying detail in a few plain words ("first job",
    "coffee order") so two questions about the same detail in different words
    can be told apart from two that merely share a word.
    """

    brief: int
    concept: str
    question: str
    answer: str


class WhoKnowsBestModelOutput(BaseModel):
    """Gemini response_schema for Who Knows the Retiree Best? JSON."""

    items: List[WhoKnowsBestModelItem]


class WhoKnowsBestResponse(BaseModel):
    """Every item is one valid question, distinct from every other in the reply."""

    questions: List[WhoKnowsBestItem]
