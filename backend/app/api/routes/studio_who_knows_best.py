from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_who_knows_best import WhoKnowsBestRequest, WhoKnowsBestResponse
from app.services.studio_who_knows_best_service import (
    WhoKnowsBestGenerationError,
    WhoKnowsBestRateLimitError,
    generate_who_knows_best,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/who-knows-retiree-best", response_model=WhoKnowsBestResponse)
async def create_who_knows_best(
    req: WhoKnowsBestRequest,
    user_id: str = Depends(get_current_user_id),
) -> WhoKnowsBestResponse:
    try:
        return await generate_who_knows_best(req, user_id=user_id)
    except WhoKnowsBestRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except WhoKnowsBestGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
