from __future__ import annotations

from typing import List

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.studio_variety import StudioVarietyRequest


class RetiredNameRequest(StudioVarietyRequest):
    """Name pools for one "What's Your Retired Name?" lookup page.

    The page prints 26 first names (A-Z) and 12 last names (one per birth
    month). The client asks for spares on top so its own layout and book gates
    can pass a name over without leaving a gap in the table. The character
    budgets are part of the request because the page fixes them before a name
    exists: every name has to set on one line of the column it lands in.

    ``mixed_topics`` asks for one retirement pastime per last name rather than
    a whole table on ``theme`` -- the default a book wants.
    """

    model_config = ConfigDict(populate_by_name=True)

    theme: str = Field(default="Life after work", min_length=1, max_length=120)
    mixed_topics: bool = Field(default=True, alias="mixedTopics")
    first_count: int = Field(default=34, ge=26, le=40, alias="firstCount")
    last_count: int = Field(default=16, ge=12, le=20, alias="lastCount")
    max_first_chars: int = Field(default=10, ge=6, le=12, alias="maxFirstChars")
    max_last_chars: int = Field(default=16, ge=10, le=20, alias="maxLastChars")
    seed: int = Field(default=1, ge=0)


class RetiredFirstNameModelItem(BaseModel):
    """What the model fills for one first name ("Captain", "Breezy")."""

    brief: int
    name: str


class RetiredLastNameModelItem(BaseModel):
    """What the model fills for one last name.

    ``pastime`` is the retirement activity the name is about. Naming it first
    keeps the last name a real *thing + doer* pair ("Hammock Snoozer") instead
    of two words that merely sound retired.
    """

    brief: int
    pastime: str
    name: str


class RetiredNameModelOutput(BaseModel):
    """Gemini response_schema for retired-name JSON (plain keys, no aliases)."""

    first_names: List[RetiredFirstNameModelItem]
    last_names: List[RetiredLastNameModelItem]


class RetiredNameResponse(BaseModel):
    """Every name is valid on its own and distinct from the rest of its list.

    The lists may be shorter than asked when the model kept failing the gates;
    the client tops up or reports an error, and never prints a partial table.
    """

    model_config = ConfigDict(populate_by_name=True)

    first_names: List[str] = Field(default_factory=list, alias="firstNames")
    last_names: List[str] = Field(default_factory=list, alias="lastNames")
