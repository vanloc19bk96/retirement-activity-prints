from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_ever_or_never import (
    EverOrNeverRequest,
    EverOrNeverResponse,
)
from app.services.studio_ever_or_never_service import (
    EverOrNeverGenerationError,
    EverOrNeverRateLimitError,
    generate_ever_or_never,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/ever-or-never", response_model=EverOrNeverResponse)
async def create_ever_or_never(
    req: EverOrNeverRequest,
    user_id: str = Depends(get_current_user_id),
) -> EverOrNeverResponse:
    try:
        return await generate_ever_or_never(req, user_id=user_id)
    except EverOrNeverRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except EverOrNeverGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
