from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_hidden_message import (
    HiddenMessageRequest,
    HiddenMessageResponse,
)
from app.services.studio_hidden_message_service import (
    HiddenMessageGenerationError,
    HiddenMessageRateLimitError,
    generate_hidden_message,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/hidden-message-word-search", response_model=HiddenMessageResponse)
async def create_hidden_message(
    req: HiddenMessageRequest,
    user_id: str = Depends(get_current_user_id),
) -> HiddenMessageResponse:
    try:
        return await generate_hidden_message(req, user_id=user_id)
    except HiddenMessageRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except HiddenMessageGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
