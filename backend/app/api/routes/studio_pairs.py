from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_pairs import PairRequest, PairResponse
from app.services.studio_pairs_service import (
    PairGenerationError,
    PairRateLimitError,
    generate_pairs,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/pairs", response_model=PairResponse)
async def create_pairs(
    req: PairRequest,
    user_id: str = Depends(get_current_user_id),
) -> PairResponse:
    try:
        return await generate_pairs(req, user_id=user_id)
    except PairRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except PairGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
