from __future__ import annotations

import uuid

from pydantic import BaseModel


class OutlineAssetResponse(BaseModel):
    id: uuid.UUID
    collectionId: uuid.UUID | None = None
    title: str
    slug: str
    tags: list[str]
    imagePublicUrl: str
    thumbnailPublicUrl: str | None = None


class ListOutlineAssetsResponse(BaseModel):
    items: list[OutlineAssetResponse]
    nextOffset: int | None = None
    hasMore: bool
