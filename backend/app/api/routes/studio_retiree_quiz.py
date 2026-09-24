from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_retiree_quiz import RetireeQuizRequest, RetireeQuizResponse
from app.services.studio_retiree_quiz_service import (
    RetireeQuizGenerationError,
    RetireeQuizRateLimitError,
    generate_retiree_quiz,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/what-kind-of-retiree", response_model=RetireeQuizResponse)
async def create_retiree_quiz(
    req: RetireeQuizRequest,
    user_id: str = Depends(get_current_user_id),
) -> RetireeQuizResponse:
    try:
        return await generate_retiree_quiz(req, user_id=user_id)
    except RetireeQuizRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except RetireeQuizGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
