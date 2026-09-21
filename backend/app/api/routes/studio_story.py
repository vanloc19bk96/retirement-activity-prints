from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_story import StoryRecallRequest, StoryRecallResponse
from app.services.studio_story_service import (
    StoryGenerationError,
    StoryRateLimitError,
    generate_story_recall,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/story", response_model=StoryRecallResponse)
async def create_story(
    req: StoryRecallRequest,
    user_id: str = Depends(get_current_user_id),
) -> StoryRecallResponse:
    try:
        return await generate_story_recall(req, user_id=user_id)
    except StoryRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except StoryGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
