"""Image cleanup with several projects per user.

Uploaded images live in one storage folder per user, shared by all of the user's projects.
Cleanup deletes what no canvas references, so it must count every project's canvases, or
opening one project would delete the images another project uses.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4

import pytest

from app.services import canvases_service

USER = UUID("11111111-1111-1111-1111-111111111111")
OPEN_PROJECT = uuid4()
OTHER_PROJECT = uuid4()


def _canvas(project_id: UUID, page: int, image_url: str | None) -> dict[str, Any]:
    objects = [{"type": "image", "src": image_url}] if image_url else []
    return {
        "id": str(uuid4()),
        "project_id": str(project_id),
        "page_index": page,
        "canvas_type": "interior",
        "canvas_data": {"version": "6.7.1", "objects": objects, "background": "#fff"},
    }


class _Query:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows
        self._range: tuple[int, int] | None = None

    def select(self, *_args: Any, **_kwargs: Any) -> "_Query":
        return self

    def eq(self, column: str, value: Any) -> "_Query":
        return _Query([row for row in self._rows if str(row.get(column)) == str(value)])

    def in_(self, column: str, values: list[str]) -> "_Query":
        return _Query([row for row in self._rows if str(row.get(column)) in values])

    def order(self, column: str, **_kwargs: Any) -> "_Query":
        return _Query(sorted(self._rows, key=lambda row: str(row.get(column))))

    def range(self, start: int, end: int) -> "_Query":
        query = _Query(self._rows)
        query._range = (start, end)
        return query

    def limit(self, _count: int) -> "_Query":
        return self

    def execute(self) -> SimpleNamespace:
        rows = self._rows
        if self._range is not None:
            rows = rows[self._range[0] : self._range[1] + 1]
        return SimpleNamespace(data=rows)


class _Client:
    def __init__(self, canvases: list[dict[str, Any]]) -> None:
        self.canvases = canvases

    def table(self, _name: str) -> _Query:
        return _Query(self.canvases)


@pytest.fixture
def storage(monkeypatch: pytest.MonkeyPatch, request: pytest.FixtureRequest):
    """Patch the database and storage calls; returns what cleanup was asked to keep."""
    canvases: list[dict[str, Any]] = request.param
    kept: dict[str, list[str]] = {}

    monkeypatch.setattr(canvases_service, "_get_projects_postgrest_client", lambda: _Client(canvases))
    monkeypatch.setattr(canvases_service, "_ensure_default_canvases_for_project", lambda **_kw: None)
    monkeypatch.setattr(
        canvases_service,
        "list_user_project_ids",
        lambda *, user_id: sorted({UUID(row["project_id"]) for row in canvases} | {OPEN_PROJECT}, key=str),
    )
    monkeypatch.setattr(
        canvases_service,
        "collect_referenced_supabase_image_public_urls_from_canvas_json",
        lambda data: [obj["src"] for obj in data.get("objects", []) if obj.get("src")],
    )

    def record(kind: str):
        def _delete(*, user_id: str, referenced_public_urls: list[str], **_kw: Any) -> None:
            kept[kind] = sorted(referenced_public_urls)

        return _delete

    monkeypatch.setattr(canvases_service, "delete_user_processed_objects_not_referenced_by_public_urls", record("processed"))
    monkeypatch.setattr(canvases_service, "delete_user_image_objects_not_referenced_by_public_urls", record("uploads"))
    return kept


@pytest.mark.parametrize(
    "storage",
    [[_canvas(OPEN_PROJECT, 0, "https://s/open.png"), _canvas(OTHER_PROJECT, 0, "https://s/other.png")]],
    indirect=True,
)
def test_loading_a_project_keeps_the_images_of_the_users_other_projects(storage):
    canvases_service.get_canvases(user_id=USER, project_id=OPEN_PROJECT)

    assert storage["uploads"] == ["https://s/open.png", "https://s/other.png"]
    assert storage["processed"] == ["https://s/open.png", "https://s/other.png"]


@pytest.mark.parametrize(
    "storage",
    [[_canvas(OTHER_PROJECT, page, f"https://s/{page}.png") for page in range(123)]],
    indirect=True,
)
def test_other_projects_are_read_past_one_page_of_rows(storage):
    canvases_service.get_canvases(user_id=USER, project_id=OPEN_PROJECT)

    assert len(storage["uploads"]) == 123


@pytest.mark.parametrize("storage", [[_canvas(OTHER_PROJECT, 0, "https://s/other.png")]], indirect=True)
def test_nothing_is_deleted_when_other_projects_cannot_be_read(storage, monkeypatch: pytest.MonkeyPatch):
    def fail(**_kw: Any) -> set[str]:
        raise RuntimeError("database down")

    monkeypatch.setattr(canvases_service, "_image_urls_used_by_projects", fail)

    result = canvases_service.get_canvases(user_id=USER, project_id=OPEN_PROJECT)

    assert storage == {}
    assert result["project_id"] == OPEN_PROJECT


@pytest.mark.parametrize("storage", [[_canvas(OTHER_PROJECT, 0, "https://s/other.png")]], indirect=True)
def test_saving_with_other_projects_leaves_cleanup_to_the_next_load(storage):
    canvases_service.save_canvases(
        canvases=[],
        interior_page_count=1,
        user_id=USER,
        project_id=OPEN_PROJECT,
        referenced_supabase_image_public_urls=["https://s/open.png"],
    )

    assert storage == {}


@pytest.mark.parametrize("storage", [[]], indirect=True)
def test_saving_the_only_project_cleans_up_with_the_clients_list(storage, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(canvases_service, "list_user_project_ids", lambda *, user_id: [OPEN_PROJECT])
    monkeypatch.setattr(canvases_service, "_delete_obsolete_interior_canvases_with_page_index_ge", lambda **_kw: None)

    canvases_service.save_canvases(
        canvases=[],
        interior_page_count=1,
        user_id=USER,
        project_id=OPEN_PROJECT,
        referenced_supabase_image_public_urls=["https://s/open.png"],
    )

    assert storage["processed"] == ["https://s/open.png"]
