from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from app.core.dependencies import get_current_user_id
from app.services.thumbnail_asset_service import fetch_image_bytes_for_thumbnail

router = APIRouter(prefix="/thumbnail-asset", tags=["thumbnail-asset"])


@router.get("", summary="Proxy a remote image for same-origin thumbnail rendering (CORS-safe)")
def get_thumbnail_asset(
    url: str = Query(..., min_length=8, max_length=4096, description="Absolute http(s) image URL"),
    user_id: str = Depends(get_current_user_id),
) -> Response:
    _ = user_id
    body, content_type = fetch_image_bytes_for_thumbnail(url)
    return Response(
        content=body,
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=300"},
    )
