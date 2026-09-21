from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_first_letter_recall import (
    FirstLetterRecallRequest,
    FirstLetterRecallResponse,
)
from app.services.studio_first_letter_recall_service import (
    FirstLetterRecallGenerationError,
    FirstLetterRecallRateLimitError,
    generate_first_letter_recall,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/first-letter-recall", response_model=FirstLetterRecallResponse)
async def create_first_letter_recall(
    req: FirstLetterRecallRequest,
    user_id: str = Depends(get_current_user_id),
) -> FirstLetterRecallResponse:
    try:
        return await generate_first_letter_recall(req, user_id=user_id)
    except FirstLetterRecallRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except (FirstLetterRecallGenerationError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
