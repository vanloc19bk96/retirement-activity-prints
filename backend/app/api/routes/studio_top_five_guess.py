from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_top_five_guess import (
    TopFiveGuessRequest,
    TopFiveGuessResponse,
)
from app.services.studio_top_five_guess_service import (
    TopFiveGuessGenerationError,
    TopFiveGuessRateLimitError,
    generate_top_five_guess,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/top-five-guess", response_model=TopFiveGuessResponse)
async def create_top_five_guess(
    req: TopFiveGuessRequest,
    user_id: str = Depends(get_current_user_id),
) -> TopFiveGuessResponse:
    try:
        return await generate_top_five_guess(req, user_id=user_id)
    except TopFiveGuessRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except TopFiveGuessGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
