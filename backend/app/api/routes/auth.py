"""Launch hub authentication routes.

This app does not implement classic login/register. Access is granted only
when the user opens the app from the Creator Hub with a launch token.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.schemas.auth import (
    RefreshLaunchTokenRequest,
    RefreshLaunchTokenResponse,
    UserResponse,
    VerifyLaunchTokenRequest,
    VerifyLaunchTokenResponse,
)
from app.services.launch_auth_service import (
    get_user_from_launch,
    refresh_launch_token_via_hub,
    verify_launch_token_via_hub,
)

from app.core.dependencies import get_current_launch_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/verify-launch-token", response_model=VerifyLaunchTokenResponse)
def verify_launch_token_endpoint(payload: VerifyLaunchTokenRequest) -> VerifyLaunchTokenResponse:
    claims = verify_launch_token_via_hub(payload.token)
    user = get_user_from_launch(
        hub_user_id=claims["hub_user_id"],
        email=claims["email"],
    )
    return VerifyLaunchTokenResponse(user=user, hub_url=None)


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

