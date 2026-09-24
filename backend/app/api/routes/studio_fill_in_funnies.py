from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_fill_in_funnies import (
    FillInFunniesRequest,
    FillInFunniesResponse,
)
from app.services.studio_fill_in_funnies_service import (
    FillInFunniesGenerationError,
    FillInFunniesRateLimitError,
    generate_fill_in_funnies,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/fill-in-funnies", response_model=FillInFunniesResponse)
async def create_fill_in_funnies(
    req: FillInFunniesRequest,
    user_id: str = Depends(get_current_user_id),
) -> FillInFunniesResponse:
    try:
        return await generate_fill_in_funnies(req, user_id=user_id)
    except FillInFunniesRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except FillInFunniesGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
