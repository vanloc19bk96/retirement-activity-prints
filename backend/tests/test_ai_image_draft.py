"""The project's list of generated images: previews, surviving saves, and image cleanup."""

from __future__ import annotations

import io
from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4

import pytest
from PIL import Image

from app.schemas.projects import AI_IMAGE_HISTORY_LIMIT, AiImageDraft, AiImageDraftResponse
from app.services import generated_image_preview, projects_service, storage_service

USER = UUID("11111111-1111-1111-1111-111111111111")
PROJECT = uuid4()


def _image(url: str, preview: str | None = None, kind: str = "cover") -> dict[str, Any]:
    return {"url": url, "previewUrl": preview, "idea": None, "kind": kind}


def _png(size: tuple[int, int], mode: str = "RGB") -> bytes:
    buffer = io.BytesIO()
    Image.new(mode, size, (10, 20, 30, 0) if mode == "RGBA" else (10, 20, 30)).save(buffer, format="PNG")
    return buffer.getvalue()


class _Projects:
    """The `projects` table with one row."""

    def __init__(self, draft: Any) -> None:
        self.row = {"id": str(PROJECT), "user_id": str(USER), "ai_image_draft": draft}
        self._update: dict[str, Any] | None = None

    def table(self, _name: str) -> "_Projects":
        return self

    def select(self, *_args: Any) -> "_Projects":
        self._update = None
        return self

    def update(self, values: dict[str, Any]) -> "_Projects":
        self._update = values
        return self

    def eq(self, *_args: Any) -> "_Projects":
        return self

    def limit(self, _count: int) -> "_Projects":
        return self

    def execute(self) -> SimpleNamespace:
        if self._update is not None:
            self.row.update(self._update)
            self._update = None
        return SimpleNamespace(data=[self.row])


@pytest.fixture
def projects(monkeypatch: pytest.MonkeyPatch, request: pytest.FixtureRequest) -> _Projects:
    table = _Projects(getattr(request, "param", None))
    monkeypatch.setattr(projects_service, "_get_projects_postgrest_client", lambda: table)
    return table


def test_preview_is_small_and_keeps_the_shape_of_a_print_size_image() -> None:
    full = _png((2588, 3375))

    preview = generated_image_preview.build_preview_bytes(full)

    with Image.open(io.BytesIO(preview)) as opened:
        assert opened.format == "WEBP"
        assert max(opened.size) == generated_image_preview.PREVIEW_MAX_EDGE_PX
        assert opened.size[0] / opened.size[1] == pytest.approx(2588 / 3375, abs=0.01)


def test_preview_keeps_transparency() -> None:
    preview = generated_image_preview.build_preview_bytes(_png((800, 800), "RGBA"))

    with Image.open(io.BytesIO(preview)) as opened:
        assert opened.convert("RGBA").getpixel((0, 0))[3] == 0


def test_a_failed_preview_does_not_fail_the_image(monkeypatch: pytest.MonkeyPatch) -> None:
    uploads: list[str] = []

    def upload(**kwargs: Any) -> SimpleNamespace:
        uploads.append(kwargs["content_type"])
        return SimpleNamespace(public_url="https://s/preview.webp")

    monkeypatch.setattr(generated_image_preview, "upload_user_image_bytes", upload)

    assert generated_image_preview.upload_generated_image_preview(image_bytes=b"not an image", user_id="u") is None
    assert uploads == []
    assert (
        generated_image_preview.upload_generated_image_preview(image_bytes=_png((800, 600)), user_id="u")
        == "https://s/preview.webp"
    )
    assert uploads == ["image/webp"]


def test_a_draft_from_before_the_list_shows_its_image_in_the_list(projects: _Projects) -> None:
    projects.row["ai_image_draft"] = {
        "generatedImageUrl": "https://s/page.png",
        "generatedImageIdea": "a cat",
        "generatedCoverImageUrl": "https://s/cover.png",
    }

    draft = projects_service.get_ai_image_draft(project_id=PROJECT)

    assert draft is not None
    assert draft["generatedImages"] == [
        {"url": "https://s/page.png", "previewUrl": None, "idea": "a cat", "kind": "interior"},
        {"url": "https://s/cover.png", "previewUrl": None, "idea": None, "kind": "cover"},
    ]
    # The stored shape must keep validating for the response model.
    AiImageDraftResponse(draft=draft)


def test_saving_a_shorter_list_keeps_the_images_already_stored(projects: _Projects) -> None:
    projects.row["ai_image_draft"] = {"generatedImages": [_image("https://s/older.png", "https://s/older.webp")]}

    projects_service.save_ai_image_draft(
        draft={"idea": "new", "generatedImages": [_image("https://s/newer.png")]},
        project_id=PROJECT,
    )

    stored = projects.row["ai_image_draft"]
    assert stored["idea"] == "new"
    assert [image["url"] for image in stored["generatedImages"]] == ["https://s/newer.png", "https://s/older.png"]


