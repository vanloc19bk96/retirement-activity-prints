from __future__ import annotations

from typing import Any
from uuid import UUID

from app.core.supabase import create_supabase_admin_client
from app.services.projects_service import (
    DEFAULT_PROJECT_SETTINGS,
    PROJECT_SCHEMA_NAME,
    PROJECTS_TABLE_NAME,
)
from app.services.storage_service import (
    collect_referenced_supabase_image_public_urls_from_canvas_json,
    delete_user_processed_objects_not_referenced_by_public_urls,
    delete_user_image_objects_not_referenced_by_public_urls,
)

CANVASES_TABLE_NAME = "canvases"
DEFAULT_CANVAS_DATA: dict[str, object] = {
    "version": "6.7.1",
    "objects": [],
    "background": "#ffffff",
}


def _delete_obsolete_interior_canvases_with_page_index_ge(
    *,
    supabase: Any,
    project_id: UUID,
    interior_page_count: int,
) -> None:
    # The frontend usually sends only dirty canvases, not a full snapshot.
    # We still want the DB to reflect the current editor page order.
    #
    # Any interior DB rows with page indexes >= `interior_page_count` are
    # beyond the current editor range and are therefore obsolete.
    existing_rows = (
        supabase.table(CANVASES_TABLE_NAME)
        .select("id,page_index")
        .eq("project_id", str(project_id))
        .eq("canvas_type", "interior")
        .execute()
    )

    for row in existing_rows.data or []:
        row_page_index = row.get("page_index")
        row_id = row.get("id")
        if not isinstance(row_page_index, int):
            continue
        if row_page_index < interior_page_count:
            continue
        if not row_id:
            continue

        supabase.table(CANVASES_TABLE_NAME).delete().eq("id", row_id).execute()


def _get_projects_postgrest_client():
    # `schema(name)` returns a PostgREST client bound to that schema.
    # Using this is required for non-public schemas in Supabase.
    supabase = create_supabase_admin_client()
    return supabase.schema(PROJECT_SCHEMA_NAME)


def _ensure_default_canvases_for_project(*, supabase: Any, project_id: UUID) -> None:
    """
    Ensure the editor always has at least:
    - 1 interior canvas row (page_index=0)
    - 1 cover canvas row

    Without this, DB may be empty on first launch; UI can still show a blank
    Fabric canvas, but the persistence layer would have no record.
    """
    has_interior = (
        supabase.table(CANVASES_TABLE_NAME)
        .select("id")
        .eq("project_id", str(project_id))
        .eq("canvas_type", "interior")
        .limit(1)
        .execute()
    )
    if not has_interior.data:
        supabase.table(CANVASES_TABLE_NAME).insert(
            {
                "project_id": str(project_id),
                "canvas_data": DEFAULT_CANVAS_DATA,
                "page_index": 0,
                "canvas_type": "interior",
            }
        ).execute()

    has_cover = (
        supabase.table(CANVASES_TABLE_NAME)
        .select("id")
        .eq("project_id", str(project_id))
        .eq("canvas_type", "cover")
        .limit(1)
        .execute()
    )
    if not has_cover.data:
        supabase.table(CANVASES_TABLE_NAME).insert(
            {
                "project_id": str(project_id),
                "canvas_data": DEFAULT_CANVAS_DATA,
                "page_index": 0,
                "canvas_type": "cover",
            }
        ).execute()


def _get_or_create_project_id(*, user_id: UUID) -> UUID:
    supabase = _get_projects_postgrest_client()

    response = (
        supabase.table(PROJECTS_TABLE_NAME)
        .select("id")
        .eq("user_id", str(user_id))
        .execute()
    )

    if response.data:
        project_id = response.data[0].get("id")
        if isinstance(project_id, str) and project_id:
            return UUID(project_id)

    # Ensure there is always a projects row for this user.
    # We only need the `id` FK for canvases.
    insert_payload = {"user_id": str(user_id), "settings": DEFAULT_PROJECT_SETTINGS}
    insert_response = supabase.table(PROJECTS_TABLE_NAME).insert(insert_payload).execute()
    if not insert_response.data:
        raise RuntimeError("Failed to create projects row for user")

    project_id = insert_response.data[0].get("id")
    if not isinstance(project_id, str) or not project_id:
        raise RuntimeError("projects.id missing after insert")

    return UUID(project_id)


