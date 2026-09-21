"""Monthly download limits per subscription tier."""

from __future__ import annotations

from typing import Optional

STARTER_MONTHLY_DOWNLOAD_LIMIT = 100
STANDARD_MONTHLY_DOWNLOAD_LIMIT = 200


def normalize_plan_for_downloads(raw_plan: Optional[str]) -> str:
    if not raw_plan:
        return "Starter"
    normalized = raw_plan.strip().lower()
    if normalized in ("starter", "essential", "basic"):
        return "Starter"
    if normalized in ("premium", "standard"):
        return "Standard"
    if normalized == "pro":
        return "Pro"
    return "Starter"


def resolve_monthly_download_limit(plan: Optional[str]) -> Optional[int]:
    """Return monthly download cap, or None when unlimited (Pro)."""
    normalized = normalize_plan_for_downloads(plan)
    if normalized == "Pro":
        return None
    if normalized == "Standard":
        return STANDARD_MONTHLY_DOWNLOAD_LIMIT
    return STARTER_MONTHLY_DOWNLOAD_LIMIT
