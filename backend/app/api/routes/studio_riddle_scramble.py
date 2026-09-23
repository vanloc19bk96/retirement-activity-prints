from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_riddle_scramble import (
    RiddleScrambleRequest,
    RiddleScrambleResponse,
)
from app.services.studio_riddle_scramble_service import (
    RiddleScrambleGenerationError,
    RiddleScrambleRateLimitError,
    generate_riddle_scramble,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/riddle-scramble", response_model=RiddleScrambleResponse)
async def create_riddle_scramble(
    req: RiddleScrambleRequest,
    user_id: str = Depends(get_current_user_id),
) -> RiddleScrambleResponse:
    try:
        return await generate_riddle_scramble(req, user_id=user_id)
    except RiddleScrambleRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except RiddleScrambleGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
