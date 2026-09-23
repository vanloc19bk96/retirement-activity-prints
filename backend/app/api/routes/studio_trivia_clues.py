from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_trivia_clues import (
    TriviaCluesRequest,
    TriviaCluesResponse,
)
from app.services.studio_trivia_clues_service import (
    TriviaCluesGenerationError,
    TriviaCluesRateLimitError,
    generate_trivia_clues,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/trivia-clue-word-search", response_model=TriviaCluesResponse)
async def create_trivia_clues(
    req: TriviaCluesRequest,
    user_id: str = Depends(get_current_user_id),
) -> TriviaCluesResponse:
    try:
        return await generate_trivia_clues(req, user_id=user_id)
    except TriviaCluesRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except TriviaCluesGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
