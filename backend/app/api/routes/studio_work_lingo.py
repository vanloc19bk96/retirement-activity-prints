from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_work_lingo import WorkLingoRequest, WorkLingoResponse
from app.services.studio_work_lingo_service import (
    WorkLingoGenerationError,
    WorkLingoRateLimitError,
    generate_work_lingo,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/work-lingo-match", response_model=WorkLingoResponse)
async def create_work_lingo(
    req: WorkLingoRequest,
    user_id: str = Depends(get_current_user_id),
) -> WorkLingoResponse:
    try:
        return await generate_work_lingo(req, user_id=user_id)
    except WorkLingoRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except WorkLingoGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
