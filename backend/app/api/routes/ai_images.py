from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, status

from app.core.dependencies import get_current_user_id
from app.schemas.ai_images import (
    AiImageJobAcceptedResponse,
    AiImageJobStatusResponse,
    GenerateImagesResponse,
    GenerateInteriorImagesRequest,
    GeneratedImageItem,
)
from app.services.ai_image_queue_service import (
    enqueue_interior_generation_job,
    get_ai_image_job,
)
from app.services.user_service import get_user_service

router = APIRouter(prefix="/ai-images", tags=["ai-images"])


_TRACEBACK_ERROR_LINE_PATTERN = re.compile(r"^(?P<error_type>[\w.]+):\s*(?P<message>.+)$")


def _extract_job_error_message(exc_info: Any) -> str:
    raw_error = str(exc_info or "").strip()
    if not raw_error:
        return "Image generation job failed"

    lines = [line.strip() for line in raw_error.splitlines() if line.strip()]
    for line in reversed(lines):
        match = _TRACEBACK_ERROR_LINE_PATTERN.match(line)
        if not match:
            continue
        message = match.group("message").strip()
        if message:
            return message[:1000]

    return lines[-1][:1000] if lines else "Image generation job failed"


def _map_result_to_response(result: dict[str, Any]) -> GenerateImagesResponse:
    return GenerateImagesResponse(
        mode=result["mode"],
        images=[
            GeneratedImageItem(
                idea=item.get("idea"),
                public_url=item["public_url"],
                bucket=item["bucket"],
                path=item["path"],
            )
            for item in result["images"]
        ],
    )


@router.post(
    "/interior/jobs",
    response_model=AiImageJobAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Queue interior image generation job",
)
async def queue_interior_images_job(
    payload: GenerateInteriorImagesRequest = Body(...),
    user_id: str = Depends(get_current_user_id),
) -> AiImageJobAcceptedResponse:
    user_service = get_user_service()
    user_row = user_service.get_user_by_id(user_id)
    normalized_plan = (user_row.get("plan") if isinstance(user_row, dict) else None) or ""
    plan = str(normalized_plan).strip().lower()
    is_standard_tier = plan in {"standard", "premium", "pro"}
    if not is_standard_tier:
        raise HTTPException(status_code=403, detail="AI image generation requires Standard plan")

    try:
        job_id = enqueue_interior_generation_job(
            payload=payload.model_dump(by_alias=False),
            user_id=user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - best-effort error mapping
        raise HTTPException(status_code=500, detail="Failed to queue interior image generation") from exc
    return AiImageJobAcceptedResponse(job_id=job_id, status="queued")


@router.get(
    "/jobs/{job_id}",
    response_model=AiImageJobStatusResponse,
    summary="Get AI image generation job status",
)
async def get_ai_image_job_status(
    job_id: str,
    user_id: str = Depends(get_current_user_id),
) -> AiImageJobStatusResponse:
    job = get_ai_image_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    owner_user_id = job.meta.get("user_id")
    if isinstance(owner_user_id, str) and owner_user_id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    if job.is_finished:
        result = job.result
        if not isinstance(result, dict):
            raise HTTPException(status_code=500, detail="Job completed without valid result")
        return AiImageJobStatusResponse(
            job_id=job_id,
            status="finished",
            result=_map_result_to_response(result),
        )

    if job.is_failed:
        error_message = _extract_job_error_message(job.exc_info)
        return AiImageJobStatusResponse(
            job_id=job_id,
            status="failed",
            error=error_message,
        )

    job_status = "started" if job.is_started else "queued"
    return AiImageJobStatusResponse(job_id=job_id, status=job_status)

