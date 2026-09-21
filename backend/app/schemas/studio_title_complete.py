from __future__ import annotations

import re
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.studio_variety import StudioVarietyRequest

TitleCategory = Literal["songs", "films", "tv", "mixed"]
TitleItemCategory = Literal["song", "film", "tv"]
Difficulty = Literal["easy", "standard"]

_PRESET_CATEGORIES = frozenset({"songs", "films", "tv", "mixed"})
_ERA_LABEL_RE = re.compile(r"^\d{4}s$", re.IGNORECASE)
_CUSTOM_CATEGORY_MAX = 80


class TitleCompleteRequest(StudioVarietyRequest):
    model_config = ConfigDict(populate_by_name=True)

    # Preset key or a short custom focus phrase (e.g. "Broadway musicals").
    category: str = Field(default="mixed", min_length=1, max_length=_CUSTOM_CATEGORY_MAX)
    # Preset list, "any", or a normalized decade label (e.g. "1940s", "2010s").
    era: str = Field(default="any", min_length=3, max_length=24)
    difficulty: Difficulty = "standard"
    item_count: int = Field(default=12, ge=6, le=20, alias="itemCount")
    seed: int = Field(default=1, ge=0)
    locale: str = Field(default="en", max_length=16)

    @field_validator("category")
    @classmethod
    def normalize_category(cls, value: str) -> str:
        raw = (value or "").strip()
        if not raw:
            return "mixed"
        lowered = raw.casefold()
        if lowered in _PRESET_CATEGORIES:
            return lowered
        if len(raw) > _CUSTOM_CATEGORY_MAX:
            raise ValueError(f"category must be at most {_CUSTOM_CATEGORY_MAX} characters")
        return raw

    @field_validator("era")
    @classmethod
    def normalize_era(cls, value: str) -> str:
        raw = (value or "").strip()
        if not raw or raw.lower() == "any":
            return "any"
        if not _ERA_LABEL_RE.fullmatch(raw):
            raise ValueError('era must be "any" or look like "1960s" or "2010s"')
        return f"{raw[:4]}s"


class TitleItem(BaseModel):
    display_title: str = Field(alias="displayTitle")
    answer: str
    full_title: str = Field(alias="fullTitle")
    category: TitleItemCategory = "song"
    year: Optional[int] = None

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


class TitleItemDraft(BaseModel):
    """LLM-facing title shape — the blank is computed server-side from `answer`."""

    fullTitle: str
    answer: str
    category: TitleItemCategory = "song"
    year: Optional[int] = None
    confidence: float = 0.0


class TitleCompleteModelOutput(BaseModel):
    """Gemini response_schema for title-complete JSON."""

    items: List[TitleItemDraft]


class TitleCompleteResponse(BaseModel):
    items: List[TitleItem]
