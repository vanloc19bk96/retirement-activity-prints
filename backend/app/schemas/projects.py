from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.ai_images import ImageType
from app.schemas.cover import CoverImageType


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
    solutionsPerPage: Literal[1, 2, 4] = Field(
        default=1,
        description="Studio solutions printed on one page when they are grouped at the end",
    )
    bookInfo: ProjectBookInfo | None = Field(
        default=None,
        description="Book cover metadata used for KDP cover dimension calculations",
    )

class SaveProjectSettingsResponse(BaseModel):
    user_id: UUID
    settings: ProjectSettings


class AiImageDraftCoverText(BaseModel):
    enabled: bool = False
    text: str = Field(default="", max_length=200)
    position: Literal["top", "center", "bottom"] = "top"


class AiImageDraftCover(BaseModel):
    description: str = Field(default="", max_length=2000)
    imageType: CoverImageType = "none"
    title: AiImageDraftCoverText = Field(default_factory=AiImageDraftCoverText)
    subtitle: AiImageDraftCoverText = Field(default_factory=AiImageDraftCoverText)
    author: AiImageDraftCoverText = Field(
        default_factory=lambda: AiImageDraftCoverText(position="bottom")
    )


class AiImageDraft(BaseModel):
    """What the AI image form holds for a project, kept so it survives closing the editor."""

    isBookCoverMode: bool = False
    idea: str = Field(default="", max_length=4000)
    imageType: ImageType = "none"
    imageSize: Literal["square", "full_page"] = "square"
    cover: AiImageDraftCover = Field(default_factory=AiImageDraftCover)
    generatedImageUrl: str | None = Field(default=None, max_length=2000)
    generatedImageIdea: str | None = Field(default=None, max_length=4000)
    generatedCoverImageUrl: str | None = Field(default=None, max_length=2000)


class AiImageDraftResponse(BaseModel):
    draft: AiImageDraft | None = None


class PageSizeOption(BaseModel):
    label: str = Field(..., description="Page size label (e.g. 8.5 x 11 in)")
    min_plan: str = Field(..., description="Minimum plan required to unlock this size (Starter/Standard/Pro)")
    sort_order: int = Field(..., description="Sort order for UI")
    is_locked: bool = Field(..., description="Whether this option is locked for current user")


class ListPageSizeOptionsResponse(BaseModel):
    options: list[PageSizeOption]



class CurrentProjectResponse(BaseModel):
    """The project an editor tab works on; `name` comes from the hub (None outside hub projects)."""

    id: UUID
    name: str | None = None
    is_hub_project: bool = False


class RenameCurrentProjectRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def _tidy_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Project name cannot be empty")
        return cleaned
