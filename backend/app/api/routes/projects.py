from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException

from app.core.dependencies import ProjectContext, get_current_project, get_current_user_id

from app.schemas.projects import (
    CurrentProjectResponse,
    ListPageSizeOptionsResponse,
    PageSizeOption,
    ProjectSettings,
    RenameCurrentProjectRequest,
    SaveProjectSettingsResponse,
)
from app.services import hub_projects_client
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
    project: ProjectContext = Depends(get_current_project),
) -> SaveProjectSettingsResponse:
    try:
        saved_settings = save_project_settings(settings=payload.model_dump(), project_id=project.project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - best-effort error mapping
        raise HTTPException(status_code=500, detail="Failed to save settings") from exc

    return SaveProjectSettingsResponse(user_id=project.user_id, settings=saved_settings)


@router.get(
    "/settings",
    response_model=SaveProjectSettingsResponse,
    summary="Get canvas settings from projects.settings (jsonb)",
)
async def get_settings(project: ProjectContext = Depends(get_current_project)) -> SaveProjectSettingsResponse:
    saved_settings = get_project_settings(project_id=project.project_id)
    return SaveProjectSettingsResponse(user_id=project.user_id, settings=saved_settings)


@router.get(
    "/current",
    response_model=CurrentProjectResponse,
    summary="The project this editor tab works on, named as in the hub",
)
async def get_current_project_info(project: ProjectContext = Depends(get_current_project)) -> CurrentProjectResponse:
    hub_project = hub_projects_client.get_project(project.launch_token) if project.is_hub_project else None
    return CurrentProjectResponse(
        id=project.project_id,
        name=(hub_project or {}).get("name"),
        is_hub_project=project.is_hub_project,
    )


@router.patch(
    "/current",
    response_model=CurrentProjectResponse,
    summary="Rename this tab's project (the name lives in the hub)",
)
async def rename_current_project(
    payload: RenameCurrentProjectRequest = Body(...),
    project: ProjectContext = Depends(get_current_project),
) -> CurrentProjectResponse:
    if not project.is_hub_project:
        raise HTTPException(status_code=409, detail="Open this project from the hub to rename it")
    renamed = hub_projects_client.rename_project(project.launch_token, payload.name)
    if renamed is None:
        raise HTTPException(status_code=502, detail="Could not rename the project in the hub")
    return CurrentProjectResponse(id=project.project_id, name=renamed.get("name"), is_hub_project=True)


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

