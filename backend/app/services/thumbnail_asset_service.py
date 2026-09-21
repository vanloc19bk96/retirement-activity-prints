"""Fetch remote images server-side for editor thumbnail export (avoids browser CORS)."""

from __future__ import annotations

import ipaddress
import os
from urllib.parse import urlparse

import requests
from fastapi import HTTPException, status

from app.core.config import settings

MAX_IMAGE_BYTES = 12 * 1024 * 1024
REQUEST_TIMEOUT = (5, 30)
USER_AGENT = "BookCanvasEditor-ThumbnailProxy/1.0"

_ALLOWLIST_HOSTNAMES: set[str] | None = None


def _running_in_docker() -> bool:
    # Common, lightweight Docker signal.
    return os.path.exists("/.dockerenv")


def _rewrite_localhost_for_docker(url: str) -> str:
    """
    In docker-compose, backend runs on :8000 and cannot reach host services via localhost.
    If the frontend sends Supabase URLs like http://localhost:8000/..., rewrite to
    host.docker.internal so the container can reach the host's port mapping.
    """
    try:
        parsed = urlparse(url)
    except Exception:
        return url

    if not _running_in_docker():
        return url

    host = (parsed.hostname or "").strip().lower()
    if host not in ("localhost", "127.0.0.1", "::1"):
        return url

    # Keep scheme/port/path/query intact.
    netloc = "host.docker.internal"
    if parsed.port:
        netloc = f"{netloc}:{parsed.port}"
    return parsed._replace(netloc=netloc).geturl()


def _get_allowlist_hostnames() -> set[str]:
    """
    Allow internal hosts only when they match our configured Supabase endpoints.
    This keeps SSRF protections on while supporting local dev (e.g. Supabase on localhost:8000).
    """
    global _ALLOWLIST_HOSTNAMES
    if _ALLOWLIST_HOSTNAMES is not None:
        return _ALLOWLIST_HOSTNAMES

    allow: set[str] = set()
    for raw in (getattr(settings, "SUPABASE_URL", None), getattr(settings, "SUPABASE_PUBLIC_URL", None)):
        if not raw:
            continue
        try:
            host = urlparse(str(raw)).hostname
        except Exception:
            host = None
        if host:
            allow.add(host.strip().lower().rstrip("."))

    _ALLOWLIST_HOSTNAMES = allow
    return allow


def _hostname_is_blocked(hostname: str) -> bool:
    h = hostname.strip().lower().rstrip(".")
    if h in _get_allowlist_hostnames():
        return False
    if h in ("localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal"):
        return True
    if h.endswith(".local") or h.endswith(".localhost"):
        return True
    try:
        ip = ipaddress.ip_address(h)
        return bool(
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        )
    except ValueError:
        return False


def assert_public_http_url(url: str) -> str:
    trimmed = url.strip()
    if len(trimmed) < 8 or len(trimmed) > 4096:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid URL length")

    parsed = urlparse(trimmed)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only http(s) URLs are allowed")

    host = parsed.hostname
    if not host:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing host")

    if _hostname_is_blocked(host):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="URL host is not allowed")

    return trimmed


def fetch_image_bytes_for_thumbnail(url: str) -> tuple[bytes, str]:
    safe_url = assert_public_http_url(url)
    safe_url = _rewrite_localhost_for_docker(safe_url)
    try:
        response = requests.get(
            safe_url,
            timeout=REQUEST_TIMEOUT,
            stream=True,
            headers={"User-Agent": USER_AGENT},
            allow_redirects=True,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch image",
        ) from exc

    content_type = (response.headers.get("Content-Type") or "application/octet-stream").split(";")[0].strip()

    chunks: list[bytes] = []
    total = 0
    try:
        for chunk in response.iter_content(chunk_size=65536):
            if not chunk:
                continue
            total += len(chunk)
            if total > MAX_IMAGE_BYTES:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image too large")
            chunks.append(chunk)
    finally:
        response.close()

    return b"".join(chunks), content_type
