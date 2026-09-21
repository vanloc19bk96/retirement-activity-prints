from __future__ import annotations

from typing import Any


def _build_task_response(mode: str, result: dict[str, Any]) -> dict[str, Any]:
    return {
        "mode": mode,
        "images": result["images"],
    }


def generate_interior_images_task(*, payload: dict[str, Any], user_id: str) -> dict[str, Any]:
    from app.services.ai_image_service import get_ai_image_service

    service = get_ai_image_service()
    result = service.generate_interior_images(
        idea=payload.get("idea"),
        custom_prompt=payload.get("custom_prompt"),
        style=payload.get("style", "random"),
        line_weight=payload.get("line_weight", "medium"),
        user_id=user_id,
    )
    return _build_task_response("interior", result)

