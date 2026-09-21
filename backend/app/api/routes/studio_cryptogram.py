from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_cryptogram import CryptogramRequest, CryptogramResponse
from app.services.studio_cryptogram_service import (
    CryptogramGenerationError,
    CryptogramRateLimitError,
    generate_cryptogram,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/cryptogram", response_model=CryptogramResponse)
async def create_cryptogram(
    req: CryptogramRequest,
    user_id: str = Depends(get_current_user_id),
) -> CryptogramResponse:
    try:
        return await generate_cryptogram(req, user_id=user_id)
    except CryptogramRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except (CryptogramGenerationError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
