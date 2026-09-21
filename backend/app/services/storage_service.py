from __future__ import annotations

from dataclasses import dataclass
import logging
import uuid
from typing import Any, Dict, cast
from urllib.parse import quote, unquote, urlparse

from fastapi import UploadFile

from app.core.config import settings
from app.core.supabase import create_supabase_admin_client

logger = logging.getLogger(__name__)


def build_public_storage_object_url(*, object_path: str, bucket: str | None = None) -> str:
    """Public URL for an object in a Supabase storage bucket."""
    normalized = (object_path or "").strip().lstrip("/")
    if not normalized:
        raise ValueError("object_path is required")
    public_base_url = settings.SUPABASE_PUBLIC_URL.rstrip("/")
    bucket_name = (bucket or settings.SUPABASE_STORAGE_BUCKET).strip()
    if not bucket_name:
        raise ValueError("bucket is required")
    encoded_path = quote(normalized)
    return f"{public_base_url}/storage/v1/object/public/{bucket_name}/{encoded_path}"


def build_signed_storage_object_url(
    *,
    object_path: str,
    bucket: str | None = None,
    expires_in_seconds: int = 300,
) -> str:
    """
    Signed URL for an object in a Supabase storage bucket.

    Use for private assets (e.g. template JSON) to enforce plan-based access.
    """
    normalized = (object_path or "").strip().lstrip("/")
    if not normalized:
        raise ValueError("object_path is required")
    bucket_name = (bucket or settings.SUPABASE_STORAGE_BUCKET).strip()
    if not bucket_name:
        raise ValueError("bucket is required")
    expiry = max(60, int(expires_in_seconds or 0))

    supabase = create_supabase_admin_client()
    storage = supabase.storage.from_(bucket_name)
    result = storage.create_signed_url(normalized, expiry)
    if isinstance(result, dict):
        signed = result.get("signedURL") or result.get("signedUrl") or result.get("signed_url")
        if isinstance(signed, str) and signed.strip():
            return signed.strip()
    raise ValueError("Failed to create signed URL")


@dataclass(frozen=True)
class UploadImageResult:
    bucket: str
    path: str
    public_url: str


def _get_image_extension_from_content_type(content_type: str) -> str | None:
    """
    Convert an image content-type into a safe file extension.

    We intentionally avoid using the original uploaded filename.
    """
    mime = (content_type or "").lower().strip()
    if not mime.startswith("image/"):
        return None

    subtype = mime.split("/", 1)[1].split(";", 1)[0].strip()
    if not subtype:
        return None

    if subtype in {"jpeg", "jpg"}:
        return "jpg"
    if subtype in {"png"}:
        return "png"
    if subtype in {"webp"}:
        return "webp"

    # Best-effort: keep the subtype as extension (e.g. image/gif -> gif).
    safe_extension = "".join(ch for ch in subtype if ch.isalnum())
    return safe_extension or None


