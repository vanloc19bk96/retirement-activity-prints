"""Sample outline pictures for Picture Recognition from the outline-library bucket."""

from __future__ import annotations

import logging
import random
import time
import uuid
from collections import defaultdict, deque
from typing import Any

from app.core.config import settings
from app.schemas.studio_pictures import (
    PictureRef,
    PictureSetRequest,
    PictureSetResponse,
)
from app.services.outlines_service import list_all_outline_image_paths
from app.services.storage_service import build_public_storage_object_url

logger = logging.getLogger(__name__)

# Outline sampling is cheap (cached bucket list) — not a paid model call.
# Book builder allows up to 100 games; uniqueness may retry prefetch a few times
# per game. Cap at 20 caused qty=30 builds to skip the last 10 with HTTP 429.
_RATE_WINDOW_SECONDS = 60.0
_RATE_MAX_PER_WINDOW = 200
_rate_hits: dict[str, deque[float]] = defaultdict(deque)


class PictureRateLimitError(Exception):
    """User exceeded the short-window picture sampling quota."""


class PictureLibraryError(Exception):
    """Outline library could not be read or returned an unusable sample."""


def _check_rate_limit(user_id: str) -> None:
    now = time.monotonic()
    hits = _rate_hits[user_id]
    while hits and now - hits[0] > _RATE_WINDOW_SECONDS:
        hits.popleft()
    if len(hits) >= _RATE_MAX_PER_WINDOW:
        raise PictureRateLimitError(
            "Too many picture requests. Please wait a minute and try again."
        )
    hits.append(now)


def _outline_bucket() -> str:
    return settings.OUTLINE_LIBRARY_STORAGE_BUCKET.strip()


def _stem_from_path(object_path: str) -> str:
    name = object_path.rstrip("/").rsplit("/", 1)[-1]
    if "." in name:
        return name.rsplit(".", 1)[0]
    return name


def _path_to_row(path: str) -> dict[str, Any]:
    bucket = _outline_bucket()
    public_url = build_public_storage_object_url(object_path=path, bucket=bucket)
    return {
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, path)),
        "object_path": path,
        "title": _stem_from_path(path).replace("_", " "),
        "public_url": public_url,
    }


def _to_ref(row: dict[str, Any]) -> PictureRef:
    path = str(row.get("object_path") or "").strip()
    if not path:
        raise PictureLibraryError("Sampled outline row is missing object_path")
    public_url = str(row.get("public_url") or "").strip()
    if not public_url:
        public_url = build_public_storage_object_url(
            object_path=path,
            bucket=_outline_bucket(),
        )
    lower = public_url.lower()
    if "token=" in lower or "expires=" in lower or "x-amz-" in lower:
        raise PictureLibraryError("Refusing signed/expiring image URL")
    return PictureRef(
        id=str(row.get("id") or path),
        url=public_url,
        name=str(row.get("title") or "").strip() or None,
    )


def sample_outline_images(*, limit: int, seed: int) -> list[dict[str, Any]]:
    """
    Seeded random sample of `limit` images from the outline-library bucket.

    Uses the cached recursive bucket listing shared with the Outlines panel.
    """
    if limit <= 0:
        return []
    try:
        paths = list_all_outline_image_paths()
    except Exception as exc:  # noqa: BLE001
        raise PictureLibraryError("Failed to list outline-library images") from exc

    if not paths:
        return []

    rng = random.Random(seed)
    if len(paths) <= limit:
        chosen = list(paths)
        rng.shuffle(chosen)
        return [_path_to_row(p) for p in chosen]

    chosen = rng.sample(paths, limit)
    return [_path_to_row(p) for p in chosen]


def build_picture_set(req: PictureSetRequest, user_id: str) -> PictureSetResponse:
    _check_rate_limit(user_id)
    total_needed = req.target_count + req.distractor_count

    rows = sample_outline_images(limit=total_needed, seed=req.seed)
    if len(rows) < total_needed:
        raise ValueError(
            f"Only {len(rows)} images available in the outline library; "
            f"{total_needed} requested. Try a smaller number."
        )

    targets = rows[: req.target_count]
    distractors = rows[req.target_count :]
    options = [_to_ref(r) for r in (*targets, *distractors)]
    random.Random(req.seed).shuffle(options)

    logger.info(
        "studio_pictures_sampled user=%s requested=%s returned=%s",
        user_id,
        total_needed,
        len(options),
    )

    return PictureSetResponse(
        targets=[_to_ref(r) for r in targets],
        options=options,
    )
