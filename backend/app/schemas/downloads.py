from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class DownloadQuotaResponse(BaseModel):
    monthly_downloads_used: int = Field(..., ge=0)
    monthly_download_limit: Optional[int] = Field(default=None, ge=1)
    monthly_downloads_remaining: Optional[int] = Field(default=None, ge=0)
    is_unlimited: bool
    can_download: bool


class ConsumeDownloadQuotaResponse(DownloadQuotaResponse):
    pass


class CreatePdfMergeSessionRequest(BaseModel):
    chunk_count: int = Field(..., ge=1, le=200)


class CreatePdfMergeSessionResponse(BaseModel):
    session_id: str
