from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, status
from pydantic import ValidationError

from app.core.dependencies import get_current_user_id
from app.schemas.cover import (
    GenerateCoverErrorResponse,
    GenerateCoverRequest,
    GenerateCoverSuccessResponse,
)
from app.services.cover_service import CoverGenerationError, get_cover_service
from app.services.user_service import get_user_service

router = APIRouter(prefix="/cover", tags=["cover"])


def _require_pro_plan(user_id: str) -> None:
    user_service = get_user_service()
    user_row = user_service.get_user_by_id(user_id)
    normalized_plan = (user_row.get("plan") if isinstance(user_row, dict) else None) or ""
    plan = str(normalized_plan).strip().lower()
    if plan != "pro":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AI cover generation requires Pro plan",
        )


@router.post(
    "/generate",
    response_model=GenerateCoverSuccessResponse,
    responses={
        400: {"model": GenerateCoverErrorResponse},
        500: {"model": GenerateCoverErrorResponse},
    },
    summary="Generate AI book cover background artwork",
)
async def generate_cover(
    payload: GenerateCoverRequest = Body(...),
    user_id: str = Depends(get_current_user_id),
) -> GenerateCoverSuccessResponse:
    _require_pro_plan(user_id)

    try:
        result = get_cover_service().generate_cover(request=payload, user_id=user_id)
    except CoverGenerationError as exc:
        status_code = (
            status.HTTP_400_BAD_REQUEST
            if exc.error_code == "VALIDATION_ERROR"
            else status.HTTP_500_INTERNAL_SERVER_ERROR
        )
        raise HTTPException(
            status_code=status_code,
            detail={
                "success": False,
                "errorCode": exc.error_code,
                "message": exc.message,
            },
        ) from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "errorCode": "VALIDATION_ERROR",
                "message": str(exc.errors()[0]["msg"]) if exc.errors() else "Validation failed",
            },
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "success": False,
                "errorCode": "AI_GENERATION_FAILED",
                "message": "Failed to generate cover. Please try again.",
            },
        ) from exc

    return GenerateCoverSuccessResponse(
        imageUrl=result["image_url"],
        generationId=result["generation_id"],
    )
