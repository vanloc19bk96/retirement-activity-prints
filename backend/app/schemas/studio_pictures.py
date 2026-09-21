from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class PictureSetRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    # Square study packs: 4 / 9 / 16. Extras complete a square recall total (≤25).
    target_count: int = Field(default=9, ge=4, le=16, alias="targetCount")
    distractor_count: int = Field(default=7, ge=1, le=21, alias="distractorCount")
    seed: int = Field(default=1, ge=0)


class PictureRef(BaseModel):
    id: str
    url: str
    name: Optional[str] = None
    naturalWidth: Optional[int] = None
    naturalHeight: Optional[int] = None


class PictureSetResponse(BaseModel):
    targets: list[PictureRef]
    options: list[PictureRef]
