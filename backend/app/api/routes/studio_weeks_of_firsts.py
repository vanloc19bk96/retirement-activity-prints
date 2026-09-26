from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_weeks_of_firsts import WeeksOfFirstsRequest, WeeksOfFirstsResponse
from app.services.studio_weeks_of_firsts_service import (
    WeeksOfFirstsGenerationError,
    WeeksOfFirstsRateLimitError,
    generate_weeks_of_firsts,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/weeks-of-firsts", response_model=WeeksOfFirstsResponse)
async def create_weeks_of_firsts(
    req: WeeksOfFirstsRequest,
    user_id: str = Depends(get_current_user_id),
) -> WeeksOfFirstsResponse:
    try:
        return await generate_weeks_of_firsts(req, user_id=user_id)
    except WeeksOfFirstsRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except WeeksOfFirstsGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
