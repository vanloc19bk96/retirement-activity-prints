from __future__ import annotations

from redis import Redis
from rq import Worker

from app.core.config import settings
from app.services.ai_image_queue_service import AI_IMAGE_QUEUE_NAME


def main() -> None:
    connection = Redis.from_url(settings.REDIS_URL)
    worker = Worker([AI_IMAGE_QUEUE_NAME], connection=connection)
    worker.work(with_scheduler=True)


if __name__ == "__main__":
    main()