def save_canvases(
    *,
    canvases: list[dict],
    interior_page_count: int,
    user_id: UUID,
    referenced_supabase_image_public_urls: list[str] | None = None,
) -> dict[str, object]:
    supabase = _get_projects_postgrest_client()
    project_id = _get_or_create_project_id(user_id=user_id)

    _delete_obsolete_interior_canvases_with_page_index_ge(
        supabase=supabase,
        project_id=project_id,
        interior_page_count=interior_page_count,
    )

    if not canvases:
        delete_user_processed_objects_not_referenced_by_public_urls(
            user_id=str(user_id),
            referenced_public_urls=referenced_supabase_image_public_urls or [],
        )
        return {"project_id": project_id, "saved": []}

    saved_items: list[dict[str, object]] = []
    validated_canvases: list[tuple[int, str, dict]] = []

    for item in canvases:
        page_index = item.get("page_index")
        canvas_type = item.get("canvas_type")
        canvas_data = item.get("canvas_data")

        if not isinstance(page_index, int) or page_index < 0:
            raise ValueError("page_index must be a non-negative integer")
        if canvas_type not in ("interior", "cover"):
            raise ValueError("canvas_type must be either 'interior' or 'cover'")
        if not isinstance(canvas_data, dict):
            raise ValueError("canvas_data must be a JSON object")

        validated_canvases.append((page_index, canvas_type, canvas_data))

    for page_index, canvas_type, canvas_data in validated_canvases:
        existing_response = (
            supabase.table(CANVASES_TABLE_NAME)
            .select("id, canvas_data")
            .eq("project_id", str(project_id))
            .eq("page_index", page_index)
            .eq("canvas_type", canvas_type)
            .execute()
        )

        if existing_response.data:
            existing_row = existing_response.data[0] or {}
            existing_canvas_data = existing_row.get("canvas_data")
            if existing_canvas_data == canvas_data:
                # No-op: canvas data is unchanged.
                continue

            # Update all matches (should be 1, but we keep it tolerant).
            (
                supabase.table(CANVASES_TABLE_NAME)
                .update({"canvas_data": canvas_data, "canvas_type": canvas_type})
                .eq("project_id", str(project_id))
                .eq("page_index", page_index)
                .eq("canvas_type", canvas_type)
                .execute()
            )
            saved_items.append({"page_index": page_index})
            continue

        insert_payload = {
            "project_id": str(project_id),
            "canvas_data": canvas_data,
            "page_index": page_index,
            "canvas_type": canvas_type,
        }
        insert_response = supabase.table(CANVASES_TABLE_NAME).insert(insert_payload).execute()
        if not insert_response.data:
            raise RuntimeError(f"Failed to insert canvas (page_index={page_index})")

        saved_items.append({"page_index": page_index})

    delete_user_processed_objects_not_referenced_by_public_urls(
        user_id=str(user_id),
        referenced_public_urls=referenced_supabase_image_public_urls or [],
    )

    return {"project_id": project_id, "saved": saved_items}


def get_canvases(*, user_id: UUID) -> dict[str, object]:
    supabase = _get_projects_postgrest_client()
    project_id = _get_or_create_project_id(user_id=user_id)

    _ensure_default_canvases_for_project(supabase=supabase, project_id=project_id)

    response = (
        supabase.table(CANVASES_TABLE_NAME)
        .select("canvas_type,page_index,canvas_data")
        .eq("project_id", str(project_id))
        .execute()
    )

    canvases: list[dict[str, object]] = []
    for row in response.data or []:
        canvas_type = row.get("canvas_type")
        page_index = row.get("page_index")
        canvas_data = row.get("canvas_data")

        if canvas_type not in ("interior", "cover"):
            continue
        if not isinstance(page_index, int) or page_index < 0:
            continue
        if not isinstance(canvas_data, dict):
            continue

        canvases.append(
            {
                "canvas_type": canvas_type,
                "page_index": page_index,
                "canvas_data": canvas_data,
            }
        )

    referenced_public_urls_set: set[str] = set()
    for canvas in canvases:
        canvas_data = canvas.get("canvas_data")
        if not isinstance(canvas_data, dict):
            continue
        for url in collect_referenced_supabase_image_public_urls_from_canvas_json(canvas_data):
            referenced_public_urls_set.add(url)

    # Load project snapshot and best-effort clean orphan processed objects.
    # We intentionally allow deletion even when we cannot resolve any processed URL,
    # because `get_canvases()` represents the current editor snapshot from DB.
    delete_user_processed_objects_not_referenced_by_public_urls(
        user_id=str(user_id),
        referenced_public_urls=list(referenced_public_urls_set),
        fail_safe_when_no_keep_paths=False,
    )

    delete_user_image_objects_not_referenced_by_public_urls(
        user_id=str(user_id),
        referenced_public_urls=list(referenced_public_urls_set),
        fail_safe_when_no_keep_paths=False,
    )

    return {"project_id": project_id, "canvases": canvases}

