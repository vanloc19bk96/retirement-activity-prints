from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_occupation_trivia import (
    OccupationTriviaRequest,
    OccupationTriviaResponse,
)
from app.services.studio_occupation_trivia_service import (
    OccupationTriviaGenerationError,
    OccupationTriviaRateLimitError,
    generate_occupation_trivia,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/occupation-trivia", response_model=OccupationTriviaResponse)
async def create_occupation_trivia(
    req: OccupationTriviaRequest,
    user_id: str = Depends(get_current_user_id),
) -> OccupationTriviaResponse:
    try:
        return await generate_occupation_trivia(req, user_id=user_id)
    except OccupationTriviaRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except OccupationTriviaGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
