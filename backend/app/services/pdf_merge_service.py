from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from io import BytesIO
from threading import Lock

from pypdf import PdfReader, PdfWriter

from app.core.config import settings
from app.services.storage_service import (
    _upload_bytes_to_storage,
    list_bucket_file_paths_under_prefix,
)

logger = logging.getLogger(__name__)

SESSION_TTL = timedelta(hours=2)
PDF_MERGE_PREFIX = "exports/pdf-merge"
MERGED_INTERIOR_PDF_FILE_NAME = "book-editor_interior.pdf"


@dataclass
class PdfMergeSession:
    session_id: str
    user_id: str
    chunk_count: int
    uploaded_chunks: set[int] = field(default_factory=set)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


_sessions: dict[str, PdfMergeSession] = {}
_sessions_lock = Lock()


def _purge_expired_sessions() -> None:
    cutoff = datetime.now(timezone.utc) - SESSION_TTL
    expired = [session_id for session_id, session in _sessions.items() if session.created_at < cutoff]
    for session_id in expired:
        _sessions.pop(session_id, None)


def create_pdf_merge_session(*, user_id: str, chunk_count: int) -> PdfMergeSession:
    if chunk_count < 1:
        raise ValueError("chunk_count must be at least 1")

    session_id = str(uuid.uuid4())
    session = PdfMergeSession(session_id=session_id, user_id=user_id, chunk_count=chunk_count)

    with _sessions_lock:
        _purge_expired_sessions()
        _sessions[session_id] = session

    return session


def _get_session_for_user(*, session_id: str, user_id: str) -> PdfMergeSession:
    with _sessions_lock:
        session = _sessions.get(session_id)
    if not session or session.user_id != user_id:
        raise ValueError("PDF merge session not found")
    return session


def _chunk_object_path(*, user_id: str, session_id: str, chunk_index: int) -> str:
    return f"{PDF_MERGE_PREFIX}/{user_id}/{session_id}/chunk-{chunk_index}.pdf"


def upload_pdf_merge_chunk(
    *,
    user_id: str,
    session_id: str,
    chunk_index: int,
    chunk_bytes: bytes,
) -> None:
    if not chunk_bytes:
        raise ValueError("Chunk bytes are required")
    if chunk_index < 0:
        raise ValueError("chunk_index must be non-negative")

    session = _get_session_for_user(session_id=session_id, user_id=user_id)
    if chunk_index >= session.chunk_count:
        raise ValueError("chunk_index exceeds declared chunk_count")

    object_path = _chunk_object_path(user_id=user_id, session_id=session_id, chunk_index=chunk_index)
    _upload_bytes_to_storage(
        object_path=object_path,
        file_bytes=chunk_bytes,
        content_type="application/pdf",
    )

    with _sessions_lock:
        session.uploaded_chunks.add(chunk_index)


def _cleanup_pdf_merge_session_storage(*, user_id: str, session_id: str) -> None:
    try:
        session_paths = list_bucket_file_paths_under_prefix(
            prefix=f"{PDF_MERGE_PREFIX}/{user_id}/{session_id}",
        )
        if not session_paths:
            return

        from app.core.supabase import create_supabase_admin_client

        supabase = create_supabase_admin_client()
        supabase.storage.from_(settings.SUPABASE_STORAGE_BUCKET).remove(session_paths)
    except Exception:
        logger.exception("Failed to cleanup PDF merge storage for session %s", session_id)


def merge_pdf_merge_session_bytes(*, user_id: str, session_id: str) -> bytes:
    """
    Merge uploaded chunk PDFs and return bytes directly.

    Chunks are stored temporarily in Supabase to free browser RAM; the merged
    file is streamed back over HTTP instead of re-uploaded (avoids 413 limits).
    """
    session = _get_session_for_user(session_id=session_id, user_id=user_id)
    expected = set(range(session.chunk_count))
    if session.uploaded_chunks != expected:
        missing = sorted(expected - session.uploaded_chunks)
        raise ValueError(f"Missing PDF chunks: {missing}")

    writer = PdfWriter()

    try:
        from app.core.supabase import create_supabase_admin_client

        supabase = create_supabase_admin_client()
        storage = supabase.storage.from_(settings.SUPABASE_STORAGE_BUCKET)

        for chunk_index in range(session.chunk_count):
            object_path = _chunk_object_path(user_id=user_id, session_id=session_id, chunk_index=chunk_index)
            chunk_bytes = storage.download(object_path)
            if not chunk_bytes:
                raise ValueError(f"Failed to download chunk {chunk_index}")

            if not isinstance(chunk_bytes, (bytes, bytearray)):
                chunk_bytes = bytes(chunk_bytes)

            reader = PdfReader(BytesIO(chunk_bytes))
            for page in reader.pages:
                writer.add_page(page)

        merged_buffer = BytesIO()
        writer.write(merged_buffer)
        return merged_buffer.getvalue()
    finally:
        _cleanup_pdf_merge_session_storage(user_id=user_id, session_id=session_id)
        with _sessions_lock:
            _sessions.pop(session_id, None)


# Backwards-compatible alias for any internal callers.
finalize_pdf_merge_session = merge_pdf_merge_session_bytes
