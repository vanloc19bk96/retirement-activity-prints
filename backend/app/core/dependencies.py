"""Authentication dependencies.

This keeps the `/api/auth/me` route thin by moving token extraction and hub
verification logic into a shared dependency.
"""

from __future__ import annotations

from fastapi import HTTPException, Request, status

from app.schemas.auth import UserResponse
from app.services.launch_auth_service import (
    get_launch_token_from_request,
    get_user_from_launch,
    verify_launch_token_via_hub,
)


async def get_current_launch_user(request: Request) -> UserResponse:
    """
    Require valid hub launch token (Bearer or X-Launch-Token).

    Backend verifies token with hub and resolves to local `UserResponse`.
    """

    token = get_launch_token_from_request(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing launch token. Open this app from the hub.",
        )

    claims = verify_launch_token_via_hub(token)
    return get_user_from_launch(
        hub_user_id=claims["hub_user_id"],
        email=claims["email"],
    )


async def get_current_user_id(request: Request) -> str:
    """
    Resolve current user id for task APIs.

    Priority:
    1) `X-User-Id` header from frontend
    2) launch token (Bearer / X-Launch-Token)
    """

    user_id_header = request.headers.get("X-User-Id") or request.headers.get("x-user-id")
    if user_id_header and user_id_header.strip():
        return user_id_header.strip()

    token = get_launch_token_from_request(request)
    if token:
        claims = verify_launch_token_via_hub(token)
        user = get_user_from_launch(
            hub_user_id=claims["hub_user_id"],
            email=claims["email"],
        )
        return user.id

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing user context",
    )

