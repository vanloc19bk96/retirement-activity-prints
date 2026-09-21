from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from storage3.exceptions import StorageApiError

from app.core.dependencies import get_current_user_id
from app.schemas.downloads import (
    ConsumeDownloadQuotaResponse,
    CreatePdfMergeSessionRequest,
    CreatePdfMergeSessionResponse,
    DownloadQuotaResponse,
)
from app.services.download_quota_service import (
    DownloadQuotaExceededError,
    consume_download_quota,
    get_download_quota_status,
)
from app.services.pdf_merge_service import (
    MERGED_INTERIOR_PDF_FILE_NAME,
    create_pdf_merge_session,
    merge_pdf_merge_session_bytes,
    upload_pdf_merge_chunk,
)

router = APIRouter(prefix="/downloads", tags=["downloads"])


@router.get("/quota", response_model=DownloadQuotaResponse)
async def get_download_quota(user_id: str = Depends(get_current_user_id)) -> DownloadQuotaResponse:
    status_payload = get_download_quota_status(user_id=user_id)
    return DownloadQuotaResponse(**status_payload)


@router.post("/consume", response_model=ConsumeDownloadQuotaResponse)
async def consume_download(user_id: str = Depends(get_current_user_id)) -> ConsumeDownloadQuotaResponse:
    try:
        status_payload = consume_download_quota(user_id=user_id)
    except DownloadQuotaExceededError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

    return ConsumeDownloadQuotaResponse(**status_payload)


@router.post("/pdf-merge/sessions", response_model=CreatePdfMergeSessionResponse)
async def create_pdf_merge(
    payload: CreatePdfMergeSessionRequest,
    user_id: str = Depends(get_current_user_id),
) -> CreatePdfMergeSessionResponse:
    try:
        session = create_pdf_merge_session(user_id=user_id, chunk_count=payload.chunk_count)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return CreatePdfMergeSessionResponse(session_id=session.session_id)


@router.post("/pdf-merge/sessions/{session_id}/chunks")
async def upload_pdf_merge_session_chunk(
    session_id: str,
    chunk_index: int = Form(..., ge=0),
    chunk: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
) -> dict[str, str]:
    chunk_bytes = await chunk.read()
    try:
        upload_pdf_merge_chunk(
            user_id=user_id,
            session_id=session_id,
            chunk_index=chunk_index,
            chunk_bytes=chunk_bytes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except StorageApiError as exc:
        if exc.status == 413:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="PDF chunk is too large for temporary storage. Try exporting fewer pages per batch.",
            ) from exc
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=exc.message or str(exc)) from exc

    return {"status": "uploaded"}


@router.post("/pdf-merge/sessions/{session_id}/finalize")
async def finalize_pdf_merge(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
) -> Response:
    try:
        merged_bytes = merge_pdf_merge_session_bytes(user_id=user_id, session_id=session_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return Response(
        content=merged_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{MERGED_INTERIOR_PDF_FILE_NAME}"',
            "Content-Length": str(len(merged_bytes)),
        },
    )
