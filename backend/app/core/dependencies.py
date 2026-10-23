"""Authentication dependencies.

Every request is identified by its hub launch token, never by ids the browser sends: the
token is signed by the hub, so it is the only thing a user cannot forge. The token also
names the project the editor tab works on (hub projects), so two tabs on two projects
never write into each other.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from fastapi import HTTPException, Request, status

from app.schemas.auth import UserResponse
from app.services.launch_auth_service import (
    get_launch_token_from_request,
    get_user_from_launch,
    get_user_id_from_launch,
    verify_launch_token_via_hub,
)
from app.services.projects_service import ProjectAccessDenied, resolve_project_id


@dataclass(frozen=True)
class ProjectContext:
    user_id: UUID
    project_id: UUID
    # The project came from the hub (token claim), so saves are reported back to it.
    is_hub_project: bool
    launch_token: str


def _require_launch_token(request: Request) -> str:
    token = get_launch_token_from_request(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing launch token. Open this app from the hub.",
        )
    return token


async def get_current_launch_user(request: Request) -> UserResponse:
    """
    Require valid hub launch token (Bearer or X-Launch-Token).

    Backend verifies token with hub and resolves to local `UserResponse`.
    """
    claims = verify_launch_token_via_hub(_require_launch_token(request))
    return get_user_from_launch(
        hub_user_id=claims["hub_user_id"],
        email=claims["email"],
    )


async def get_current_user_id(request: Request) -> str:
    """The local user id of the request's launch token (an `X-User-Id` header is ignored)."""
    claims = verify_launch_token_via_hub(_require_launch_token(request))
    return get_user_id_from_launch(email=claims["email"])


async def get_current_project(request: Request) -> ProjectContext:
    """The user and the project this editor tab works on."""
    token = _require_launch_token(request)
    claims = verify_launch_token_via_hub(token)
    user_id = UUID(get_user_id_from_launch(email=claims["email"]))
    claimed = claims.get("project_id")
    try:
        project_id = resolve_project_id(user_id=user_id, project_id=UUID(claimed) if claimed else None)
    except ProjectAccessDenied as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This project belongs to another account"
        ) from exc
    return ProjectContext(
        user_id=user_id,
        project_id=project_id,
        is_hub_project=bool(claimed),
        launch_token=token,
    )
