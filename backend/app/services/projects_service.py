from __future__ import annotations

from uuid import UUID

from app.core.supabase import create_supabase_admin_client

PROJECT_SCHEMA_NAME = "retirement_activity_prints"
PROJECTS_TABLE_NAME = "projects"

DEFAULT_PROJECT_SETTINGS = {
    "pageSizeLabel": "7.5 x 9.25 in",
    "addBleed": False,
    "showVisualGuide": True,
    "fitDroppedImagesToPage": True,
    "solutionsAtEnd": False,
}


def _normalize_book_info(raw_book_info: object) -> dict[str, object] | None:
    if not isinstance(raw_book_info, dict):
        return None

    binding_type = raw_book_info.get("bindingType")
    interior_type = raw_book_info.get("interiorType")
    paper_type = raw_book_info.get("paperType")
    reading_direction = raw_book_info.get("readingDirection")
    trim_book_size = raw_book_info.get("trimBookSize")
    page_count = raw_book_info.get("pageCount")

    if not all(
        isinstance(value, str) and value.strip()
        for value in (binding_type, interior_type, paper_type, reading_direction)
    ):
        return None

    normalized: dict[str, object] = {
        "bindingType": binding_type.strip(),
        "interiorType": interior_type.strip(),
        "paperType": paper_type.strip(),
        "readingDirection": reading_direction.strip(),
    }

    if isinstance(trim_book_size, str) and trim_book_size.strip():
        normalized["trimBookSize"] = trim_book_size.strip()

    if isinstance(page_count, int) and page_count >= 24:
        normalized["pageCount"] = page_count
    elif isinstance(page_count, float) and page_count >= 24:
        normalized["pageCount"] = int(page_count)

    return normalized


def _normalize_project_settings(saved_settings: object) -> dict[str, object]:
    """
    Normalize persisted settings with safe defaults.

    We keep existing user choices when values are valid, and backfill missing
    or invalid fields from DEFAULT_PROJECT_SETTINGS. This guarantees first-time
    login behavior is consistent even if legacy rows are incomplete.
    """
    defaults = DEFAULT_PROJECT_SETTINGS
    if not isinstance(saved_settings, dict):
        return defaults.copy()

    page_size_label = saved_settings.get("pageSizeLabel")
    add_bleed = saved_settings.get("addBleed")
    show_visual_guide = saved_settings.get("showVisualGuide")
    fit_dropped_images_to_page = saved_settings.get("fitDroppedImagesToPage")
    solutions_at_end = saved_settings.get("solutionsAtEnd")
    book_info = _normalize_book_info(saved_settings.get("bookInfo"))

    normalized_settings: dict[str, object] = {
        "pageSizeLabel": (
            page_size_label
            if isinstance(page_size_label, str) and page_size_label.strip()
            else defaults["pageSizeLabel"]
        ),
        "addBleed": add_bleed if isinstance(add_bleed, bool) else defaults["addBleed"],
        "showVisualGuide": (
            show_visual_guide
            if isinstance(show_visual_guide, bool)
            else defaults["showVisualGuide"]
        ),
        "fitDroppedImagesToPage": (
            fit_dropped_images_to_page
            if isinstance(fit_dropped_images_to_page, bool)
            else defaults["fitDroppedImagesToPage"]
        ),
        "solutionsAtEnd": (
            solutions_at_end
            if isinstance(solutions_at_end, bool)
            else defaults["solutionsAtEnd"]
        ),
    }

    if book_info is not None:
        normalized_settings["bookInfo"] = book_info

    return normalized_settings


def _get_projects_postgrest_client():
    # `schema(name)` returns a PostgREST client bound to that schema.
    # Using this is required for non-public schemas in Supabase.
    supabase = create_supabase_admin_client()
    return supabase.schema(PROJECT_SCHEMA_NAME)


def _ensure_project_settings_exists(*, user_id: UUID) -> None:
    """
    Ensure there is exactly one `projects` row per user.

    Required by the editor flows: on first launch we create a default row,
    then subsequent calls only update `projects.settings`.
    """
    supabase = _get_projects_postgrest_client()

    response = (
        supabase.table(PROJECTS_TABLE_NAME)
        .select("id")
        .eq("user_id", str(user_id))
        .limit(1)
        .execute()
    )
    if response.data:
        return

    insert_payload = {"user_id": str(user_id), "settings": DEFAULT_PROJECT_SETTINGS}
    insert_response = supabase.table(PROJECTS_TABLE_NAME).insert(insert_payload).execute()
    if not insert_response.data:
        raise RuntimeError("Failed to create projects.settings row for user")


def save_project_settings(*, settings: dict[str, object], user_id: UUID) -> dict[str, object]:
    supabase = _get_projects_postgrest_client()
    _ensure_project_settings_exists(user_id=user_id)
    normalized_settings = _normalize_project_settings(settings)

    payload = {
        "user_id": str(user_id),
        "settings": normalized_settings,
    }

    # `user_id` is UNIQUE in the table, so upsert keeps exactly 1 record per user.
    response = (
        supabase.table(PROJECTS_TABLE_NAME)
        .upsert(payload, on_conflict="user_id")
        .execute()
    )

    if not response.data:
        # This should not happen for a successful upsert, but fail fast if it does.
        raise RuntimeError("Failed to upsert projects.settings")

    # `settings` in DB is jsonb; we store it as-is.
    saved_row = response.data[0]
    saved_settings = saved_row.get("settings")
    return _normalize_project_settings(saved_settings)


def get_project_settings(*, user_id: UUID) -> dict[str, object]:
    supabase = _get_projects_postgrest_client()
    _ensure_project_settings_exists(user_id=user_id)

    response = (
        supabase.table(PROJECTS_TABLE_NAME)
        .select("settings")
        .eq("user_id", str(user_id))
        .execute()
    )

    row = (response.data or [{}])[0] or {}
    saved_settings = row.get("settings")
    return _normalize_project_settings(saved_settings)

