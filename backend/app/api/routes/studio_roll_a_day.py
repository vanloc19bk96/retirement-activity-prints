from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_roll_a_day import RollADayRequest, RollADayResponse
from app.services.studio_roll_a_day_service import (
    RollADayGenerationError,
    RollADayRateLimitError,
    generate_roll_a_day,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/roll-a-day", response_model=RollADayResponse)
async def create_roll_a_day(
    req: RollADayRequest,
    user_id: str = Depends(get_current_user_id),
) -> RollADayResponse:
    try:
        return await generate_roll_a_day(req, user_id=user_id)
    except RollADayRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except RollADayGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
