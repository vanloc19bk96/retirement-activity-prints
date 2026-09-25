from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest

# One entry per profile in app/data/studio/occupation-trivia/prompt.json; a test
# keeps the two identical. Adding an occupation is a profile there, a value here
# and an option on the frontend.
OccupationKey = Literal[
    "teacher", "nurse", "police", "military", "trucker", "engineer", "accountant", "postal"
]
OccupationTriviaLevel = Literal["gentle", "classic", "challenging"]


class OccupationTriviaRequest(StudioVarietyRequest):
    """Questions for one Occupation Trivia Pack.

    The length budgets are part of the request because the pages fix them
    before a question exists: a question has to set in the lines its block
    reserves, a choice beside its letter, and a note on the one answer page. A
    question written past any of them is dropped here rather than shipped for
    the page to discover at layout time.
    """

    model_config = ConfigDict(populate_by_name=True)

    occupation: OccupationKey = "teacher"
    level: OccupationTriviaLevel = "classic"
    count: int = Field(default=14, ge=1, le=16)
    max_question_chars: int = Field(default=120, ge=60, le=150, alias="maxQuestionChars")
    max_choice_chars: int = Field(default=36, ge=12, le=40, alias="maxChoiceChars")
    max_explanation_chars: int = Field(default=80, ge=40, le=120, alias="maxExplanationChars")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=8)


class OccupationTriviaQuestion(BaseModel):
    """One verified multiple-choice question.

    The right answer is carried by the shape, not by an index: ``answer`` is its
    own field and ``distractors`` are the three wrong choices, so no shuffling
    or lettering step can ever point the answer key at a wrong choice. The page
    decides which letter the answer sits under. ``topic`` names the underlying
    fact, so a reworded question about the same fact is caught as a repeat.
    ``verified`` is only ever true on questions that passed the blind check.
    """

    model_config = ConfigDict(populate_by_name=True)

    topic: str
    question: str
    answer: str
    distractors: List[str]
    explanation: str
    verified: bool = False


class OccupationTriviaModelItem(BaseModel):
    """What the writer fills for one question, in the order it should think."""

    brief: int
    area: str
    topic: str
    question: str
    answer: str
    distractors: List[str]
    explanation: str


class OccupationTriviaModelOutput(BaseModel):
    """Gemini response_schema for the writer."""

    items: List[OccupationTriviaModelItem]


class OccupationTriviaCheckItem(BaseModel):
    """The checker's reading of one question, choices in the order it was shown them.

    ``answer`` is a plain string rather than an enum: the reply is read
    defensively anyway, and anything that is not a shown letter counts as no
    answer.
    """

    index: int
    answer: str
    certain: bool
    on_topic: bool
    clear: bool
    plausible: bool
    fair: bool
    suitable: bool
    duplicate_of: int = 0


class OccupationTriviaCheckNote(BaseModel):
    index: int
    verdict: str


class OccupationTriviaCheckOutput(BaseModel):
    """Gemini response_schema for the blind check."""

    items: List[OccupationTriviaCheckItem]
    notes: List[OccupationTriviaCheckNote]


class OccupationTriviaResponse(BaseModel):
    """Every question is distinct, on the occupation, and passed every gate and the blind check."""

    model_config = ConfigDict(populate_by_name=True)

    occupation: OccupationKey
    questions: List[OccupationTriviaQuestion]
