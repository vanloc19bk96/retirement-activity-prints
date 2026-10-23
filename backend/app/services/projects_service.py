from __future__ import annotations

from uuid import UUID

from postgrest.exceptions import APIError

from app.core.supabase import create_supabase_admin_client

PROJECT_SCHEMA_NAME = "retirement_activity_prints"
PROJECTS_TABLE_NAME = "projects"

DEFAULT_PROJECT_SETTINGS = {
    "pageSizeLabel": "8.5 x 11 in",
    "addBleed": False,
    "showVisualGuide": True,
    "fitDroppedImagesToPage": True,
    "solutionsAtEnd": False,
    "solutionsPerPage": 1,
}

SOLUTIONS_PER_PAGE_OPTIONS = (1, 2, 4)


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
    solutions_per_page = saved_settings.get("solutionsPerPage")
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
        "solutionsPerPage": (
            solutions_per_page
            if type(solutions_per_page) is int and solutions_per_page in SOLUTIONS_PER_PAGE_OPTIONS
            else defaults["solutionsPerPage"]
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


class ProjectAccessDenied(PermissionError):
    """The project id belongs to another user."""


def _select_project(*, project_id: UUID) -> dict[str, object] | None:
    response = (
        _get_projects_postgrest_client()
        .table(PROJECTS_TABLE_NAME)
        .select("id, user_id")
        .eq("id", str(project_id))
        .limit(1)
        .execute()
    )
    return (response.data or [None])[0]


def _insert_project(*, user_id: UUID, project_id: UUID | None = None) -> UUID:
    payload: dict[str, object] = {"user_id": str(user_id), "settings": DEFAULT_PROJECT_SETTINGS}
    if project_id is not None:
        payload["id"] = str(project_id)
    response = _get_projects_postgrest_client().table(PROJECTS_TABLE_NAME).insert(payload).execute()
    if not response.data or not response.data[0].get("id"):
        raise RuntimeError("Failed to create projects row for user")
    return UUID(str(response.data[0]["id"]))


def _ensure_owned_project(*, user_id: UUID, project_id: UUID) -> UUID:
    """
    The hub's project id, created here on first open (a project made in the hub starts
    empty). An id another user holds is refused.
    """
    row = _select_project(project_id=project_id)
    if row is None:
        try:
            return _insert_project(user_id=user_id, project_id=project_id)
        except APIError:
            # Two first requests raced; the other insert won. Fall through to the owner check.
            row = _select_project(project_id=project_id)
            if row is None:
                raise
    if str(row.get("user_id")) != str(user_id):
        raise ProjectAccessDenied(str(project_id))
    return project_id


def latest_project_id(*, user_id: UUID) -> UUID:
    """The user's most recently updated project, created when the user has none."""
    response = (
        _get_projects_postgrest_client()
        .table(PROJECTS_TABLE_NAME)
        .select("id")
        .eq("user_id", str(user_id))
        .order("updated_at", desc=True)
        .limit(1)
        .execute()
    )
    if response.data and response.data[0].get("id"):
        return UUID(str(response.data[0]["id"]))
    return _insert_project(user_id=user_id)


def create_project(*, user_id: UUID) -> UUID:
    """A new empty project for the user."""
    return _insert_project(user_id=user_id)


def resolve_project_id(*, user_id: UUID, project_id: UUID | None) -> UUID:
    """
    The project a request works on: the one its launch token names (from the hub), or for
    a token without one (the app is not on hub projects yet) the user's latest project.
    """
    if project_id is None:
        return latest_project_id(user_id=user_id)
    return _ensure_owned_project(user_id=user_id, project_id=project_id)


def list_user_project_ids(*, user_id: UUID) -> list[UUID]:
    response = (
        _get_projects_postgrest_client()
        .table(PROJECTS_TABLE_NAME)
        .select("id")
        .eq("user_id", str(user_id))
        .execute()
    )
    return [UUID(str(row["id"])) for row in response.data or [] if row.get("id")]


def save_project_settings(*, settings: dict[str, object], project_id: UUID) -> dict[str, object]:
    normalized_settings = _normalize_project_settings(settings)
    response = (
        _get_projects_postgrest_client()
        .table(PROJECTS_TABLE_NAME)
        .update({"settings": normalized_settings})
        .eq("id", str(project_id))
        .execute()
    )
    if not response.data:
        raise RuntimeError("Failed to save projects.settings")
    return _normalize_project_settings(response.data[0].get("settings"))


def get_project_settings(*, project_id: UUID) -> dict[str, object]:
    response = (
        _get_projects_postgrest_client()
        .table(PROJECTS_TABLE_NAME)
        .select("settings")
        .eq("id", str(project_id))
        .limit(1)
        .execute()
    )
    row = (response.data or [{}])[0] or {}
    return _normalize_project_settings(row.get("settings"))
