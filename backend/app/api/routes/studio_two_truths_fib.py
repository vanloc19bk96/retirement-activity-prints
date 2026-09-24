from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_two_truths_fib import (
    TwoTruthsFibRequest,
    TwoTruthsFibResponse,
)
from app.services.studio_two_truths_fib_service import (
    TwoTruthsFibGenerationError,
    TwoTruthsFibRateLimitError,
    generate_two_truths_fib,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/two-truths-and-a-fib", response_model=TwoTruthsFibResponse)
async def create_two_truths_fib(
    req: TwoTruthsFibRequest,
    user_id: str = Depends(get_current_user_id),
) -> TwoTruthsFibResponse:
    try:
        return await generate_two_truths_fib(req, user_id=user_id)
    except TwoTruthsFibRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except TwoTruthsFibGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
