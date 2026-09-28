from __future__ import annotations

from typing import Any, List

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

    @field_validator("avoid", mode="before")
    @classmethod
    def bound_raw_avoid(cls, value: Any) -> List[str]:
        """Cap the raw list before item validation, and drop non-text entries.

        A client can post thousands of entries or a stray number; neither may
        cost per-item validation work or 422 the page.
        """
        if not isinstance(value, (list, tuple)):
            return []
        return [
            item[: AVOID_MAX_CHARS * 4]
            for item in value[: AVOID_MAX_ITEMS * 2]
            if isinstance(item, str)
        ]

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
