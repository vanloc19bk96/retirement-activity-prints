"""Image cleanup with several projects per user.

Uploaded images live in one storage folder per user, shared by all of the user's projects.
Cleanup deletes what no canvas references, so it must count every project's canvases, or
opening one project would delete the images another project uses.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4

import pytest

from app.core.config import settings
from app.services import canvases_service, storage_service

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
    monkeypatch.setattr(canvases_service, "list_user_ai_image_draft_urls", lambda *, user_id: set())
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


@pytest.mark.parametrize("storage", [[_canvas(OPEN_PROJECT, 0, "https://s/open.png")]], indirect=True)
def test_loading_a_project_keeps_generated_images_waiting_in_the_ai_form(storage, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        canvases_service, "list_user_ai_image_draft_urls", lambda *, user_id: {"https://s/generated.png"}
    )

    canvases_service.get_canvases(user_id=USER, project_id=OPEN_PROJECT)

    assert storage["uploads"] == ["https://s/generated.png", "https://s/open.png"]


@pytest.mark.parametrize("storage", [[_canvas(OPEN_PROJECT, 0, "https://s/open.png")]], indirect=True)
def test_nothing_is_deleted_when_ai_form_images_cannot_be_read(storage, monkeypatch: pytest.MonkeyPatch):
    def fail(*, user_id: UUID) -> set[str]:
        raise RuntimeError("column missing")

    monkeypatch.setattr(canvases_service, "list_user_ai_image_draft_urls", fail)

    canvases_service.get_canvases(user_id=USER, project_id=OPEN_PROJECT)

    assert storage == {}


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
    canvases_service.save_canvases(canvases=[], interior_page_count=1, user_id=USER, project_id=OPEN_PROJECT)

    assert storage == {}


@pytest.mark.parametrize("storage", [[]], indirect=True)
def test_saving_the_only_project_leaves_cleanup_to_the_next_load(storage, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(canvases_service, "list_user_project_ids", lambda *, user_id: [OPEN_PROJECT])
    monkeypatch.setattr(canvases_service, "_delete_obsolete_interior_canvases_with_page_index_ge", lambda **_kw: None)

    canvases_service.save_canvases(canvases=[], interior_page_count=1, user_id=USER, project_id=OPEN_PROJECT)

    assert storage == {}


def _iso_days_ago(days: float) -> str:
    moment = datetime.now(timezone.utc) - timedelta(days=days)
    return moment.isoformat(timespec="milliseconds").replace("+00:00", "Z")


class _Storage:
    """A bucket holding `rows` per folder; records what cleanup removes."""

    def __init__(self, rows_by_prefix: dict[str, list[dict[str, Any]]]) -> None:
        self.rows_by_prefix = rows_by_prefix
        self.removed: list[str] = []

    def from_(self, _bucket: str) -> "_Storage":
        return self

    def list(self, prefix: str, options: dict[str, int]) -> list[dict[str, Any]]:
        offset = options["offset"]
        return self.rows_by_prefix.get(prefix, [])[offset : offset + options["limit"]]

    def remove(self, paths: list[str]) -> None:
        self.removed.extend(paths)


def _file(name: str, **fields: Any) -> dict[str, Any]:
    return {"name": name, "metadata": {"size": 1}, **fields}


def _public_url(path: str) -> str:
    return f"https://s/storage/v1/object/public/{settings.SUPABASE_STORAGE_BUCKET}/{path}"


CLEANUPS = [
    pytest.param(storage_service.delete_user_image_objects_not_referenced_by_public_urls, "upload", id="upload"),
    pytest.param(storage_service.delete_user_processed_objects_not_referenced_by_public_urls, "processed", id="processed"),
]


def _run_cleanup(
    monkeypatch: pytest.MonkeyPatch,
    cleanup: Any,
    folder: str,
    rows: list[dict[str, Any]],
    keep: tuple[str, ...] = (),
) -> list[str]:
    prefix = f"images/{USER}/{folder}"
    bucket = _Storage({prefix: rows})
    monkeypatch.setattr(storage_service, "create_supabase_admin_client", lambda: SimpleNamespace(storage=bucket))
    cleanup(
        user_id=str(USER),
        referenced_public_urls=[_public_url(f"{prefix}/{name}") for name in keep],
        fail_safe_when_no_keep_paths=False,
    )
    return [path.rsplit("/", 1)[1] for path in bucket.removed]


@pytest.mark.parametrize("cleanup, folder", CLEANUPS)
def test_cleanup_keeps_unreferenced_images_younger_than_the_minimum_age(monkeypatch, cleanup, folder):
    rows = [_file("new.png", created_at=_iso_days_ago(0)), _file("six.png", created_at=_iso_days_ago(6.9))]

    assert _run_cleanup(monkeypatch, cleanup, folder, rows) == []


@pytest.mark.parametrize("cleanup, folder", CLEANUPS)
def test_cleanup_deletes_only_old_unreferenced_images(monkeypatch, cleanup, folder):
    rows = [
        _file("old.png", created_at=_iso_days_ago(7.1)),
        _file("old-in-use.png", created_at=_iso_days_ago(30)),
        _file("new.png", created_at=_iso_days_ago(1)),
    ]

    assert _run_cleanup(monkeypatch, cleanup, folder, rows, keep=("old-in-use.png",)) == ["old.png"]


@pytest.mark.parametrize("cleanup, folder", CLEANUPS)
@pytest.mark.parametrize(
    "fields",
    [{}, {"created_at": None}, {"created_at": ""}, {"created_at": "not a date"}, {"created_at": 1700000000}],
    ids=["absent", "null", "empty", "garbage", "number"],
)
def test_cleanup_keeps_a_file_whose_age_cannot_be_read(monkeypatch, cleanup, folder, fields):
    assert _run_cleanup(monkeypatch, cleanup, folder, [_file("unknown.png", **fields)]) == []


def test_age_is_read_from_every_timestamp_form_storage_uses():
    for raw in ("2020-01-02T03:04:05.678Z", "2020-01-02T03:04:05+00:00", "2020-01-02T03:04:05.678901+07:00"):
        assert storage_service._storage_row_created_at({"created_at": raw}).tzinfo is not None
    # No offset: read as UTC rather than failing a comparison with an aware datetime.
    assert storage_service._storage_row_created_at({"created_at": "2020-01-02T03:04:05"}).utcoffset() == timedelta(0)
