from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_quote_coloring import (
    QuoteColoringRequest,
    QuoteColoringResponse,
)
from app.services.studio_quote_coloring_service import (
    QuoteColoringGenerationError,
    QuoteColoringRateLimitError,
    generate_quote_coloring,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/quote-coloring", response_model=QuoteColoringResponse)
async def create_quote_coloring(
    req: QuoteColoringRequest,
    user_id: str = Depends(get_current_user_id),
) -> QuoteColoringResponse:
    try:
        return await generate_quote_coloring(req, user_id=user_id)
    except QuoteColoringRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except (QuoteColoringGenerationError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
