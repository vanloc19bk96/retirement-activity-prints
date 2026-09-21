from __future__ import annotations

import uuid

from pydantic import BaseModel


class EmojiAssetResponse(BaseModel):
    id: uuid.UUID
    title: str
    slug: str
    imagePublicUrl: str


class ListEmojiAssetsResponse(BaseModel):
    items: list[EmojiAssetResponse]
    nextOffset: int | None = None
    hasMore: bool
