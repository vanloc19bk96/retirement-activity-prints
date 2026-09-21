from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.dependencies import get_current_user_id
from app.schemas.outlines import ListOutlineAssetsResponse, OutlineAssetResponse
from app.services.outlines_service import list_outline_assets

router = APIRouter(prefix="/outlines", tags=["outlines"])


@router.get("/assets", response_model=ListOutlineAssetsResponse)
def get_outline_assets(
    user_id: str = Depends(get_current_user_id),
    q: str | None = Query(
        default=None,
        description="Substring match on file name (without extension), case-insensitive. E.g. cat matches cat_jump and kitchen_cat.",
    ),
    limit: int = Query(default=40, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> ListOutlineAssetsResponse:
    _ = user_id
    try:
        rows, has_more = list_outline_assets(
            search_query=q,
            limit=limit,
            offset=offset,
        )
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail="Failed to load outline assets") from exc

    items = [
        OutlineAssetResponse(
            id=r.id,
            collectionId=None,
            title=r.title,
            slug=r.slug,
            tags=r.tags,
            imagePublicUrl=r.image_public_url,
            thumbnailPublicUrl=r.thumbnail_public_url,
        )
        for r in rows
    ]
    next_offset = offset + len(rows) if has_more else None
    return ListOutlineAssetsResponse(
        items=items,
        nextOffset=next_offset,
        hasMore=has_more,
    )
