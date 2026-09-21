from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.dependencies import get_current_user_id
from app.schemas.emojis import EmojiAssetResponse, ListEmojiAssetsResponse
from app.services.emojis_service import list_emoji_assets

router = APIRouter(prefix="/emojis", tags=["emojis"])


@router.get("/assets", response_model=ListEmojiAssetsResponse)
def get_emoji_assets(
    user_id: str = Depends(get_current_user_id),
    q: str | None = Query(
        default=None,
        description="Substring match on file name (without extension), case-insensitive.",
    ),
    limit: int = Query(default=40, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> ListEmojiAssetsResponse:
    _ = user_id
    try:
        rows, has_more = list_emoji_assets(
            search_query=q,
            limit=limit,
            offset=offset,
        )
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail="Failed to load emoji assets") from exc

    items = [
        EmojiAssetResponse(
            id=r.id,
            title=r.title,
            slug=r.slug,
            imagePublicUrl=r.image_public_url,
        )
        for r in rows
    ]
    next_offset = offset + len(rows) if has_more else None
    return ListEmojiAssetsResponse(
        items=items,
        nextOffset=next_offset,
        hasMore=has_more,
    )
