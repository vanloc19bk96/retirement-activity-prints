from __future__ import annotations

from typing import List

from pydantic import BaseModel, ConfigDict, Field, field_validator

# The browser sends what it printed recently for this template+theme. Long
# enough to cover a few sheets, short enough that the prompt stays readable.
AVOID_MAX_ITEMS = 80
AVOID_MAX_CHARS = 60


class StudioVarietyRequest(BaseModel):
    """Base for every AI game request: carries the client's "already printed" list.

    The server keeps its own memory (``app.services.studio_variety``), but that
    memory is process-local. This field is what survives a reload, a second API
    worker, and a book generated over two sittings.
    """

    model_config = ConfigDict(populate_by_name=True)

    avoid: List[str] = Field(default_factory=list)

    @field_validator("avoid")
    @classmethod
    def normalize_avoid(cls, value: List[str]) -> List[str]:
        """Trim and cap rather than reject: freshness must never 422 a page."""
        cleaned: list[str] = []
        for raw in value:
            label = str(raw or "").strip()[:AVOID_MAX_CHARS].strip()
            if label:
                cleaned.append(label)
        return cleaned[:AVOID_MAX_ITEMS]
