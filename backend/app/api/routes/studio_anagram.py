from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_anagram import AnagramRequest, AnagramResponse
from app.services.studio_anagram_service import (
    AnagramGenerationError,
    AnagramRateLimitError,
    generate_anagram,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/anagram", response_model=AnagramResponse)
async def create_anagram(
    req: AnagramRequest,
    user_id: str = Depends(get_current_user_id),
) -> AnagramResponse:
    try:
        return await generate_anagram(req, user_id=user_id)
    except AnagramRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except AnagramGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
