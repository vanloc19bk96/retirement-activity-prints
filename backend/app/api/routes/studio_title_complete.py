from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_title_complete import TitleCompleteRequest, TitleCompleteResponse
from app.services.studio_title_complete_service import (
    TitleCompleteGenerationError,
    TitleCompleteRateLimitError,
    generate_title_complete,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/title-complete", response_model=TitleCompleteResponse)
async def create_title_complete(
    req: TitleCompleteRequest,
    user_id: str = Depends(get_current_user_id),
) -> TitleCompleteResponse:
    try:
        return await generate_title_complete(req, user_id=user_id)
    except TitleCompleteRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except TitleCompleteGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
