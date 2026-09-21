from __future__ import annotations

from typing import Any

from redis import Redis
from rq import Queue
from rq.job import Job

from app.core.config import settings

AI_IMAGE_QUEUE_NAME = "ai-image-generation"


def _get_redis_connection() -> Redis:
    return Redis.from_url(settings.REDIS_URL)


def get_ai_image_queue() -> Queue:
    return Queue(name=AI_IMAGE_QUEUE_NAME, connection=_get_redis_connection())


def enqueue_interior_generation_job(*, payload: dict[str, Any], user_id: str) -> str:
    queue = get_ai_image_queue()
    job = queue.enqueue(
        "app.services.ai_image_tasks.generate_interior_images_task",
        payload=payload,
        user_id=user_id,
        job_timeout=settings.AI_IMAGE_JOB_TIMEOUT_SECONDS,
        result_ttl=settings.AI_IMAGE_JOB_RESULT_TTL_SECONDS,
    )
    job.meta["user_id"] = user_id
    job.save_meta()
    return job.id


def get_ai_image_job(job_id: str) -> Job | None:
    connection = _get_redis_connection()
    try:
        return Job.fetch(job_id, connection=connection)
    except Exception:
        return None

