"""Application configuration."""

from typing import List, Optional, Union

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    CORS_ORIGINS: Union[str, List[str]] = ["*"]
    CORS_CREDENTIALS: bool = True
    CORS_METHODS: List[str] = ["*"]
    CORS_HEADERS: List[str] = ["*"]
    # Optional: allow any localhost / 127.0.0.1 port (Vite often picks 5173–5176+). See .env.example.
    CORS_ALLOW_ORIGIN_REGEX: Optional[str] = None

    SUPABASE_URL: str
    SUPABASE_PUBLIC_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str

    SUPABASE_STORAGE_BUCKET: str = "retirement-activity-prints"

    # Shared bucket for public outline library (re-usable across products/projects).
    OUTLINE_LIBRARY_STORAGE_BUCKET: str = "outline-library"
    EMOJI_LIBRARY_STORAGE_BUCKET: str = "emoji-library"

    # Creator Hub sync (optional, enable via env vars).
    HUB_API_URL: Optional[str] = None
    HUB_APP_CODE: Optional[str] = None

    GEMINI_GENERATION_MAX_ATTEMPTS: int = 3
    GEMINI_GENERATION_BACKOFF_BASE_SECONDS: float = 1.0

    # Studio AI templates (Gemini). Key stays server-side only.
    GEMINI_API_KEY: Optional[str] = None
    STUDIO_GEMINI_MODEL: str = "gemini-flash-lite-latest"
    # Upstream call timeout; without it a stalled Gemini call pins a worker.
    STUDIO_GEMINI_TIMEOUT_SECONDS: int = 90

    REDIS_URL: str = "redis://localhost:6379/0"
    AI_IMAGE_JOB_TIMEOUT_SECONDS: int = 900
    AI_IMAGE_JOB_RESULT_TTL_SECONDS: int = 3600

settings = Settings()