def _upload_bytes_to_storage(
    *,
    object_path: str,
    file_bytes: bytes,
    content_type: str,
) -> UploadImageResult:
    supabase = create_supabase_admin_client()
    storage = supabase.storage.from_(settings.SUPABASE_STORAGE_BUCKET)
    storage.upload(
        path=object_path,
        file=file_bytes,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    public_url = build_public_storage_object_url(object_path=object_path)
    return UploadImageResult(bucket=settings.SUPABASE_STORAGE_BUCKET, path=object_path, public_url=public_url)


def upload_user_image_bytes(
    *,
    image_bytes: bytes,
    user_id: str,
    content_type: str,
) -> UploadImageResult:
    """
    Store raw image bytes under the same prefix as multipart upload_user_image:
    images/{user_id}/upload/{uuid}.{ext}
    """
    if not image_bytes:
        raise ValueError("Image bytes are required")
    ct = (content_type or "").strip()
    if not ct.lower().startswith("image/"):
        raise ValueError("Only image uploads are supported")
    extension = _get_image_extension_from_content_type(ct)
    object_name = str(uuid.uuid4())
    if extension:
        object_name = f"{object_name}.{extension}"
    object_path = f"images/{user_id}/upload/{object_name}"
    return _upload_bytes_to_storage(object_path=object_path, file_bytes=image_bytes, content_type=ct)


def upload_user_image(*, file: UploadFile, user_id: str) -> UploadImageResult:
    if not file:
        raise ValueError("File is required")

    content_type = (file.content_type or "").strip()
    if not content_type.lower().startswith("image/"):
        raise ValueError("Only image uploads are supported")
    file_bytes = file.file.read()
    extension = _get_image_extension_from_content_type(content_type)

    object_name = str(uuid.uuid4())
    if extension:
        object_name = f"{object_name}.{extension}"

    object_path = f"images/{user_id}/upload/{object_name}"

    return _upload_bytes_to_storage(
        object_path=object_path,
        file_bytes=file_bytes,
        content_type=content_type,
    )


def upload_processed_image_bytes(
    *,
    image_bytes: bytes,
    filename: str,
    user_id: str,
) -> UploadImageResult:
    if not image_bytes:
        raise ValueError("Image bytes are required")
    if not filename:
        raise ValueError("Filename is required")

    object_path = f"{user_id}/processed/{filename}"

    return _upload_bytes_to_storage(
        object_path=object_path,
        file_bytes=image_bytes,
        content_type="image/png",
    )


def upload_user_processed_image_bytes(
    *,
    image_bytes: bytes,
    filename: str,
    user_id: str,
) -> UploadImageResult:
    if not image_bytes:
        raise ValueError("Image bytes are required")
    if not filename:
        raise ValueError("Filename is required")

    object_path = f"images/{user_id}/processed/{filename}"
    return _upload_bytes_to_storage(
        object_path=object_path,
        file_bytes=image_bytes,
        content_type="image/png",
    )


def _object_path_from_public_storage_url(public_url: str) -> str | None:
    """Resolve object path from a public storage URL.

    We intentionally match by URL *path* instead of host to support local setups
    where frontend/backend may use different Supabase hostnames (e.g. localhost
    vs container DNS). Query params are ignored.
    """
    stripped = (public_url or "").strip()
    if not stripped:
        return None

    bucket = settings.SUPABASE_STORAGE_BUCKET
    marker = f"/storage/v1/object/public/{bucket}/"

    # Try robust URL parsing first.
    try:
        parsed = urlparse(stripped)
        path = parsed.path or ""
    except Exception:  # noqa: BLE001
        path = ""

    if marker in path:
        suffix = path.split(marker, 1)[1].lstrip("/")
        return unquote(suffix) if suffix else None

    # Fallback for malformed values that still contain the public marker.
    if marker in stripped:
        suffix = stripped.split(marker, 1)[1].split("?", 1)[0].lstrip("/")
        return unquote(suffix) if suffix else None

    return None


def _list_bucket_rows_paginated(*, storage: Any, prefix: str) -> list[dict[str, Any]]:
    """Fetch all rows for a storage prefix (Supabase list defaults to limit=100)."""
    rows_out: list[dict[str, Any]] = []
    offset = 0
    page_limit = 100
    while True:
        try:
            page = storage.list(
                prefix,
                {"limit": page_limit, "offset": offset},
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("storage_list_failed prefix=%s offset=%s err=%s", prefix, offset, exc)
            break
        if not page:
            break
        for row in page:
            if isinstance(row, dict):
                rows_out.append(cast(Dict[str, Any], row))
        if len(page) < page_limit:
            break
        offset += page_limit
    return rows_out


def _list_storage_object_paths_under_prefix(*, storage: Any, prefix: str) -> list[str]:
    """
    List file object paths under a bucket prefix (recursive when list returns folder rows).

    `prefix` must not start or end with `/` (normalized segments).
    Empty prefix means listing from bucket root.
    """
    normalized = prefix.strip().strip("/")

    out: list[str] = []

    def visit(current_prefix: str) -> None:
        rows = _list_bucket_rows_paginated(storage=storage, prefix=current_prefix)
        for row in rows:
            name = row.get("name")
            if not name or not isinstance(name, str):
                continue
            child = f"{current_prefix}/{name}".strip("/")
            metadata = row.get("metadata")
            if metadata is None:
                # Heuristic: Supabase may return `metadata=None` for some implementations.
                # If the name looks like a file (contains a dot), treat it as a leaf object.
                if "." in name:
                    out.append(child)
                else:
                    visit(child)
            else:
                out.append(child)

    visit(normalized)
    return out


def list_bucket_file_paths_under_prefix(*, prefix: str, bucket: str | None = None) -> list[str]:
    """
    List all object paths under a folder prefix in a storage bucket (recursive).

    Prefix must not be wrapped in slashes; use e.g. ``outlines`` or ``outlines/animals``.
    Use empty prefix ``""`` to list from bucket root.
    """
    supabase = create_supabase_admin_client()
    bucket_name = (bucket or settings.SUPABASE_STORAGE_BUCKET).strip()
    if not bucket_name:
        raise ValueError("bucket is required")
    storage = supabase.storage.from_(bucket_name)
    return _list_storage_object_paths_under_prefix(storage=storage, prefix=prefix)


def list_bucket_rows_page(
    *,
    prefix: str,
    limit: int,
    offset: int,
    bucket: str | None = None,
) -> list[dict[str, Any]]:
    """
    List a single storage page from a bucket prefix.

    This is used by paginated APIs to avoid scanning the full bucket when search
    query is empty.
    """
    supabase = create_supabase_admin_client()
    bucket_name = (bucket or settings.SUPABASE_STORAGE_BUCKET).strip()
    if not bucket_name:
        raise ValueError("bucket is required")
    storage = supabase.storage.from_(bucket_name)
    normalized_prefix = prefix.strip().strip("/")
    page = storage.list(
        normalized_prefix,
        {"limit": max(limit, 1), "offset": max(offset, 0)},
    )
    if not page:
        return []
    return [cast(Dict[str, Any], row) for row in page if isinstance(row, dict)]


def _normalize_public_storage_url_candidate(value: Any) -> str | None:
    """
    Normalize an image URL value found in Fabric JSON.

    We only need stable URL paths to map back to Supabase storage object paths.
    """
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    # Ignore query params (Supabase public URLs may carry cache-busting params).
    return trimmed.split("?", 1)[0]


def collect_referenced_supabase_image_public_urls_from_canvas_json(canvas_json: Any) -> list[str]:
    """
    Collect image `src` URLs from Fabric JSON.

    We intentionally do a generic recursive scan instead of relying on Fabric's
    node `type === "image"` because serialized structures can vary.

    Also collects `originalImageUrl` when present so orphan cleanup does not
    delete uploads still referenced only by that field.
    """
    into: set[str] = set()
    extra_keys = ("originalImageUrl",)

    def visit(node: Any) -> None:
        if node is None:
            return
        if isinstance(node, list):
            for item in node:
                visit(item)
            return
        if not isinstance(node, dict):
            return

        if "src" in node:
            src = _normalize_public_storage_url_candidate(node.get("src"))
            if src:
                into.add(src)
        for key in extra_keys:
            if key not in node:
                continue
            extra = _normalize_public_storage_url_candidate(node.get(key))
            if extra:
                into.add(extra)

        for value in node.values():
            if isinstance(value, (dict, list)):
                visit(value)

    visit(canvas_json)
    return list(into)


def delete_user_processed_objects_not_referenced_by_public_urls(
    *,
    user_id: str,
    referenced_public_urls: list[str],
    fail_safe_when_no_keep_paths: bool = True,
) -> None:
    """
    Delete objects under images/{user_id}/processed/ that are not referenced by any URL in
    `referenced_public_urls` (resolved via our public storage URL pattern).

    Best-effort: logs warnings and does not raise — save flow must not fail on cleanup.
    """
    uid = (user_id or "").strip()
    if not uid:
        return

    processed_prefix = f"images/{uid}/processed"
    keep_paths: set[str] = set()
    has_any_referenced_url = False
    has_any_parsed_storage_url = False
    for raw in referenced_public_urls or []:
        url = (raw or "").strip()
        if not url:
            continue
        has_any_referenced_url = True
        parsed = _object_path_from_public_storage_url(url)
        if parsed is None:
            continue
        has_any_parsed_storage_url = True
        if not parsed.startswith(f"{processed_prefix}/"):
            continue
        if any(part == ".." for part in parsed.split("/")):
            continue
        keep_paths.add(parsed)

    if not keep_paths:
        if fail_safe_when_no_keep_paths:
            # Fail-safe: when we cannot resolve any valid processed object from
            # the current editor snapshot, skip deletion to avoid removing active files.
            return
        # If the snapshot includes some image URLs but none of them match our
        # public storage URL pattern, we can't reliably map them back to object paths.
        # In that case, skip full deletion to avoid removing potentially referenced files.
        if has_any_referenced_url and not has_any_parsed_storage_url:
            return

    try:
        supabase = create_supabase_admin_client()
        storage = supabase.storage.from_(settings.SUPABASE_STORAGE_BUCKET)
        existing_paths = _list_storage_object_paths_under_prefix(storage=storage, prefix=processed_prefix)
    except Exception as exc:  # noqa: BLE001
        logger.warning("delete_orphan_processed_list_failed user=%s err=%s", uid, exc)
        return

    to_remove = [path for path in existing_paths if path not in keep_paths]
    if not to_remove:
        return

    logger.info(
        "storage_cleanup_delete user=%s prefix=%s existing=%d keep=%d removed=%d",
        uid,
        processed_prefix,
        len(existing_paths),
        len(keep_paths),
        len(to_remove),
    )

    try:
        storage.remove(to_remove)
    except Exception as exc:  # noqa: BLE001
        logger.warning("delete_orphan_processed_remove_failed user=%s err=%s", uid, exc)


def delete_user_image_objects_not_referenced_by_public_urls(
    *,
    user_id: str,
    referenced_public_urls: list[str],
    fail_safe_when_no_keep_paths: bool = True,
) -> None:
    """
    Delete objects under images/{user_id}/upload/ that are not referenced by any URL in
    `referenced_public_urls` (resolved via our public storage URL pattern).

    Best-effort: logs warnings and does not raise — save/load flow must not fail on cleanup.
    """
    uid = (user_id or "").strip()
    if not uid:
        return

    images_prefix = f"images/{uid}/upload"
    keep_paths: set[str] = set()
    has_any_referenced_url = False
    has_any_parsed_storage_url = False
    for raw in referenced_public_urls or []:
        url = (raw or "").strip()
        if not url:
            continue
        has_any_referenced_url = True
        parsed = _object_path_from_public_storage_url(url)
        if parsed is None:
            continue
        has_any_parsed_storage_url = True
        if not parsed.startswith(f"{images_prefix}/"):
            continue
        if any(part == ".." for part in parsed.split("/")):
            continue
        keep_paths.add(parsed)

    if not keep_paths:
        if fail_safe_when_no_keep_paths:
            # Fail-safe: when we cannot resolve any valid user image from the current snapshot,
            # skip deletion to avoid removing active files.
            return
        # If the snapshot includes some image URLs but none of them match our
        # public storage URL pattern, we can't reliably map them back to object paths.
        # In that case, skip full deletion to avoid removing potentially referenced files.
        if has_any_referenced_url and not has_any_parsed_storage_url:
            return

    try:
        supabase = create_supabase_admin_client()
        storage = supabase.storage.from_(settings.SUPABASE_STORAGE_BUCKET)
        existing_paths = _list_storage_object_paths_under_prefix(storage=storage, prefix=images_prefix)
    except Exception as exc:  # noqa: BLE001
        logger.warning("delete_orphan_images_list_failed user=%s err=%s", uid, exc)
        return

    to_remove = [path for path in existing_paths if path not in keep_paths]
    if not to_remove:
        return

    logger.info(
        "storage_cleanup_delete user=%s prefix=%s existing=%d keep=%d removed=%d",
        uid,
        images_prefix,
        len(existing_paths),
        len(keep_paths),
        len(to_remove),
    )

    try:
        storage.remove(to_remove)
    except Exception as exc:  # noqa: BLE001
        logger.warning("delete_orphan_images_remove_failed user=%s err=%s", uid, exc)


def delete_user_processed_object_by_public_url(*, user_id: str, public_url: str) -> None:
    """
    Delete one processed object if URL points to `images/{user_id}/processed/*`.

    Best-effort: logs warnings and does not raise.
    """
    uid = (user_id or "").strip()
    if not uid:
        return
    parsed_path = _object_path_from_public_storage_url((public_url or "").strip())
    if not parsed_path:
        return
    expected_prefix = f"images/{uid}/processed/"
    if not parsed_path.startswith(expected_prefix):
        return
    if any(part == ".." for part in parsed_path.split("/")):
        return
    try:
        supabase = create_supabase_admin_client()
        storage = supabase.storage.from_(settings.SUPABASE_STORAGE_BUCKET)
        storage.remove([parsed_path])
    except Exception as exc:  # noqa: BLE001
        logger.warning("delete_processed_object_failed user=%s path=%s err=%s", uid, parsed_path, exc)


