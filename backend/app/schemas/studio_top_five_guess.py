from __future__ import annotations

from typing import List

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest


class TopFiveGuessRequest(StudioVarietyRequest):
    """Questions for one Top Five Guess page, each with its five ranked answers.

    Both budgets are part of the request because the page fixes them before a
    question exists: the question has to set in the lines the page reserved,
    and every answer has to fit on one printed answer line beside its points.
    A set written past either is dropped here rather than shipped for the page
    to discover at layout time.

    Points are deliberately absent. The page scores rank 1-5 as 5-4-3-2-1, so
    the model only decides the order and can never hand back a ranking that
    disagrees with its own scores.
    """

    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="Life after work", min_length=1, max_length=120)
    count: int = Field(default=4, ge=1, le=8)
    max_question_chars: int = Field(default=90, ge=40, le=120, alias="maxQuestionChars")
    max_answer_chars: int = Field(default=24, ge=10, le=32, alias="maxAnswerChars")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class TopFiveGuessItem(BaseModel):
    """One question and its five answers, most likely first."""

    question: str
    answers: List[str]


class TopFiveGuessModelOutput(BaseModel):
    """Gemini response_schema for Top Five Guess JSON."""

    items: List[TopFiveGuessItem]


class TopFiveGuessResponse(BaseModel):
    """Every item has exactly five distinct answers, ranked most likely first."""

    items: List[TopFiveGuessItem]