def test_a_client_from_before_the_list_cannot_erase_it(projects: _Projects) -> None:
    projects.row["ai_image_draft"] = {"generatedImages": [_image("https://s/older.png", "https://s/older.webp")]}
    old_client_payload = AiImageDraft(generatedCoverImageUrl="https://s/from-old-tab.png").model_dump()

    projects_service.save_ai_image_draft(draft=old_client_payload, project_id=PROJECT)

    assert [image["url"] for image in projects.row["ai_image_draft"]["generatedImages"]] == [
        "https://s/from-old-tab.png",
        "https://s/older.png",
    ]


def test_saving_the_same_image_without_its_preview_keeps_the_preview(projects: _Projects) -> None:
    projects.row["ai_image_draft"] = {"generatedImages": [_image("https://s/a.png", "https://s/a.webp")]}

    projects_service.save_ai_image_draft(
        draft={"generatedCoverImageUrl": "https://s/a.png", "generatedImages": []},
        project_id=PROJECT,
    )

    assert projects.row["ai_image_draft"]["generatedImages"] == [_image("https://s/a.png", "https://s/a.webp")]


def test_a_save_that_cannot_read_the_stored_list_changes_nothing(
    projects: _Projects, monkeypatch: pytest.MonkeyPatch
) -> None:
    before = {"generatedImages": [_image("https://s/older.png")]}
    projects.row["ai_image_draft"] = before

    def fail(*, project_id: UUID) -> None:
        raise RuntimeError("database down")

    monkeypatch.setattr(projects_service, "get_ai_image_draft", fail)

    with pytest.raises(RuntimeError):
        projects_service.save_ai_image_draft(draft={"generatedImages": []}, project_id=PROJECT)
    assert projects.row["ai_image_draft"] is before


def test_the_list_stays_within_its_limit_dropping_the_oldest(projects: _Projects) -> None:
    older = [_image(f"https://s/{index}.png") for index in range(AI_IMAGE_HISTORY_LIMIT)]
    projects.row["ai_image_draft"] = {"generatedImages": older}

    projects_service.save_ai_image_draft(
        draft={"generatedImages": [_image("https://s/newest.png")]},
        project_id=PROJECT,
    )

    images = projects.row["ai_image_draft"]["generatedImages"]
    assert len(images) == AI_IMAGE_HISTORY_LIMIT
    assert images[0]["url"] == "https://s/newest.png"
    assert images[-1]["url"] == f"https://s/{AI_IMAGE_HISTORY_LIMIT - 2}.png"
    AiImageDraft(generatedImages=images)


def test_cleanup_keeps_every_listed_image_and_preview(projects: _Projects) -> None:
    projects.row["ai_image_draft"] = {
        "generatedImageUrl": "https://s/shown.png?t=1",
        "generatedImages": [
            _image("https://s/a.png", "https://s/a.webp"),
            _image("https://s/b.png"),
        ],
    }

    assert projects_service.list_user_ai_image_draft_urls(user_id=USER) == {
        "https://s/shown.png",
        "https://s/a.png",
        "https://s/a.webp",
        "https://s/b.png",
    }


def test_listed_images_older_than_the_cleanup_age_survive_a_real_cleanup_pass(
    projects: _Projects, monkeypatch: pytest.MonkeyPatch
) -> None:
    prefix = f"images/{USER}/upload"
    bucket = storage_service.settings.SUPABASE_STORAGE_BUCKET
    url = lambda name: f"https://s/storage/v1/object/public/{bucket}/{prefix}/{name}"  # noqa: E731
    projects.row["ai_image_draft"] = {
        "generatedImages": [_image(url("kept.png"), url("kept.webp"))],
    }
    removed: list[str] = []
    long_ago = "2020-01-01T00:00:00Z"
    rows = [
        {"name": name, "metadata": {"size": 1}, "created_at": long_ago}
        for name in ("kept.png", "kept.webp", "orphan.png")
    ]
    storage = SimpleNamespace(
        from_=lambda _bucket: storage,
        list=lambda listed, options: rows[options["offset"] : options["offset"] + options["limit"]]
        if listed == prefix
        else [],
        remove=removed.extend,
    )
    monkeypatch.setattr(storage_service, "create_supabase_admin_client", lambda: SimpleNamespace(storage=storage))

    storage_service.delete_user_image_objects_not_referenced_by_public_urls(
        user_id=str(USER),
        referenced_public_urls=list(projects_service.list_user_ai_image_draft_urls(user_id=USER)),
        fail_safe_when_no_keep_paths=False,
    )

    assert removed == [f"{prefix}/orphan.png"]
