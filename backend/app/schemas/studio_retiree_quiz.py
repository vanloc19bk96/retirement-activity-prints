from __future__ import annotations

from typing import List

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest


class RetireeQuizRequest(StudioVarietyRequest):
    """Questions and result write-ups for one What Kind of Retiree Are You? quiz.

    The budgets are part of the request because the page fixes them before a
    question exists: every question and answer has to set in the lines its
    block reserved, and every description in the results page's column.

    ``mixed_topics`` asks for one retirement topic per question rather than a
    whole quiz on ``theme`` -- the default a book wants.
    """

    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="Life after work", min_length=1, max_length=120)
    mixed_topics: bool = Field(default=True, alias="mixedTopics")
    count: int = Field(default=14, ge=1, le=16)
    max_question_chars: int = Field(default=84, ge=40, le=100, alias="maxQuestionChars")
    max_answer_chars: int = Field(default=36, ge=24, le=60, alias="maxAnswerChars")
    max_description_chars: int = Field(
        default=150, ge=100, le=240, alias="maxDescriptionChars"
    )
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class RetireeQuizQuestion(BaseModel):
    """One question and its four answers, one per retirement style.

    The style of each answer is carried by its field, never by a position or a
    letter, so no reordering can ever score an answer to the wrong style.
    ``verified`` is only true on questions that passed the blind style check.
    ``topic`` is the brief it answered; never printed.
    """

    model_config = ConfigDict(populate_by_name=True)

    question: str
    explorer: str
    tinkerer: str
    social: str
    napper: str
    topic: str = ""
    verified: bool = False


class RetireeQuizResults(BaseModel):
    """One short write-up per style. Empty when the write-up did not pass."""

    explorer: str = ""
    tinkerer: str = ""
    social: str = ""
    napper: str = ""


class RetireeQuizModelItem(BaseModel):
    """What the writer fills for one question."""

    brief: int
    topic: str
    question: str
    explorer: str
    tinkerer: str
    social: str
    napper: str


class RetireeQuizModelOutput(BaseModel):
    """Gemini response_schema for the writer."""

    items: List[RetireeQuizModelItem]
    results: RetireeQuizResults


class RetireeQuizCheckQuestion(BaseModel):
    """The checker's blind sort of one question's answers, shown as A-D."""

    index: int
    A: str
    B: str
    C: str
    D: str
    clear: bool
    balanced: bool
    suitable: bool


class RetireeQuizCheckResult(BaseModel):
    """The checker's blind read of one write-up."""

    index: int
    style: str
    suitable: bool


class RetireeQuizCheckOutput(BaseModel):
    """Gemini response_schema for the style check."""

    questions: List[RetireeQuizCheckQuestion]
    results: List[RetireeQuizCheckResult]


class RetireeQuizResponse(BaseModel):
    """Every question here is whole, balanced and verified."""

    model_config = ConfigDict(populate_by_name=True)

    questions: List[RetireeQuizQuestion]
    results: RetireeQuizResults
