from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_missing_vowels import MissingVowelsRequest, MissingVowelsResponse
from app.services.studio_missing_vowels_service import (
    MissingVowelsGenerationError,
    MissingVowelsRateLimitError,
    generate_missing_vowels,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/missing-vowels", response_model=MissingVowelsResponse)
async def create_missing_vowels(
    req: MissingVowelsRequest,
    user_id: str = Depends(get_current_user_id),
) -> MissingVowelsResponse:
    try:
        return await generate_missing_vowels(req, user_id=user_id)
    except MissingVowelsRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except MissingVowelsGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
