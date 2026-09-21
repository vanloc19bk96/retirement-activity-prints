from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.supabase import create_supabase_admin_client
from app.services.user_service import get_user_service

PROJECT_SCHEMA_NAME = "retirement_activity_prints"
PLAN_HIERARCHY = ["Starter", "Standard", "Pro"]


@dataclass(frozen=True)
class PageSizeOptionRow:
    label: str
    min_plan: str
    sort_order: int
    is_locked: bool


def _db() -> Any:
    return create_supabase_admin_client().schema(PROJECT_SCHEMA_NAME)


def _normalize_plan(raw_plan: str | None) -> str:
    service = get_user_service()
    return service._normalize_plan(raw_plan)  # noqa: SLF001


def _plan_rank(plan: str | None) -> int:
    normalized = _normalize_plan(plan)
    try:
        return PLAN_HIERARCHY.index(normalized)
    except ValueError:
        return 0


def _has_access(*, user_plan: str, min_plan: str) -> bool:
    return _plan_rank(user_plan) >= _plan_rank(min_plan)


def _user_plan(user_id: str) -> str:
    user = get_user_service().get_user_by_id(user_id)
    return _normalize_plan(user.get("plan") if user else None)


def list_page_size_options(*, user_id: str) -> list[PageSizeOptionRow]:
    uid = (user_id or "").strip()
    if not uid:
        return []

    user_plan = _user_plan(uid)

    response = (
        _db()
        .table("page_size_options")
        .select("label,min_plan,sort_order,is_active")
        .eq("is_active", True)
        .order("sort_order", desc=False)
        .order("label", desc=False)
        .execute()
    )
    rows = list(response.data or [])
    if not rows:
        return []

    out: list[PageSizeOptionRow] = []
    for row in rows:
        label = (row.get("label") or "").strip()
        min_plan = (row.get("min_plan") or "Starter").strip() or "Starter"
        sort_order = int(row.get("sort_order") or 0)
        if not label:
            continue
        is_locked = not _has_access(user_plan=user_plan, min_plan=min_plan)
        out.append(
            PageSizeOptionRow(
                label=label,
                min_plan=min_plan,
                sort_order=sort_order,
                is_locked=is_locked,
            )
        )

    return out

