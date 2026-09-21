from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class ProjectBookInfo(BaseModel):
    bindingType: str = Field(default="paperback")
    interiorType: str = Field(default="Black & White")
    paperType: str = Field(default="White paper")
    readingDirection: str = Field(default="Left to right")
    trimBookSize: str | None = Field(default=None)
    pageCount: int | None = Field(default=None, ge=24)


class ProjectSettings(BaseModel):
    pageSizeLabel: str = Field(..., description="Canvas page size label (e.g. 8.5 x 11 in)")
    addBleed: bool = Field(..., description="Whether bleed is enabled for full-page content")
    showVisualGuide: bool = Field(..., description="Whether to show Amazon KDP margin guides")
    fitDroppedImagesToPage: bool = Field(
        default=True,
        description="When true, book-cover drops fill back/spine/front zones with print-safe scaling",
    )
    solutionsAtEnd: bool = Field(
        default=False,
        description="When true, studio solution pages are grouped at the end of the book",
    )
    bookInfo: ProjectBookInfo | None = Field(
        default=None,
        description="Book cover metadata used for KDP cover dimension calculations",
    )

class SaveProjectSettingsResponse(BaseModel):
    user_id: UUID
    settings: ProjectSettings


class PageSizeOption(BaseModel):
    label: str = Field(..., description="Page size label (e.g. 8.5 x 11 in)")
    min_plan: str = Field(..., description="Minimum plan required to unlock this size (Starter/Standard/Pro)")
    sort_order: int = Field(..., description="Sort order for UI")
    is_locked: bool = Field(..., description="Whether this option is locked for current user")


class ListPageSizeOptionsResponse(BaseModel):
    options: list[PageSizeOption]

