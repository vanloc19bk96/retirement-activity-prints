from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.studio_face_names import FaceNameRequest, FaceNameResponse
from app.services.studio_face_names_service import (
    FaceNamesGenerationError,
    FaceNamesRateLimitError,
    generate_face_names,
)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.post("/face-names", response_model=FaceNameResponse)
async def create_face_names(
    req: FaceNameRequest,
    user_id: str = Depends(get_current_user_id),
) -> FaceNameResponse:
    try:
        return await generate_face_names(req, user_id=user_id)
    except FaceNamesRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except FaceNamesGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
