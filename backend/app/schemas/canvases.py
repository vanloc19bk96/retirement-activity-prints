from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class SaveCanvasItem(BaseModel):
    page_index: int = Field(..., ge=0, description="0-based page index")
    canvas_type: Literal["interior", "cover"] = Field(..., description="Canvas type (interior or cover)")
    canvas_data: dict[str, Any] = Field(..., description="Fabric canvas JSON payload")


class SaveCanvasesRequest(BaseModel):
    # The frontend sends a (usually partial) set of canvases to persist.
    # Backend uses `page_index` values to update/replace rows, and may
    # prune obsolete interior pages that are no longer in the current order.
    interior_page_count: int = Field(
        ...,
        ge=1,
        description="Number of interior pages currently in the editor (0-based page indices)",
    )
    canvases: list[SaveCanvasItem] = Field(..., min_length=0)
    referenced_supabase_image_public_urls: list[str] = Field(
        default_factory=list,
        description=(
            "All Fabric image src values across every canvas in the editor; "
            "used to remove orphan objects under the user's processed/ prefix in storage"
        ),
    )


class SavedCanvas(BaseModel):
    page_index: int


class SaveCanvasesResponse(BaseModel):
    project_id: UUID
    saved: list[SavedCanvas]


class LoadedCanvasItem(BaseModel):
    canvas_type: Literal["interior", "cover"]
    page_index: int = Field(..., ge=0)
    canvas_data: dict[str, Any] = Field(..., description="Fabric canvas JSON payload")


class GetCanvasesResponse(BaseModel):
    project_id: UUID
    canvases: list[LoadedCanvasItem]

