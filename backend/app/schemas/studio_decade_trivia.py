from __future__ import annotations

import re
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.studio_variety import StudioVarietyRequest

TriviaFormat = Literal["multiple-choice", "short-answer", "fill-blank", "mixed"]
TriviaItemFormat = Literal["multiple-choice", "short-answer", "fill-blank"]
Difficulty = Literal["easy", "standard", "challenging"]
Verdict = Literal["correct", "wrong", "unsure"]

_DECADE_LABEL_RE = re.compile(r"^\d{4}s$", re.IGNORECASE)


class DecadeTriviaRequest(StudioVarietyRequest):
    model_config = ConfigDict(populate_by_name=True)

    # Preset list or any normalized decade label (e.g. "1940s", "2010s").
    decade: str = Field(default="1960s", min_length=5, max_length=24)
    # At least one topic is required: an empty list used to fall back to the
    # defaults, which is how questions from unticked topics reached the page.
    topics: List[str] = Field(min_length=1, max_length=16)
    format: TriviaFormat = "multiple-choice"
    difficulty: Difficulty = "standard"
    question_count: int = Field(default=5, ge=4, le=8, alias="questionCount")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=16)

    @field_validator("decade")
    @classmethod
    def normalize_decade(cls, value: str) -> str:
        raw = (value or "").strip()
        if not _DECADE_LABEL_RE.fullmatch(raw):
            raise ValueError('decade must look like "1960s" or "2010s"')
        return f"{raw[:4]}s"

    @field_validator("topics")
    @classmethod
    def normalize_topics(cls, value: List[str]) -> List[str]:
        cleaned = [t.strip()[:80] for t in value if isinstance(t, str) and t.strip()]
        if not cleaned:
            raise ValueError("select at least one topic")
        return cleaned


class TriviaItem(BaseModel):
    question: str
    options: Optional[List[str]] = None
    answer: str
    topic: str = "general"
    format: TriviaItemFormat = "multiple-choice"


class TriviaItemDraft(BaseModel):
    """LLM-facing trivia shape.

    `confidence` gates the cheap filter and `evidence_year` catches the common
    failure where a model dates a real thing into the wrong decade — the answer
    reads fine, but the fact belongs to another era.
    """

    question: str
    options: Optional[List[str]] = None
    answer: str
    topic: str = "general"
    format: TriviaItemFormat = "multiple-choice"
    confidence: float = 0.0
    evidence_year: Optional[int] = None


class DecadeTriviaModelOutput(BaseModel):
    """Gemini response_schema for decade trivia JSON."""

    items: List[TriviaItemDraft]


class TriviaVerdict(BaseModel):
    """One fact-check result from the independent verification pass.

    `topic` is the checker's own classification, not the writer's claim. Regex
    cues can only reject what someone thought to list, so the topic promise —
    untick a box and that subject disappears — is settled here instead.
    """

    index: int
    verdict: Verdict = "unsure"
    decade_ok: bool = False
    topic: str = ""
    actual_year: Optional[int] = None
    note: str = ""


class DecadeTriviaVerificationOutput(BaseModel):
    """Gemini response_schema for the verification pass."""

    results: List[TriviaVerdict]


class DecadeTriviaResponse(BaseModel):
    decade: str
    items: List[TriviaItem]
