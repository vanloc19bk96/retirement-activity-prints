from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.services.library_assets_service import list_indexed_library_assets
from app.services.storage_service import (
    build_public_storage_object_url,
    list_bucket_file_paths_under_prefix,
)

DEFAULT_LIMIT = 40
MAX_LIMIT = 100
SEARCH_INDEX_TTL_SECONDS = 30

_SVG_EXTENSIONS = frozenset({"svg"})
_SEARCH_INDEX_CACHE: dict[str, tuple[datetime, list[str]]] = {}
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EmojiAssetRow:
    id: uuid.UUID
    title: str
    slug: str
    image_public_url: str


def _emoji_bucket() -> str:
    return settings.EMOJI_LIBRARY_STORAGE_BUCKET.strip()


def _stem_from_path(object_path: str) -> str:
    name = object_path.rstrip("/").rsplit("/", 1)[-1]
    if "." in name:
        return name.rsplit(".", 1)[0]
    return name


def _is_svg_object_path(object_path: str) -> bool:
    name = object_path.rsplit("/", 1)[-1]
    if "." not in name:
        return False
    ext = name.rsplit(".", 1)[-1].lower()
    return ext in _SVG_EXTENSIONS


def _build_emoji_asset_row(*, path: str, bucket: str) -> EmojiAssetRow:
    stem = _stem_from_path(path)
    return EmojiAssetRow(
        id=uuid.uuid5(uuid.NAMESPACE_URL, path),
        title=stem.replace("_", " "),
        slug=stem,
        image_public_url=build_public_storage_object_url(object_path=path, bucket=bucket),
    )


def _list_all_svg_paths_cached(*, bucket: str) -> list[str]:
    now = datetime.now(timezone.utc)
    cached = _SEARCH_INDEX_CACHE.get(bucket)
    if cached and cached[0] > now:
        return cached[1]

    all_paths = list_bucket_file_paths_under_prefix(prefix="", bucket=bucket)
    svg_paths = [p for p in all_paths if _is_svg_object_path(p)]
    svg_paths.sort()
    _SEARCH_INDEX_CACHE[bucket] = (
        now + timedelta(seconds=SEARCH_INDEX_TTL_SECONDS),
        svg_paths,
    )
    return svg_paths


def list_emoji_assets(
    *,
    search_query: str | None,
    limit: int,
    offset: int,
) -> tuple[list[EmojiAssetRow], bool]:
    bucket = _emoji_bucket()
    if not bucket:
        return [], False

    page_limit = min(max(limit, 1), MAX_LIMIT)
    page_offset = max(offset, 0)
    needle = (search_query or "").strip().lower()

    try:
        indexed_page = list_indexed_library_assets(
            kind="emoji",
            search_query=needle,
            limit=page_limit,
            offset=page_offset,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("emoji_asset_index_query_failed err=%s", exc)
        indexed_page = None

    if indexed_page is not None:
        indexed_rows, has_more = indexed_page
        rows = [
            EmojiAssetRow(
                id=row.id,
                title=row.title,
                slug=row.slug,
                image_public_url=build_public_storage_object_url(
                    object_path=row.object_path,
                    bucket=bucket,
                ),
            )
            for row in indexed_rows
        ]
        return rows, has_more

    all_svg_paths = _list_all_svg_paths_cached(bucket=bucket)
    filtered_paths = (
        [p for p in all_svg_paths if needle in _stem_from_path(p).lower()]
        if needle
        else all_svg_paths
    )
    window = filtered_paths[page_offset : page_offset + page_limit + 1]
    has_more = len(window) > page_limit
    if has_more:
        window = window[:page_limit]

    result = [_build_emoji_asset_row(path=path, bucket=bucket) for path in window]
    return result, has_more
