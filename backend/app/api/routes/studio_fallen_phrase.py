from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_fallen_phrase import FallenPhraseRequest, FallenPhraseResponse
from app.services.studio_fallen_phrase_service import (
    FallenPhraseGenerationError,
    FallenPhraseRateLimitError,
    generate_fallen_phrase,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/fallen-phrase", response_model=FallenPhraseResponse)
async def create_fallen_phrase(
    req: FallenPhraseRequest,
    user_id: str = Depends(get_current_user_id),
) -> FallenPhraseResponse:
    try:
        return await generate_fallen_phrase(req, user_id=user_id)
    except FallenPhraseRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except (FallenPhraseGenerationError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
