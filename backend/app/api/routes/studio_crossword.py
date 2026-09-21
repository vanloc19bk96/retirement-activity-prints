from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_crossword import CrosswordCluesRequest, CrosswordCluesResponse
from app.services.studio_crossword_service import (
    CrosswordClueGenerationError,
    CrosswordRateLimitError,
    generate_crossword_clues,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/crossword-clues", response_model=CrosswordCluesResponse)
async def create_crossword_clues(
    req: CrosswordCluesRequest,
    user_id: str = Depends(get_current_user_id),
) -> CrosswordCluesResponse:
    try:
        return await generate_crossword_clues(req, user_id=user_id)
    except CrosswordRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except CrosswordClueGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
