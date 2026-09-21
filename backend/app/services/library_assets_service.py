from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Literal

from app.core.supabase import create_supabase_admin_client

PROJECT_SCHEMA_NAME = "retirement_activity_prints"
LIBRARY_ASSETS_TABLE = "library_assets"

LibraryAssetKind = Literal["outline", "emoji"]


@dataclass(frozen=True)
class IndexedLibraryAsset:
    id: uuid.UUID
    object_path: str
    thumbnail_object_path: str | None
    title: str
    slug: str
    tags: list[str]


def _db() -> Any:
    return create_supabase_admin_client().schema(PROJECT_SCHEMA_NAME)


def _escape_ilike_pattern(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _parse_asset(row: dict[str, Any]) -> IndexedLibraryAsset | None:
    try:
        asset_id = uuid.UUID(str(row.get("id", "")))
    except ValueError:
        return None

    object_path = str(row.get("object_path") or "").strip()
    title = str(row.get("title") or "").strip()
    slug = str(row.get("slug") or "").strip()
    if not object_path or not title or not slug:
        return None

    raw_tags = row.get("tags")
    tags = [str(tag).strip() for tag in raw_tags if str(tag).strip()] if isinstance(raw_tags, list) else []
    thumbnail_path = str(row.get("thumbnail_object_path") or "").strip() or None
    return IndexedLibraryAsset(
        id=asset_id,
        object_path=object_path,
        thumbnail_object_path=thumbnail_path,
        title=title,
        slug=slug,
        tags=tags,
    )


def _has_indexed_assets(*, kind: LibraryAssetKind) -> bool:
    response = (
        _db()
        .table(LIBRARY_ASSETS_TABLE)
        .select("id")
        .eq("kind", kind)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    return bool(response.data)


def list_indexed_library_assets(
    *,
    kind: LibraryAssetKind,
    search_query: str | None,
    limit: int,
    offset: int,
) -> tuple[list[IndexedLibraryAsset], bool] | None:
    """Return one indexed page, or None when this library has not been synced."""
    query = (
        _db()
        .table(LIBRARY_ASSETS_TABLE)
        .select("id,object_path,thumbnail_object_path,title,slug,tags")
        .eq("kind", kind)
        .eq("is_active", True)
    )
    needle = (search_query or "").strip().lower()
    if needle:
        query = query.ilike("search_text", f"%{_escape_ilike_pattern(needle)}%")

    response = (
        query.order("slug", desc=False)
        .order("id", desc=False)
        .range(max(offset, 0), max(offset, 0) + max(limit, 1))
        .execute()
    )
    raw_rows = [row for row in list(response.data or []) if isinstance(row, dict)]
    if not raw_rows and not _has_indexed_assets(kind=kind):
        return None

    has_more = len(raw_rows) > limit
    rows = raw_rows[:limit]
    assets = [asset for row in rows if (asset := _parse_asset(row)) is not None]
    return assets, has_more
