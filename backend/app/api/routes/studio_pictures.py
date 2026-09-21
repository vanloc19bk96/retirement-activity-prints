from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_pictures import PictureSetRequest, PictureSetResponse
from app.services.studio_pictures_service import (
    PictureLibraryError,
    PictureRateLimitError,
    build_picture_set,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/pictures", response_model=PictureSetResponse)
async def create_picture_set(
    req: PictureSetRequest,
    user_id: str = Depends(get_current_user_id),
) -> PictureSetResponse:
    try:
        return build_picture_set(req, user_id=user_id)
    except PictureRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except PictureLibraryError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
