from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_riddles_jokes import (
    RiddlesJokesRequest,
    RiddlesJokesResponse,
)
from app.services.studio_riddles_jokes_service import (
    RiddlesJokesGenerationError,
    RiddlesJokesRateLimitError,
    generate_riddles_jokes,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/riddles-and-jokes", response_model=RiddlesJokesResponse)
async def create_riddles_jokes(
    req: RiddlesJokesRequest,
    user_id: str = Depends(get_current_user_id),
) -> RiddlesJokesResponse:
    try:
        return await generate_riddles_jokes(req, user_id=user_id)
    except RiddlesJokesRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except RiddlesJokesGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
