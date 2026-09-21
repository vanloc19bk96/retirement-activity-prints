from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_category_fluency import (
    CategoryFluencyRequest,
    CategoryFluencyResponse,
)
from app.services.studio_category_fluency_service import (
    CategoryFluencyGenerationError,
    CategoryFluencyRateLimitError,
    generate_category_fluency,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/category-fluency", response_model=CategoryFluencyResponse)
async def create_category_fluency(
    req: CategoryFluencyRequest,
    user_id: str = Depends(get_current_user_id),
) -> CategoryFluencyResponse:
    try:
        return await generate_category_fluency(req, user_id=user_id)
    except CategoryFluencyRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except CategoryFluencyGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
