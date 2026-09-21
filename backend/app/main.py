from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import settings

app = FastAPI(title="Retirement Activity Prints API")

# Normalize allowed origins so CORS middleware always receives a list
cors_origins: List[str]
if isinstance(settings.CORS_ORIGINS, str):
    cors_origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()]
else:
    cors_origins = settings.CORS_ORIGINS

cors_origin_regex = (settings.CORS_ALLOW_ORIGIN_REGEX or "").strip() or None

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins or ["*"],
    allow_credentials=settings.CORS_CREDENTIALS,
    allow_methods=settings.CORS_METHODS,
    allow_headers=settings.CORS_HEADERS,
    allow_origin_regex=cors_origin_regex,
)

app.include_router(router, prefix="/api")


@app.get("/", summary="Root endpoint")
def read_root() -> dict[str, str]:
    return {"message": "Retirement Activity Prints backend is running"}

