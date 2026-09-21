"""Synchronize shared Storage library metadata into Postgres."""
from __future__ import annotations

import argparse
import uuid
from dataclasses import dataclass
from typing import Any, Literal, TypeVar

from app.core.config import settings
from app.core.supabase import create_supabase_admin_client
from app.services.storage_service import list_bucket_file_paths_under_prefix

PROJECT_SCHEMA_NAME = "retirement_activity_prints"
LIBRARY_ASSETS_TABLE = "library_assets"
BATCH_SIZE = 500

LibraryKind = Literal["outline", "emoji"]
ItemType = TypeVar("ItemType")


@dataclass(frozen=True)
class LibraryConfig:
    kind: LibraryKind
    bucket: str
    extensions: frozenset[str]


def _db() -> Any:
    return create_supabase_admin_client().schema(PROJECT_SCHEMA_NAME)


def _stem(object_path: str) -> str:
    filename = object_path.rsplit("/", 1)[-1]
    return filename.rsplit(".", 1)[0] if "." in filename else filename


def _is_supported(object_path: str, extensions: frozenset[str]) -> bool:
    filename = object_path.rsplit("/", 1)[-1]
    return "." in filename and filename.rsplit(".", 1)[-1].lower() in extensions


def _tags_from_path(object_path: str) -> list[str]:
    return [segment.replace("_", " ") for segment in object_path.split("/")[:-1] if segment]


def _asset_row(*, config: LibraryConfig, object_path: str) -> dict[str, Any]:
    slug = _stem(object_path)
    title = slug.replace("_", " ")
    tags = _tags_from_path(object_path)
    return {
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, object_path)),
        "kind": config.kind,
        "bucket": config.bucket,
        "object_path": object_path,
        "thumbnail_object_path": None,
        "title": title,
        "slug": slug,
        "tags": tags,
        "search_text": " ".join([title, slug, *tags]).lower(),
        "is_active": True,
    }


def _chunks(items: list[ItemType], size: int) -> list[list[ItemType]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def _list_indexed_paths(*, config: LibraryConfig) -> set[str]:
    paths: set[str] = set()
    offset = 0
    while True:
        response = (
            _db()
            .table(LIBRARY_ASSETS_TABLE)
            .select("object_path")
            .eq("kind", config.kind)
            .range(offset, offset + BATCH_SIZE - 1)
            .execute()
        )
        rows = list(response.data or [])
        paths.update(str(row.get("object_path")) for row in rows if row.get("object_path"))
        if len(rows) < BATCH_SIZE:
            return paths
        offset += BATCH_SIZE


def sync_library(config: LibraryConfig) -> tuple[int, int]:
    object_paths = list_bucket_file_paths_under_prefix(prefix="", bucket=config.bucket)
    supported_paths = sorted(
        path for path in object_paths if _is_supported(path, config.extensions)
    )
    supported_set = set(supported_paths)
    previously_indexed = _list_indexed_paths(config=config)
    missing_paths = sorted(previously_indexed - supported_set)

    # Avoid PostgREST 414 (URI too long) from large `.in_(object_path, …)` filters:
    # deactivate the whole kind, then re-activate current storage objects via upsert.
    if previously_indexed:
        (
            _db()
            .table(LIBRARY_ASSETS_TABLE)
            .update({"is_active": False})
            .eq("kind", config.kind)
            .execute()
        )

    rows = [_asset_row(config=config, object_path=path) for path in supported_paths]
    for batch in _chunks(rows, BATCH_SIZE):
        (
            _db()
            .table(LIBRARY_ASSETS_TABLE)
            .upsert(batch, on_conflict="bucket,object_path")
            .execute()
        )

    return len(rows), len(missing_paths)


def _configs(selected_kind: str) -> list[LibraryConfig]:
    configs = [
        LibraryConfig(
            kind="outline",
            bucket=settings.OUTLINE_LIBRARY_STORAGE_BUCKET.strip(),
            extensions=frozenset({"png", "jpg", "jpeg", "webp", "gif"}),
        ),
        LibraryConfig(
            kind="emoji",
            bucket=settings.EMOJI_LIBRARY_STORAGE_BUCKET.strip(),
            extensions=frozenset({"svg"}),
        ),
    ]
    if selected_kind == "all":
        return configs
    return [item for item in configs if item.kind == selected_kind]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kind", choices=("outline", "emoji", "all"), default="all")
    args = parser.parse_args()
    for config in _configs(args.kind):
        active_count, deactivated_count = sync_library(config)
        print(
            f"{config.kind}: indexed={active_count} deactivated={deactivated_count}",
        )


if __name__ == "__main__":
    main()
