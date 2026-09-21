from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_list import ListRecallRequest, ListRecallResponse
from app.services.studio_list_service import (
    ListGenerationError,
    ListRateLimitError,
    generate_list_recall,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/list", response_model=ListRecallResponse)
async def create_list(
    req: ListRecallRequest,
    user_id: str = Depends(get_current_user_id),
) -> ListRecallResponse:
    try:
        return await generate_list_recall(req, user_id=user_id)
    except ListRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except ListGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
