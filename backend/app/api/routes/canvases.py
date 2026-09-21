from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException

from app.core.dependencies import get_current_user_id

from app.schemas.canvases import GetCanvasesResponse, SaveCanvasesRequest, SaveCanvasesResponse
from app.services.canvases_service import get_canvases, save_canvases

router = APIRouter(prefix="/canvases", tags=["canvases"])


@router.post(
    "/batch",
    response_model=SaveCanvasesResponse,
    summary="Save canvases into retirement_activity_prints.canvases (jsonb)",
)
async def save_canvases_route(
    payload: SaveCanvasesRequest = Body(...),
    user_id_value: str = Depends(get_current_user_id),
) -> SaveCanvasesResponse:
    try:
        user_id = UUID(user_id_value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid user id") from exc

    try:
        result = save_canvases(
            canvases=[c.model_dump() for c in payload.canvases],
            interior_page_count=payload.interior_page_count,
            user_id=user_id,
            referenced_supabase_image_public_urls=payload.referenced_supabase_image_public_urls,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - best-effort error mapping
        raise HTTPException(status_code=500, detail="Failed to save canvases") from exc

    return SaveCanvasesResponse(project_id=result["project_id"], saved=result["saved"])


@router.get(
    "",
    response_model=GetCanvasesResponse,
    summary="Get canvases from retirement_activity_prints.canvases for current project",
)
async def get_canvases_route(
    user_id_value: str = Depends(get_current_user_id),
) -> GetCanvasesResponse:
    try:
        user_id = UUID(user_id_value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid user id") from exc

    try:
        result = get_canvases(user_id=user_id)
    except Exception as exc:  # pragma: no cover - best-effort error mapping
        raise HTTPException(status_code=500, detail="Failed to load canvases") from exc

    return GetCanvasesResponse(project_id=result["project_id"], canvases=result["canvases"])

