from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_decade_trivia import DecadeTriviaRequest, DecadeTriviaResponse
from app.services.studio_decade_trivia_service import (
    DecadeTriviaGenerationError,
    DecadeTriviaRateLimitError,
    generate_decade_trivia,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/decade-trivia", response_model=DecadeTriviaResponse)
async def create_decade_trivia(
    req: DecadeTriviaRequest,
    user_id: str = Depends(get_current_user_id),
) -> DecadeTriviaResponse:
    try:
        return await generate_decade_trivia(req, user_id=user_id)
    except DecadeTriviaRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except DecadeTriviaGenerationError as exc:
        # Includes "nothing survived fact-checking", which is a real outcome for
        # a narrow topic + decade pair, not a server fault — but the client's
        # only useful move is still to retry or widen the selection.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
