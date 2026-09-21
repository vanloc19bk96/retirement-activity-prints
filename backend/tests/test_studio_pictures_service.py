from __future__ import annotations

import pytest

from app.schemas.studio_pictures import PictureSetRequest
from app.services import studio_pictures_service as pictures_service
from app.services.studio_pictures_service import (
    PictureRateLimitError,
    build_picture_set,
    sample_outline_images,
)


def _row(i: int) -> dict:
    return {
        "id": f"00000000-0000-0000-0000-{i:012d}",
        "object_path": f"animals/item-{i}.png",
        "title": f"Item {i}",
        "public_url": (
            f"https://example.supabase.co/storage/v1/object/public/"
            f"outline-library/animals/item-{i}.png"
        ),
    }


def test_build_picture_set_samples_exact_count(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [_row(i) for i in range(16)]
    monkeypatch.setattr(
        "app.services.studio_pictures_service.sample_outline_images",
        lambda **_kwargs: rows,
    )
    monkeypatch.setattr(
        "app.services.studio_pictures_service._check_rate_limit",
        lambda _uid: None,
    )

    result = build_picture_set(
        PictureSetRequest(targetCount=9, distractorCount=7, seed=1),
        user_id="user-1",
    )
    assert len(result.targets) == 9
    assert len(result.options) == 16
    target_ids = {t.id for t in result.targets}
    option_ids = {o.id for o in result.options}
    assert target_ids.issubset(option_ids)
    assert len(option_ids) == 16


def test_no_distractor_duplicates_a_target(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [_row(i) for i in range(10)]
    monkeypatch.setattr(
        "app.services.studio_pictures_service.sample_outline_images",
        lambda **_kwargs: rows,
    )
    monkeypatch.setattr(
        "app.services.studio_pictures_service._check_rate_limit",
        lambda _uid: None,
    )
    result = build_picture_set(
        PictureSetRequest(targetCount=4, distractorCount=5, seed=3),
        user_id="user-1",
    )
    target_ids = [t.id for t in result.targets]
    assert len(target_ids) == len(set(target_ids))
    assert len(result.options) == len({o.id for o in result.options})


def test_options_are_shuffled(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [_row(i) for i in range(16)]
    monkeypatch.setattr(
        "app.services.studio_pictures_service.sample_outline_images",
        lambda **_kwargs: rows,
    )
    monkeypatch.setattr(
        "app.services.studio_pictures_service._check_rate_limit",
        lambda _uid: None,
    )
    result = build_picture_set(
        PictureSetRequest(targetCount=9, distractorCount=7, seed=99),
        user_id="user-1",
    )
    study_order = [t.id for t in result.targets]
    recall_targets = [o.id for o in result.options if o.id in set(study_order)]
    assert recall_targets != study_order


def test_permanent_public_urls_only(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [_row(i) for i in range(9)]
    monkeypatch.setattr(
        "app.services.studio_pictures_service.sample_outline_images",
        lambda **_kwargs: rows,
    )
    monkeypatch.setattr(
        "app.services.studio_pictures_service._check_rate_limit",
        lambda _uid: None,
    )
    result = build_picture_set(
        PictureSetRequest(targetCount=4, distractorCount=5, seed=1),
        user_id="user-1",
    )
    for pic in [*result.targets, *result.options]:
        assert "token=" not in pic.url.lower()
        assert "expires=" not in pic.url.lower()
        assert "/object/public/" in pic.url


def test_refuses_signed_url(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [
        {
            **_row(1),
            "public_url": (
                "https://example.supabase.co/storage/v1/object/sign/"
                "outline-library/a.png?token=abc&expires=123"
            ),
        },
        *[_row(i) for i in range(2, 10)],
    ]
    monkeypatch.setattr(
        "app.services.studio_pictures_service.sample_outline_images",
        lambda **_kwargs: rows,
    )
    monkeypatch.setattr(
        "app.services.studio_pictures_service._check_rate_limit",
        lambda _uid: None,
    )
    with pytest.raises(Exception, match="signed|expiring"):
        build_picture_set(
            PictureSetRequest(targetCount=4, distractorCount=5, seed=1),
            user_id="user-1",
        )


def test_raises_when_library_too_small(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.studio_pictures_service.sample_outline_images",
        lambda **_kwargs: [_row(i) for i in range(3)],
    )
    monkeypatch.setattr(
        "app.services.studio_pictures_service._check_rate_limit",
        lambda _uid: None,
    )
    with pytest.raises(ValueError, match=r"Only 3 images available"):
        build_picture_set(
            PictureSetRequest(targetCount=9, distractorCount=7, seed=1),
            user_id="user-1",
        )


def test_same_seed_is_deterministic(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [_row(i) for i in range(16)]
    monkeypatch.setattr(
        "app.services.studio_pictures_service.sample_outline_images",
        lambda **_kwargs: rows,
    )
    monkeypatch.setattr(
        "app.services.studio_pictures_service._check_rate_limit",
        lambda _uid: None,
    )
    a = build_picture_set(
        PictureSetRequest(targetCount=9, distractorCount=7, seed=7),
        user_id="user-1",
    )
    b = build_picture_set(
        PictureSetRequest(targetCount=9, distractorCount=7, seed=7),
        user_id="user-1",
    )
    assert [o.id for o in a.options] == [o.id for o in b.options]


def test_sample_outline_images_from_bucket(monkeypatch: pytest.MonkeyPatch) -> None:
    paths = [f"animals/item-{i}.png" for i in range(30)]
    monkeypatch.setattr(
        "app.services.studio_pictures_service.list_all_outline_image_paths",
        lambda: paths,
    )
    monkeypatch.setattr(
        "app.services.studio_pictures_service.build_public_storage_object_url",
        lambda **kwargs: (
            "https://example.supabase.co/storage/v1/object/public/"
            f"outline-library/{kwargs['object_path']}"
        ),
    )
    rows = sample_outline_images(limit=12, seed=1)
    assert len(rows) == 12
    assert len({r["object_path"] for r in rows}) == 12


def test_rate_limit_allows_book_sized_burst() -> None:
    """Book builder max is 100 games; the old cap of 20 skipped the rest."""
    pictures_service._rate_hits.clear()
    user_id = "book-builder-user"
    # Must clear enough headroom for a full book (one prefetch per game).
    assert pictures_service._RATE_MAX_PER_WINDOW >= 100
    for _ in range(pictures_service._RATE_MAX_PER_WINDOW):
        pictures_service._check_rate_limit(user_id)
    with pytest.raises(PictureRateLimitError, match="Too many picture requests"):
        pictures_service._check_rate_limit(user_id)
