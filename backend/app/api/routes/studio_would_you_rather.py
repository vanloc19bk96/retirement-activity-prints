from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_would_you_rather import (
    WouldYouRatherRequest,
    WouldYouRatherResponse,
)
from app.services.studio_would_you_rather_service import (
    WouldYouRatherGenerationError,
    WouldYouRatherRateLimitError,
    generate_would_you_rather,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/would-you-rather", response_model=WouldYouRatherResponse)
async def create_would_you_rather(
    req: WouldYouRatherRequest,
    user_id: str = Depends(get_current_user_id),
) -> WouldYouRatherResponse:
    try:
        return await generate_would_you_rather(req, user_id=user_id)
    except WouldYouRatherRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except WouldYouRatherGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
