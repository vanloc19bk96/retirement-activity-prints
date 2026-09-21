from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_word_ladder import WordLadderRequest, WordLadderResponse
from app.services.studio_word_ladder_service import (
    WordLadderGenerationError,
    WordLadderRateLimitError,
    generate_word_ladder,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/word-ladder", response_model=WordLadderResponse)
async def create_word_ladder(
    req: WordLadderRequest,
    user_id: str = Depends(get_current_user_id),
) -> WordLadderResponse:
    try:
        return await generate_word_ladder(req, user_id=user_id)
    except WordLadderRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except (WordLadderGenerationError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
