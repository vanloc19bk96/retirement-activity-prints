from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_life_timeline import LifeTimelineRequest, LifeTimelineResponse
from app.services.studio_life_timeline_service import (
    LifeTimelineGenerationError,
    LifeTimelineRateLimitError,
    generate_life_prompts,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/life-prompts", response_model=LifeTimelineResponse)
async def create_life_prompts(
    req: LifeTimelineRequest,
    user_id: str = Depends(get_current_user_id),
) -> LifeTimelineResponse:
    try:
        return await generate_life_prompts(req, user_id=user_id)
    except LifeTimelineRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except LifeTimelineGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
