from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_bucket_list import BucketListRequest, BucketListResponse
from app.services.studio_bucket_list_service import (
    BucketListGenerationError,
    BucketListRateLimitError,
    generate_bucket_list,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/bucket-list", response_model=BucketListResponse)
async def create_bucket_list(
    req: BucketListRequest,
    user_id: str = Depends(get_current_user_id),
) -> BucketListResponse:
    try:
        return await generate_bucket_list(req, user_id=user_id)
    except BucketListRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except BucketListGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
