from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class VerifyLaunchTokenRequest(BaseModel):
    """Request body for verifying launch token (JWT from hub)."""

    token: str = Field(..., min_length=1)


class RefreshLaunchTokenRequest(BaseModel):
    """Request body for refreshing launch token."""

    token: str = Field(..., min_length=1)


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    plan: Optional[str] = None
    created_at: str
    monthly_downloads_used: int = 0
    monthly_download_limit: Optional[int] = None
    monthly_downloads_remaining: Optional[int] = None
    is_unlimited_downloads: bool = False
    puzzle_salt: Optional[str] = Field(
        default=None,
        description=(
            "128-bit per-account puzzle salt, hex encoded. Keys the HMAC that "
            "derives puzzle seeds, so two sellers running identical settings "
            "never generate the same puzzle (Card Games Pack spec 4.1). Absent "
            "for accounts predating the migration; the client then falls back "
            "to a digest of the owner key, which still separates accounts."
        ),
    )


class VerifyLaunchTokenResponse(BaseModel):
    user: UserResponse
    hub_url: Optional[str] = None


class RefreshLaunchTokenResponse(BaseModel):
    token: str
    user: UserResponse

