"""Email identity helpers — compare and store case-insensitively."""

from __future__ import annotations

from typing import Any, Optional


def normalize_email(email: str) -> str:
    return email.strip().lower()


def escape_ilike_pattern(value: str) -> str:
    """Escape LIKE wildcards so `_` in emails is matched literally."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def apply_case_insensitive_email_filter(query: Any, email: str, *, column: str = "email") -> Any:
    """Exact email match that still finds legacy mixed-case rows.

    Use ilike (not imatch regex): supabase-py `.ilike()` is the supported
    PostgREST path, and `_`/`%` are escaped so they are not wildcards.
    """
    return query.ilike(column, escape_ilike_pattern(normalize_email(email)))


def prefer_stored_email_row(rows: list[dict[str, Any]], email: str) -> Optional[dict[str, Any]]:
    normalized = normalize_email(email)
    matches = [
        row
        for row in rows
        if isinstance(row, dict) and normalize_email(str(row.get("email") or "")) == normalized
    ]
    if not matches:
        return None
    for row in matches:
        if str(row.get("email") or "") != normalized:
            return row
    return matches[0]


def fetch_user_row_by_email(query: Any, email: str) -> Optional[dict[str, Any]]:
    response = apply_case_insensitive_email_filter(query, email).limit(5).execute()
    rows = [row for row in (getattr(response, "data", None) or []) if isinstance(row, dict)]
    return prefer_stored_email_row(rows, email)
