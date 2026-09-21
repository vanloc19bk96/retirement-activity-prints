from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_theme_words import ThemeWordsRequest, ThemeWordsResponse
from app.services.studio_theme_words_service import (
    ThemeWordsGenerationError,
    ThemeWordsRateLimitError,
    generate_theme_words,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/theme-words", response_model=ThemeWordsResponse)
async def create_theme_words(
    req: ThemeWordsRequest,
    user_id: str = Depends(get_current_user_id),
) -> ThemeWordsResponse:
    try:
        return await generate_theme_words(req, user_id=user_id)
    except ThemeWordsRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except (ThemeWordsGenerationError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
