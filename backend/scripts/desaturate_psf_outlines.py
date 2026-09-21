"""
Scan outline-library/public-domain/pd-scottforesman and force true grayscale.

- Detect images with chroma (color ink / colourised art)
- Convert to grayscale PNG and upsert back
- Delete filenames that are explicitly colourised/colored variants
"""
from __future__ import annotations

import argparse
import io
import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import List, Optional, Set, Tuple

from PIL import Image

STORAGE_PREFIX = "public-domain/pd-scottforesman"
DEFAULT_BUCKET = "outline-library"
# Max channel spread treated as "has color" (noise-tolerant).
CHROMA_THRESHOLD = 10
# Fraction of opaque samples that must be chromatic to flag the image.
COLOR_SAMPLE_RATIO = 0.002


def _env_path() -> Path:
    return Path(__file__).resolve().parents[1] / ".env"


def load_env(path: Path) -> dict:
    values = {}
    if not path.is_file():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def storage_base_url(env: dict) -> str:
    public = env.get("SUPABASE_PUBLIC_URL", "").rstrip("/")
    if public:
        return public
    return "http://localhost:8000"


def http_json(url: str, *, headers: Optional[dict] = None, data: Optional[bytes] = None):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_bytes(url: str, *, headers: Optional[dict] = None) -> bytes:
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def list_names(*, base_url: str, key: str, bucket: str) -> List[str]:
    names = []
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
            if name.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                names.append(name)
        if len(rows) < 100:
            break
        offset += len(rows)
    return names


def is_colourised_name(name: str) -> bool:
    lower = name.lower()
    return any(
        token in lower
        for token in ("colourised", "colorized", "colourized", "-colored", "_colored", "coloured")
    )


def analyze_color(content: bytes) -> Tuple[bool, float]:
    """Return (has_color, colored_sample_ratio)."""
    im = Image.open(io.BytesIO(content)).convert("RGBA")
    pixels = im.getdata()
    step = max(1, len(pixels) // 80000)
    opaque = 0
    colored = 0
    for i in range(0, len(pixels), step):
        r, g, b, a = pixels[i]
        if a < 16:
            continue
        opaque += 1
        if max(r, g, b) - min(r, g, b) > CHROMA_THRESHOLD:
            colored += 1
    if opaque == 0:
        return False, 0.0
    ratio = colored / float(opaque)
    return ratio >= COLOR_SAMPLE_RATIO, ratio


def to_grayscale_png(content: bytes) -> bytes:
    im = Image.open(io.BytesIO(content))
    # Preserve alpha when present so line-art stays clean on white worksheet cells.
    if "A" in im.getbands():
        rgba = im.convert("RGBA")
        gray = rgba.convert("LA")
        out = gray.convert("RGBA")
    else:
        out = im.convert("L").convert("RGB")
    buf = io.BytesIO()
    out.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def upload_png(*, base_url: str, key: str, bucket: str, object_name: str, content: bytes) -> None:
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
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        resp.read()


def delete_objects(*, base_url: str, key: str, bucket: str, object_names: List[str]) -> None:
    if not object_names:
        return
    # Local Kong/Storage stack expects {"prefixes": [...]} (not a bare array).
    paths = [f"{STORAGE_PREFIX}/{name}" for name in object_names]
    body = json.dumps({"prefixes": paths}).encode()
    req = urllib.request.Request(
        f"{base_url}/storage/v1/object/{bucket}",
        data=body,
        method="DELETE",
        headers={
            "Authorization": f"Bearer {key}",
            "apikey": key,
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        resp.read()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--convert-all",
        action="store_true",
        help="Force grayscale on every file (not only detected color)",
    )
    args = parser.parse_args()

    env = load_env(_env_path())
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not key:
        raise SystemExit("SUPABASE_SERVICE_ROLE_KEY missing")
    base_url = storage_base_url(env)
    bucket = (env.get("OUTLINE_LIBRARY_STORAGE_BUCKET") or DEFAULT_BUCKET).strip()

    names = list_names(base_url=base_url, key=key, bucket=bucket)
    print(f"scanned={len(names)} bucket={bucket}/{STORAGE_PREFIX}", flush=True)

    to_delete = [n for n in names if is_colourised_name(n)]
    keep = [n for n in names if n not in set(to_delete)]

    colored_names = []
    converted = 0
    already_gray = 0
    failed = 0

    for index, name in enumerate(keep, start=1):
        try:
            url = f"{base_url}/storage/v1/object/public/{bucket}/{STORAGE_PREFIX}/{urllib.parse.quote(name)}"
            content = http_bytes(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
            has_color, ratio = analyze_color(content)
            if has_color:
                colored_names.append((name, ratio))
            if args.convert_all or has_color:
                gray = to_grayscale_png(content)
                if args.dry_run:
                    print(
                        f"[dry-run] convert {name} chroma_ratio={ratio:.4f} "
                        f"bytes {len(content)}->{len(gray)}",
                        flush=True,
                    )
                else:
                    # Keep .png object names even if source was jpeg.
                    target = name if name.lower().endswith(".png") else f"{Path(name).stem}.png"
                    upload_png(
                        base_url=base_url,
                        key=key,
                        bucket=bucket,
                        object_name=target,
                        content=gray,
                    )
                    converted += 1
                    if converted % 20 == 0:
                        print(f"converted={converted} progress={index}/{len(keep)} last={name}", flush=True)
            else:
                already_gray += 1
        except (urllib.error.HTTPError, urllib.error.URLError, OSError) as exc:
            failed += 1
            print(f"FAIL {name}: {exc}", flush=True)

    print(f"color_detected={len(colored_names)}", flush=True)
    for name, ratio in colored_names[:40]:
        print(f"  color {name} ratio={ratio:.4f}", flush=True)
    if len(colored_names) > 40:
        print(f"  ... +{len(colored_names) - 40} more", flush=True)

    if to_delete:
        print(f"delete_colourised_variants={len(to_delete)}", flush=True)
        for name in to_delete:
            print(f"  delete {name}", flush=True)
        if not args.dry_run:
            # Delete in small batches.
            for i in range(0, len(to_delete), 50):
                delete_objects(
                    base_url=base_url,
                    key=key,
                    bucket=bucket,
                    object_names=to_delete[i : i + 50],
                )

    print(
        f"done converted={converted} already_gray={already_gray} "
        f"deleted={0 if args.dry_run else len(to_delete)} failed={failed}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
