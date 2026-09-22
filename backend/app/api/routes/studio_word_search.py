from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_word_search import WordSearchRequest, WordSearchResponse
from app.services.studio_word_search_service import (
    WordSearchGenerationError,
    WordSearchRateLimitError,
    generate_word_search,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/word-search", response_model=WordSearchResponse)
async def create_word_search(
    req: WordSearchRequest,
    user_id: str = Depends(get_current_user_id),
) -> WordSearchResponse:
    try:
        return await generate_word_search(req, user_id=user_id)
    except WordSearchRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except (WordSearchGenerationError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
