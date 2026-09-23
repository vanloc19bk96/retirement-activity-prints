from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_phrase_finder import (
    PhraseFinderRequest,
    PhraseFinderResponse,
)
from app.services.studio_phrase_finder_service import (
    PhraseFinderGenerationError,
    PhraseFinderRateLimitError,
    generate_phrase_finder,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/phrase-finder", response_model=PhraseFinderResponse)
async def create_phrase_finder(
    req: PhraseFinderRequest,
    user_id: str = Depends(get_current_user_id),
) -> PhraseFinderResponse:
    try:
        return await generate_phrase_finder(req, user_id=user_id)
    except PhraseFinderRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except (PhraseFinderGenerationError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
