from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException

from app.core.dependencies import ProjectContext, get_current_project

from app.schemas.canvases import GetCanvasesResponse, SaveCanvasesRequest, SaveCanvasesResponse
from app.services.canvases_service import get_canvases, save_canvases
from app.services.hub_projects_client import report_project_saved

router = APIRouter(prefix="/canvases", tags=["canvases"])


@router.post(
    "/batch",
    response_model=SaveCanvasesResponse,
    summary="Save canvases into retirement_activity_prints.canvases (jsonb)",
)
async def save_canvases_route(
    background_tasks: BackgroundTasks,
    payload: SaveCanvasesRequest = Body(...),
    project: ProjectContext = Depends(get_current_project),
) -> SaveCanvasesResponse:
    try:
        result = save_canvases(
            canvases=[c.model_dump() for c in payload.canvases],
            interior_page_count=payload.interior_page_count,
            user_id=project.user_id,
            project_id=project.project_id,
            referenced_supabase_image_public_urls=payload.referenced_supabase_image_public_urls,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - best-effort error mapping
        raise HTTPException(status_code=500, detail="Failed to save canvases") from exc

    if project.is_hub_project and result["saved"]:
        # After the response: the hub's dashboard shows "edited just now" and the page count.
        background_tasks.add_task(
            report_project_saved, project.launch_token, project.project_id, payload.interior_page_count
        )
    return SaveCanvasesResponse(project_id=result["project_id"], saved=result["saved"])


@router.get(
    "",
    response_model=GetCanvasesResponse,
    summary="Get canvases from retirement_activity_prints.canvases for current project",
)
async def get_canvases_route(
    project: ProjectContext = Depends(get_current_project),
) -> GetCanvasesResponse:
    try:
        result = get_canvases(user_id=project.user_id, project_id=project.project_id)
    except Exception as exc:  # pragma: no cover - best-effort error mapping
        raise HTTPException(status_code=500, detail="Failed to load canvases") from exc

    return GetCanvasesResponse(project_id=result["project_id"], canvases=result["canvases"])

