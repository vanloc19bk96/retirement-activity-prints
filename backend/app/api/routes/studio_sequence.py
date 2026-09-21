from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_sequence import SequenceRequest, SequenceResponse
from app.services.studio_sequence_service import (
    SequenceGenerationError,
    SequenceRateLimitError,
    generate_sequences,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/sequence", response_model=SequenceResponse)
async def create_sequences(
    req: SequenceRequest,
    user_id: str = Depends(get_current_user_id),
) -> SequenceResponse:
    try:
        return await generate_sequences(req, user_id=user_id)
    except SequenceRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except SequenceGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
