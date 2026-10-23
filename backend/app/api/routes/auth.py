"""Launch hub authentication routes.

This app does not implement classic login/register. Access is granted only
when the user opens the app from the Creator Hub with a launch token.
"""

from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends

from app.schemas.projects import CurrentProjectResponse
from app.schemas.auth import (
    RefreshLaunchTokenRequest,
    RefreshLaunchTokenResponse,
    UserResponse,
    VerifyLaunchTokenRequest,
    VerifyLaunchTokenResponse,
)
from app.services import hub_projects_client
from app.services.launch_auth_service import (
    get_user_from_launch,
    get_user_id_from_launch,
    refresh_launch_token_via_hub,
    verify_launch_token_via_hub,
)
from app.services.projects_service import create_project, latest_project_id

from app.core.dependencies import get_current_launch_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _pin_token_to_project(token: str, claims: dict[str, Any]) -> tuple[Optional[str], Optional[dict[str, Any]]]:
    """
    `(new_token, project)` for the tab. A token from the hub names its project already. One
    without (the user had no project in the hub yet, e.g. work from before hub projects) gets
    the user's latest project here, registered with the hub, and a token pinned to it, so
    this tab keeps editing that project. `(None, None)` while the hub has projects off.
    """
    if claims.get("project_id"):
        return None, hub_projects_client.get_project(token)
    if not claims.get("app_id"):
        return None, None  # issued by a hub without projects
    user_id = UUID(get_user_id_from_launch(email=claims["email"]))
    try:
        adopted = hub_projects_client.adopt_project(token, latest_project_id(user_id=user_id))
    except hub_projects_client.HubProjectDeleted:
        # The user deleted that project in the hub: start a fresh one rather than reviving it.
        adopted = hub_projects_client.adopt_project(token, create_project(user_id=user_id))
    if adopted is None:
        return None, None
    return str(adopted["token"]), adopted["project"]


@router.post("/verify-launch-token", response_model=VerifyLaunchTokenResponse)
def verify_launch_token_endpoint(payload: VerifyLaunchTokenRequest) -> VerifyLaunchTokenResponse:
    claims = verify_launch_token_via_hub(payload.token)
    user = get_user_from_launch(
        hub_user_id=claims["hub_user_id"],
        email=claims["email"],
    )
    new_token, project = _pin_token_to_project(payload.token, claims)
    return VerifyLaunchTokenResponse(
        user=user,
        hub_url=None,
        token=new_token,
        project=CurrentProjectResponse(id=project["id"], name=project.get("name"), is_hub_project=True)
        if project
        else None,
    )


@router.post("/refresh-launch-token", response_model=RefreshLaunchTokenResponse)
def refresh_launch_token_endpoint(payload: RefreshLaunchTokenRequest) -> RefreshLaunchTokenResponse:
    result = refresh_launch_token_via_hub(payload.token)
    user = get_user_from_launch(
        hub_user_id=result["hub_user_id"],
        email=result["email"],
    )
    return RefreshLaunchTokenResponse(token=result["token"], user=user)


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: UserResponse = Depends(get_current_launch_user)) -> UserResponse:
    return current_user

