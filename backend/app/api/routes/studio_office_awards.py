from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_office_awards import OfficeAwardsRequest, OfficeAwardsResponse
from app.services.studio_occupation import OccupationNotSuitableError, OccupationPlanError
from app.services.studio_office_awards_service import (
    OfficeAwardsGenerationError,
    OfficeAwardsRateLimitError,
    generate_office_awards,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/office-awards", response_model=OfficeAwardsResponse)
async def create_office_awards(
    req: OfficeAwardsRequest,
    user_id: str = Depends(get_current_user_id),
) -> OfficeAwardsResponse:
    try:
        return await generate_office_awards(req, user_id=user_id)
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
    except OfficeAwardsRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except OfficeAwardsGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
