from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_retirement_anagram import (
    RetirementAnagramRequest,
    RetirementAnagramResponse,
)
from app.services.studio_retirement_anagram_service import (
    RetirementAnagramGenerationError,
    RetirementAnagramRateLimitError,
    generate_retirement_anagram,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/retirement-anagram", response_model=RetirementAnagramResponse)
async def create_retirement_anagram(
    req: RetirementAnagramRequest,
    user_id: str = Depends(get_current_user_id),
) -> RetirementAnagramResponse:
    try:
        return await generate_retirement_anagram(req, user_id=user_id)
    except RetirementAnagramRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except RetirementAnagramGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
