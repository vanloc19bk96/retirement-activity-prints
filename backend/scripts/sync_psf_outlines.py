"""
Download Pearson Scott Foresman (PD) line-art PNGs from Wikimedia Commons
into Supabase Storage bucket outline-library/public-domain/pd-scottforesman/.

License: public domain (Template:PD-ScottForesman / PD-Author Pearson Scott Foresman).
Commercial use allowed. Skip colourised variants (prefer B&W for print worksheets).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional, Tuple

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
CATEGORY = "Category:PD-ScottForesman"
USER_AGENT = "RetirementActivityPrintsBot/1.0 (PSF outline sync; local-dev)"
STORAGE_PREFIX = "public-domain/pd-scottforesman"
DEFAULT_BUCKET = "outline-library"
# Cap single downloads — huge scans burn storage without helping worksheets.
MAX_BYTES = 4 * 1024 * 1024


def _env_path() -> Path:
    return Path(__file__).resolve().parents[1] / ".env"


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def storage_base_url(env: dict[str, str]) -> str:
    # Host-side script: prefer public localhost over Docker-only hostname.
    public = env.get("SUPABASE_PUBLIC_URL", "").rstrip("/")
    internal = env.get("SUPABASE_URL", "").rstrip("/")
    if public:
        return public
    if internal and "supabase-kong" not in internal:
        return internal
    return "http://localhost:8000"


def http_json(url: str, *, headers: Optional[dict] = None, data: Optional[bytes] = None) -> dict:
    req = urllib.request.Request(url, data=data, headers=headers or {}, method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_bytes(url: str, *, headers: Optional[dict] = None) -> bytes:
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def commons_get(params: dict[str, str]) -> dict:
    query = urllib.parse.urlencode(params)
    url = f"{COMMONS_API}?{query}"
    last_error: Optional[Exception] = None
    for attempt in range(6):
        req = urllib.request.Request(
            url,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code not in (429, 503):
                raise
            # Wikimedia throttles aggressive bots — back off and retry.
            time.sleep(min(60.0, 2.0 ** attempt + 1.0))
        except urllib.error.URLError as exc:
            last_error = exc
            time.sleep(min(30.0, 2.0 ** attempt))
    assert last_error is not None
    raise last_error


def title_to_object_name(title: str) -> Optional[str]:
    """Map Commons File title → storage object basename (matches existing uploads)."""
    name = title
    if name.startswith("File:"):
        name = name[5:]
    if not name.lower().endswith(".png"):
        return None
    # Drop colourised / colorized variants — keep B&W line art for print.
    lower = name.lower()
    if "colourised" in lower or "colorized" in lower or "colourized" in lower:
        return None
    name = re.sub(r"\s*\(PSF\)\s*", " ", name, flags=re.IGNORECASE)
    name = name[:-4]  # strip .png
    name = name.strip().lower()
    name = name.replace("'", "")
    name = re.sub(r"[^a-z0-9]+", "-", name)
    name = re.sub(r"-{2,}", "-", name).strip("-")
    if not name:
        return None
    return f"{name}.png"


def list_existing_names(*, base_url: str, key: str, bucket: str) -> set[str]:
    names: set[str] = set()
    offset = 0
    while True:
        body = json.dumps({"prefix": STORAGE_PREFIX, "limit": 100, "offset": offset}).encode()
        rows = http_json(
            f"{base_url}/storage/v1/object/list/{bucket}",
            headers={
                "Authorization": f"Bearer {key}",
                "apikey": key,
                "Content-Type": "application/json",
            },
            data=body,
        )
        if not isinstance(rows, list) or not rows:
            break
        for row in rows:
            name = str(row.get("name") or "")
            if name and not name.startswith("."):
                names.add(name)
        if len(rows) < 100:
            break
        offset += len(rows)
    return names


def iter_category_titles() -> list:
    titles = []
    cont = None  # type: Optional[str]
    while True:
        params = {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": CATEGORY,
            "cmtype": "file",
            "cmlimit": "500",
            "format": "json",
        }
        if cont:
            params["cmcontinue"] = cont
        data = commons_get(params)
        members = data.get("query", {}).get("categorymembers", [])
        for row in members:
            title = str(row.get("title") or "")
            if title:
                titles.append(title)
        cont = data.get("continue", {}).get("cmcontinue")
        if not cont:
            break
        time.sleep(1.0)
    return titles


def fetch_image_urls_batch(titles: list) -> dict:
    """
    Resolve download URLs for many File: titles in one API call.

    Prefer thumbnail URLs (iiurlwidth) — Wikimedia asks bots to use thumbs
    instead of hammering original file endpoints.
    """
    if not titles:
        return {}
    data = commons_get(
        {
            "action": "query",
            "titles": "|".join(titles),
            "prop": "imageinfo",
            "iiprop": "url|size|mime",
            "iiurlwidth": "1024",
            "format": "json",
        }
    )
    out = {}
    pages = data.get("query", {}).get("pages", {})
    for page in pages.values():
        title = str(page.get("title") or "")
        infos = page.get("imageinfo") or []
        if not title or not infos:
            continue
        info = infos[0]
        mime = str(info.get("mime") or "")
        size = int(info.get("size") or 0)
        thumb = str(info.get("thumburl") or "")
        original = str(info.get("url") or "")
        if mime != "image/png":
            continue
        if size > MAX_BYTES and not thumb:
            continue
        # Thumb first (rate-limit friendly); fall back to original for small files.
        out[title] = thumb or original
    return out


def upload_png(
    *,
    base_url: str,
    key: str,
    bucket: str,
    object_name: str,
    content: bytes,
) -> None:
    path = f"{STORAGE_PREFIX}/{object_name}"
    encoded = "/".join(urllib.parse.quote(part, safe="") for part in path.split("/"))
    url = f"{base_url}/storage/v1/object/{bucket}/{encoded}"
    req = urllib.request.Request(
        url,
        data=content,
        method="POST",
        headers={
            "Authorization": f"Bearer {key}",
            "apikey": key,
            "Content-Type": "image/png",
            "x-upsert": "true",
            "User-Agent": USER_AGENT,
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        resp.read()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=800, help="Max new files to upload")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--bucket", default=DEFAULT_BUCKET)
    parser.add_argument(
        "--titles-file",
        default="",
        help="Optional JSONL/plain list of Commons File: titles (skip live category crawl)",
    )
    args = parser.parse_args()

    env = load_env(_env_path())
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not key:
        raise SystemExit("SUPABASE_SERVICE_ROLE_KEY missing in backend/.env")
    base_url = storage_base_url(env)
    bucket = (env.get("OUTLINE_LIBRARY_STORAGE_BUCKET") or args.bucket).strip()

    existing = list_existing_names(base_url=base_url, key=key, bucket=bucket)
    print(f"existing_in_bucket={len(existing)} base={base_url} bucket={bucket}", flush=True)

    titles_path = Path(args.titles_file) if args.titles_file else Path()
    if args.titles_file and titles_path.is_file():
        titles = [
            line.strip()
            for line in titles_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        print(f"titles_from_file={len(titles)} path={titles_path}", flush=True)
    else:
        titles = iter_category_titles()
        print(f"commons_category_files={len(titles)}", flush=True)

    candidates = []  # type: list[Tuple[str, str]]
    seen_names = set(existing)
    for title in titles:
        object_name = title_to_object_name(title)
        if not object_name or object_name in seen_names:
            continue
        seen_names.add(object_name)
        candidates.append((title, object_name))

    print(f"new_png_candidates={len(candidates)} limit={args.limit}", flush=True)
    to_fetch = candidates[: max(0, args.limit)]

    uploaded = 0
    skipped = 0
    failed = 0
    batch_size = 40
    for batch_start in range(0, len(to_fetch), batch_size):
        batch = to_fetch[batch_start : batch_start + batch_size]
        try:
            url_by_title = fetch_image_urls_batch([title for title, _ in batch])
            time.sleep(1.5)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            print(f"FAIL batch-resolve: {exc}", flush=True)
            time.sleep(45)
            continue

        for offset, (title, object_name) in enumerate(batch):
            index = batch_start + offset + 1
            image_url = url_by_title.get(title)
            if not image_url:
                skipped += 1
                continue
            try:
                content = http_bytes(image_url, headers={"User-Agent": USER_AGENT})
                if len(content) < 200 or content[:8] != b"\x89PNG\r\n\x1a\n":
                    skipped += 1
                    continue
                if args.dry_run:
                    digest = hashlib.sha1(content).hexdigest()[:8]
                    print(
                        f"[dry-run] {index}/{len(to_fetch)} {object_name} "
                        f"bytes={len(content)} sha={digest}",
                        flush=True,
                    )
                else:
                    upload_png(
                        base_url=base_url,
                        key=key,
                        bucket=bucket,
                        object_name=object_name,
                        content=content,
                    )
                    uploaded += 1
                    if uploaded % 10 == 0 or index == len(to_fetch):
                        print(
                            f"uploaded={uploaded} progress={index}/{len(to_fetch)} last={object_name}",
                            flush=True,
                        )
                time.sleep(1.2)
            except urllib.error.HTTPError as exc:
                failed += 1
                print(f"FAIL {title}: {exc}", flush=True)
                time.sleep(60 if exc.code == 429 else 3)
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                failed += 1
                print(f"FAIL {title}: {exc}", flush=True)
                time.sleep(3)

    print(
        f"done uploaded={uploaded} skipped={skipped} failed={failed} "
        f"bucket_total_est={len(existing) + uploaded}",
        flush=True,
    )
    return 0 if failed == 0 or uploaded > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
