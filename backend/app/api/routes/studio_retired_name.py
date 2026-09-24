from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_retired_name import (
    RetiredNameRequest,
    RetiredNameResponse,
)
from app.services.studio_retired_name_service import (
    RetiredNameGenerationError,
    RetiredNameRateLimitError,
    generate_retired_name,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/retired-name", response_model=RetiredNameResponse)
async def create_retired_name(
    req: RetiredNameRequest,
    user_id: str = Depends(get_current_user_id),
) -> RetiredNameResponse:
    try:
        return await generate_retired_name(req, user_id=user_id)
    except RetiredNameRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except RetiredNameGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
