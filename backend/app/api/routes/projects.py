from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException

from app.core.dependencies import get_current_user_id

from app.schemas.projects import (
    ListPageSizeOptionsResponse,
    PageSizeOption,
    ProjectSettings,
    SaveProjectSettingsResponse,
)
from app.services.page_size_service import list_page_size_options
from app.services.projects_service import get_project_settings, save_project_settings

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post(
    "/settings",
    response_model=SaveProjectSettingsResponse,
    summary="Save canvas settings into projects.settings (jsonb)",
)
async def save_settings(
    payload: ProjectSettings = Body(...),
    user_id_value: str = Depends(get_current_user_id),
) -> SaveProjectSettingsResponse:
    try:
        user_id = UUID(user_id_value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid user id") from exc

    try:
        saved_settings = save_project_settings(settings=payload.model_dump(), user_id=user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - best-effort error mapping
        raise HTTPException(status_code=500, detail="Failed to save settings") from exc

    return SaveProjectSettingsResponse(user_id=user_id, settings=saved_settings)


@router.get(
    "/settings",
    response_model=SaveProjectSettingsResponse,
    summary="Get canvas settings from projects.settings (jsonb)",
)
async def get_settings(user_id_value: str = Depends(get_current_user_id)) -> SaveProjectSettingsResponse:
    try:
        user_id = UUID(user_id_value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid user id") from exc

    saved_settings = get_project_settings(user_id=user_id)
    return SaveProjectSettingsResponse(user_id=user_id, settings=saved_settings)


@router.get(
    "/page-size-options",
    response_model=ListPageSizeOptionsResponse,
    summary="List available page sizes (locked by plan)",
)
async def list_page_sizes(user_id_value: str = Depends(get_current_user_id)) -> ListPageSizeOptionsResponse:
    uid = (user_id_value or "").strip()
    if not uid:
        raise HTTPException(status_code=401, detail="Missing user context")

    options = list_page_size_options(user_id=uid)
    return ListPageSizeOptionsResponse(
        options=[
            PageSizeOption(
                label=o.label,
                min_plan=o.min_plan,
                sort_order=o.sort_order,
                is_locked=o.is_locked,
            )
            for o in options
        ]
    )

