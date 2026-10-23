from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_career_numbers import CareerNumbersRequest, CareerNumbersResponse
from app.services.studio_career_numbers_service import (
    CareerNumbersGenerationError,
    CareerNumbersRateLimitError,
    generate_career_numbers,
)
from app.services.studio_occupation import OccupationNotSuitableError, OccupationPlanError

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/career-numbers", response_model=CareerNumbersResponse)
async def create_career_numbers(
    req: CareerNumbersRequest,
    user_id: str = Depends(get_current_user_id),
) -> CareerNumbersResponse:
    try:
        return await generate_career_numbers(req, user_id=user_id)
    except OccupationNotSuitableError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except OccupationPlanError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except CareerNumbersRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except CareerNumbersGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
