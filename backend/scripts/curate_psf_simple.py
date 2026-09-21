"""
Curate pd-scottforesman for memory worksheets: keep only simple everyday pictures
(animals, vehicles, household objects, food, flowers/plants, clothing, tools, etc.).

Removes diagrams, geometry, anatomy, maps, abstract/science concepts.
Optionally tops up from Commons titles file (B&W PNG thumbs).
"""
from __future__ import annotations

import argparse
import io
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from PIL import Image

STORAGE_PREFIX = "public-domain/pd-scottforesman"
DEFAULT_BUCKET = "outline-library"
USER_AGENT = "RetirementActivityPrintsBot/1.0 (PSF simple curate; local-dev)"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
MAX_BYTES = 4 * 1024 * 1024
CHROMA_THRESHOLD = 10

# Always drop if any of these tokens appear (diagrams / science / anatomy / maps).
HARD_DENY_TOKENS = frozenset(
    {
        "angle",
        "angles",
        "acute",
        "adjacent",
        "abscissa",
        "amplitude",
        "refraction",
        "diagram",
        "chart",
        "stellar",
        "hertzsprung",
        "russell",
        "abstract",
        "acrostic",
        "acre",
        "acnode",
        "abdomen",
        "abomasum",
        "adenoids",
        "adenoid",
        "adrenal",
        "gland",
        "afferent",
        "alimentary",
        "architecture",
        "abutment",
        "abutments",
        "acropolis",
        "accommodation",
        "photo",
        "horizon",
        "altitude",
        "aphelion",
        "apogee",
        "apastron",
        "apparent",
        "diameter",
        "annular",
        "eclipse",
        "orbit",
        "axis",
        "vertex",
        "polygon",
        "triangle",
        "sphere",
        "cylinder",
        "cone",
        "prism",
        "equation",
        "formula",
        "theorem",
        "graph",
        "schematic",
        "circuit",
        "skeleton",
        "molecule",
        "atom",
        "farsi",
        "persian",
        "edited",
        "cropped",
        "colourised",
        "colorized",
        "colored",
        "coloured",
        "abreast",
        "aft",
        "aba",
        "abatis",
        "accolade",
        "adjutant",
        "aggregate",
        "acinaciform",
        "acuminate",
        "img",
        # geographic plates often labeled as seas / forests / cities
        "aden",
        "amazon",
        "argonne",
        "arabian",
    }
)

# Simple everyday stems (memory-friendly). Match on filename tokens.
ALLOW_STEMS = frozenset(
    {
        # animals
        "aardvark",
        "addax",
        "adder",
        "agouti",
        "alligator",
        "alpaca",
        "ant",
        "anteater",
        "antelope",
        "ape",
        "armadillo",
        "badger",
        "bat",
        "bear",
        "beaver",
        "bee",
        "beetle",
        "bird",
        "bison",
        "boar",
        "buffalo",
        "butterfly",
        "camel",
        "cat",
        "caterpillar",
        "cattle",
        "cheetah",
        "chicken",
        "chipmunk",
        "clam",
        "cobra",
        "cockroach",
        "cow",
        "coyote",
        "crab",
        "crane",
        "crocodile",
        "crow",
        "deer",
        "dinosaur",
        "dog",
        "dolphin",
        "donkey",
        "dove",
        "dragonfly",
        "duck",
        "eagle",
        "eel",
        "elephant",
        "elk",
        "falcon",
        "ferret",
        "finch",
        "fish",
        "flamingo",
        "fly",
        "fox",
        "frog",
        "giraffe",
        "goat",
        "goose",
        "gorilla",
        "grasshopper",
        "hamster",
        "hare",
        "hawk",
        "hedgehog",
        "hippo",
        "hippopotamus",
        "horse",
        "hummingbird",
        "hyena",
        "iguana",
        "jackal",
        "jaguar",
        "jellyfish",
        "kangaroo",
        "kitten",
        "koala",
        "ladybug",
        "lamb",
        "leopard",
        "lion",
        "lizard",
        "llama",
        "lobster",
        "locust",
        "lynx",
        "mammoth",
        "mole",
        "monkey",
        "moose",
        "mosquito",
        "moth",
        "mouse",
        "mule",
        "octopus",
        "ostrich",
        "otter",
        "owl",
        "ox",
        "oyster",
        "panda",
        "panther",
        "parrot",
        "peacock",
        "pelican",
        "penguin",
        "pig",
        "pigeon",
        "pony",
        "porcupine",
        "porpoise",
        "possum",
        "puma",
        "puppy",
        "quail",
        "rabbit",
        "raccoon",
        "ram",
        "rat",
        "raven",
        "reindeer",
        "rhinoceros",
        "rhino",
        "rooster",
        "salamander",
        "salmon",
        "seal",
        "shark",
        "sheep",
        "shrimp",
        "skunk",
        "snail",
        "snake",
        "sparrow",
        "spider",
        "squirrel",
        "starfish",
        "stork",
        "swan",
        "tiger",
        "toad",
        "tortoise",
        "trout",
        "turkey",
        "turtle",
        "walrus",
        "wasp",
        "weasel",
        "whale",
        "wolf",
        "wombat",
        "woodpecker",
        "worm",
        "zebra",
        "airedale",
        "abalone",
        "aigrette",
        "albatross",
        "antelope",
        "baboon",
        "bass",
        "bluebird",
        "bobcat",
        "bull",
        "bunny",
        "canary",
        "cardinal",
        "carp",
        "chick",
        "chimp",
        "chimpanzee",
        "cougar",
        "cuckoo",
        "dodo",
        "firefly",
        "gazelle",
        "gopher",
        "grouse",
        "gull",
        "heron",
        "hornet",
        "ibis",
        "jay",
        "kingfisher",
        "lemur",
        "macaw",
        "magpie",
        "mallard",
        "mantis",
        "meerkat",
        "mink",
        "newt",
        "oriole",
        "parakeet",
        "pheasant",
        "platypus",
        "puffin",
        "python",
        "robin",
        "seahorse",
        "sealion",
        "slug",
        "squid",
        "stingray",
        "swallow",
        "tapir",
        "toucan",
        "vulture",
        "wren",
        "yak",
        # vehicles / transport
        "airplane",
        "aeroplane",
        "aircraft",
        "ambulance",
        "bicycle",
        "bike",
        "boat",
        "bus",
        "cab",
        "canoe",
        "car",
        "carriage",
        "cart",
        "ferry",
        "glider",
        "helicopter",
        "jeep",
        "kayak",
        "locomotive",
        "motorcycle",
        "plane",
        "raft",
        "rocket",
        "scooter",
        "ship",
        "sleigh",
        "subway",
        "taxi",
        "tractor",
        "train",
        "tram",
        "truck",
        "van",
        "wagon",
        "yacht",
        "zeppelin",
        # household / everyday objects
        "abacus",
        "accordion",
        "alarm",
        "anchor",
        "anvil",
        "apple",
        "apron",
        "armchair",
        "arrow",
        "axe",
        "adz",
        "bag",
        "ball",
        "balloon",
        "banana",
        "barrel",
        "basket",
        "bathtub",
        "battery",
        "bead",
        "bed",
        "bell",
        "belt",
        "bench",
        "bib",
        "blanket",
        "blender",
        "book",
        "boot",
        "bottle",
        "bowl",
        "box",
        "bracelet",
        "bread",
        "brick",
        "bridge",
        "broom",
        "brush",
        "bucket",
        "button",
        "cabinet",
        "cage",
        "cake",
        "calendar",
        "camera",
        "candle",
        "cane",
        "cap",
        "carpet",
        "carrot",
        "chair",
        "chalk",
        "cheese",
        "cherry",
        "chest",
        "clock",
        "closet",
        "coat",
        "comb",
        "cookie",
        "couch",
        "cradle",
        "crayon",
        "crown",
        "crutch",
        "cup",
        "curtain",
        "cushion",
        "desk",
        "dish",
        "doll",
        "door",
        "drawer",
        "dress",
        "drum",
        "earring",
        "egg",
        "envelope",
        "fan",
        "fence",
        "flag",
        "flashlight",
        "flute",
        "fork",
        "fountain",
        "frame",
        "frying",
        "pan",
        "glass",
        "glove",
        "guitar",
        "hammer",
        "handbag",
        "hanger",
        "hat",
        "helmet",
        "hose",
        "iron",
        "jacket",
        "jar",
        "jug",
        "kettle",
        "key",
        "keyboard",
        "kite",
        "knife",
        "ladder",
        "lamp",
        "lantern",
        "laptop",
        "leaf",
        "lemon",
        "letter",
        "lightbulb",
        "lock",
        "magnet",
        "mailbox",
        "mask",
        "match",
        "mattress",
        "medal",
        "microscope",
        "mirror",
        "mitten",
        "mug",
        "nail",
        "necklace",
        "needle",
        "newspaper",
        "notebook",
        "orange",
        "oven",
        "paintbrush",
        "painting",
        "pants",
        "paper",
        "pen",
        "pencil",
        "phone",
        "piano",
        "pillow",
        "pipe",
        "plate",
        "pliers",
        "plug",
        "pocket",
        "pot",
        "potato",
        "purse",
        "quilt",
        "radio",
        "rake",
        "refrigerator",
        "ribbon",
        "ring",
        "rope",
        "ruler",
        "saddle",
        "saw",
        "scarf",
        "scissors",
        "screwdriver",
        "shirt",
        "shoe",
        "shovel",
        "sink",
        "skate",
        "skirt",
        "sled",
        "slippers",
        "soap",
        "sock",
        "sofa",
        "spatula",
        "spoon",
        "stamp",
        "stapler",
        "stool",
        "stove",
        "suitcase",
        "sun",
        "sunglasses",
        "sweater",
        "swing",
        "sword",
        "table",
        "teapot",
        "telephone",
        "television",
        "tent",
        "thermometer",
        "tie",
        "toaster",
        "toilet",
        "toothbrush",
        "towel",
        "toy",
        "tractor",
        "trash",
        "tray",
        "tree",
        "trumpet",
        "umbrella",
        "vase",
        "violin",
        "wallet",
        "watch",
        "wheel",
        "window",
        "wrench",
        "zipper",
        # food
        "bagel",
        "berry",
        "broccoli",
        "butter",
        "cabbage",
        "candy",
        "cereal",
        "chocolate",
        "coconut",
        "coffee",
        "corn",
        "croissant",
        "cucumber",
        "donut",
        "doughnut",
        "garlic",
        "grape",
        "hamburger",
        "honey",
        "ice",
        "cream",
        "jam",
        "lettuce",
        "mango",
        "melon",
        "milk",
        "mushroom",
        "noodle",
        "onion",
        "pancake",
        "pasta",
        "peach",
        "peanut",
        "pear",
        "pepper",
        "pie",
        "pizza",
        "pretzel",
        "pumpkin",
        "rice",
        "salad",
        "sandwich",
        "sausage",
        "soup",
        "steak",
        "strawberry",
        "sugar",
        "tomato",
        "watermelon",
        "yogurt",
        # plants / flowers
        "acacia",
        "acanthus",
        "aconite",
        "acorn",
        "alder",
        "cactus",
        "daisy",
        "fern",
        "flower",
        "grass",
        "iris",
        "ivy",
        "lily",
        "lotus",
        "maple",
        "oak",
        "orchid",
        "palm",
        "pine",
        "rose",
        "sunflower",
        "tulip",
        "violet",
        "willow",
        "daisy",
        "poppy",
        "daisy",
        "bamboo",
        "mushroom",
        # sports / play
        "archery",
        "ball",
        "bat",
        "glove",
        "helmet",
        "racket",
        "skateboard",
        "ski",
        "soccer",
        "tennis",
        # misc simple
        "agate",
        "aigrette",
        "anvil",
        "abbey",
        "apartment",
        "barn",
        "castle",
        "church",
        "house",
        "hut",
        "igloo",
        "lighthouse",
        "school",
        "tower",
        "windmill",
        "african",
        "european",
        "tongue",
        "bow",
    }
)


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
    return (env.get("SUPABASE_PUBLIC_URL") or "http://localhost:8000").rstrip("/")


def tokens_from_name(name: str) -> List[str]:
    stem = Path(name).stem.lower()
    stem = re.sub(r"-[0-9a-f]{6,}$", "", stem)  # drop hash suffixes
    stem = stem.replace("_", "-")
    parts = [p for p in re.split(r"[^a-z0-9]+", stem) if p]
    tokens: List[str] = []
    for part in parts:
        if part.isdigit() or re.fullmatch(r"[0-9a-f]{6,}", part):
            continue
        # aardvark2 / ape1 → aardvark / ape
        base = re.sub(r"\d+$", "", part)
        if base:
            tokens.append(base)
    return tokens


def classify(name: str) -> Tuple[bool, str]:
    """Return (keep, reason)."""
    tokens = tokens_from_name(name)
    if not tokens:
        return False, "empty"
    lower = Path(name).stem.lower()
    if any(
        x in lower
        for x in (
            "colouris",
            "coloriz",
            "colored",
            "coloured",
            "photo",
            "diagram",
            "chart",
            "refraction",
            "hertzsprung",
            "top-view",
            "side-view",
            "front-view",
            "a-frame",
        )
    ):
        return False, "variant-or-diagram"
    hard = [t for t in tokens if t in HARD_DENY_TOKENS]
    if hard:
        return False, "hard-deny:" + ",".join(hard)
    allow_hits = [t for t in tokens if t in ALLOW_STEMS]
    if allow_hits:
        return True, "allow:" + ",".join(allow_hits)
    return False, "not-simple"


def title_to_object_name(title: str) -> Optional[str]:
    name = title[5:] if title.startswith("File:") else title
    if not name.lower().endswith(".png"):
        return None
    lower = name.lower()
    if any(x in lower for x in ("colouris", "coloriz", "colored", "coloured", "photo")):
        return None
    name = re.sub(r"\s*\(PSF\)\s*", " ", name, flags=re.IGNORECASE)
    name = name[:-4].strip().lower().replace("'", "")
    name = re.sub(r"[^a-z0-9]+", "-", name)
    name = re.sub(r"-{2,}", "-", name).strip("-")
    if not name:
        return None
    return f"{name}.png"


def http_json(url: str, *, headers: Optional[dict] = None, data: Optional[bytes] = None):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_bytes(url: str, *, headers: Optional[dict] = None) -> bytes:
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def commons_get(params: dict) -> dict:
    query = urllib.parse.urlencode(params)
    url = f"{COMMONS_API}?{query}"
    last_error: Optional[Exception] = None
    for attempt in range(6):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code not in (429, 503):
                raise
            time.sleep(min(60.0, 2.0 ** attempt + 2.0))
        except urllib.error.URLError as exc:
            last_error = exc
            time.sleep(min(30.0, 2.0 ** attempt))
    assert last_error is not None
    raise last_error


def list_names(*, base_url: str, key: str, bucket: str) -> List[str]:
    names: List[str] = []
    offset = 0
    while True:
        body = json.dumps({"prefix": STORAGE_PREFIX, "limit": 100, "offset": offset}).encode()
        rows = http_json(
            f"{base_url}/storage/v1/object/list/{bucket}",
            headers={"Authorization": f"Bearer {key}", "apikey": key, "Content-Type": "application/json"},
            data=body,
        )
        if not isinstance(rows, list) or not rows:
            break
        for row in rows:
            name = str(row.get("name") or "")
            if name.lower().endswith(".png"):
                names.append(name)
        if len(rows) < 100:
            break
        offset += len(rows)
    return names


def delete_objects(*, base_url: str, key: str, bucket: str, object_names: List[str]) -> None:
    if not object_names:
        return
    paths = [f"{STORAGE_PREFIX}/{name}" for name in object_names]
    for i in range(0, len(paths), 40):
        chunk = paths[i : i + 40]
        body = json.dumps({"prefixes": chunk}).encode()
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


def to_grayscale_png(content: bytes) -> bytes:
    im = Image.open(io.BytesIO(content))
    if "A" in im.getbands():
        out = im.convert("RGBA").convert("LA").convert("RGBA")
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
            "User-Agent": USER_AGENT,
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        resp.read()


def fetch_image_urls_batch(titles: List[str]) -> Dict[str, str]:
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
    out: Dict[str, str] = {}
    for page in data.get("query", {}).get("pages", {}).values():
        title = str(page.get("title") or "")
        infos = page.get("imageinfo") or []
        if not title or not infos:
            continue
        info = infos[0]
        if str(info.get("mime") or "") != "image/png":
            continue
        size = int(info.get("size") or 0)
        thumb = str(info.get("thumburl") or "")
        original = str(info.get("url") or "")
        if size > MAX_BYTES and not thumb:
            continue
        url = thumb or original
        if url:
            out[title] = url
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--top-up", type=int, default=400, help="Max new simple images to download")
    parser.add_argument(
        "--titles-file",
        default=str(Path(__file__).with_name("_psf_titles.jsonl")),
    )
    parser.add_argument("--skip-delete", action="store_true")
    parser.add_argument("--skip-top-up", action="store_true")
    args = parser.parse_args()

    env = load_env(_env_path())
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not key:
        raise SystemExit("SUPABASE_SERVICE_ROLE_KEY missing")
    base_url = storage_base_url(env)
    bucket = (env.get("OUTLINE_LIBRARY_STORAGE_BUCKET") or DEFAULT_BUCKET).strip()

    names = list_names(base_url=base_url, key=key, bucket=bucket)
    keep: List[str] = []
    drop: List[Tuple[str, str]] = []
    for name in names:
        ok, reason = classify(name)
        if ok:
            keep.append(name)
        else:
            drop.append((name, reason))

    print(f"bucket_total={len(names)} keep={len(keep)} drop={len(drop)}", flush=True)
    for name, reason in drop[:60]:
        print(f"  DROP {name} ({reason})", flush=True)
    if len(drop) > 60:
        print(f"  ... +{len(drop) - 60} more", flush=True)
    print("KEEP samples:", ", ".join(keep[:25]), flush=True)

    if not args.skip_delete and drop:
        drop_names = [n for n, _ in drop]
        if args.dry_run:
            print(f"[dry-run] would delete {len(drop_names)}", flush=True)
        else:
            delete_objects(base_url=base_url, key=key, bucket=bucket, object_names=drop_names)
            print(f"deleted={len(drop_names)}", flush=True)

    if args.skip_top_up or args.top_up <= 0:
        return 0

    titles_path = Path(args.titles_file)
    if not titles_path.is_file():
        print(f"titles file missing, skip top-up: {titles_path}", flush=True)
        return 0

    existing = set(list_names(base_url=base_url, key=key, bucket=bucket))
    candidates: List[Tuple[str, str]] = []
    seen: Set[str] = set(existing)
    for line in titles_path.read_text(encoding="utf-8").splitlines():
        title = line.strip()
        if not title:
            continue
        object_name = title_to_object_name(title)
        if not object_name or object_name in seen:
            continue
        ok, _reason = classify(object_name)
        if not ok:
            continue
        seen.add(object_name)
        candidates.append((title, object_name))

    to_fetch = candidates[: args.top_up]
    print(f"top_up_candidates={len(candidates)} fetching={len(to_fetch)}", flush=True)

    uploaded = 0
    skipped = 0
    failed = 0
    batch_size = 30
    for batch_start in range(0, len(to_fetch), batch_size):
        batch = to_fetch[batch_start : batch_start + batch_size]
        try:
            urls = fetch_image_urls_batch([t for t, _ in batch])
            time.sleep(1.5)
        except Exception as exc:  # noqa: BLE001
            print(f"FAIL batch-resolve: {exc}", flush=True)
            time.sleep(30)
            continue
        for title, object_name in batch:
            url = urls.get(title)
            if not url:
                skipped += 1
                continue
            try:
                content = http_bytes(url, headers={"User-Agent": USER_AGENT})
                if len(content) < 200 or content[:8] != b"\x89PNG\r\n\x1a\n":
                    skipped += 1
                    continue
                gray = to_grayscale_png(content)
                if args.dry_run:
                    print(f"[dry-run] upload {object_name} bytes={len(gray)}", flush=True)
                else:
                    upload_png(
                        base_url=base_url,
                        key=key,
                        bucket=bucket,
                        object_name=object_name,
                        content=gray,
                    )
                    uploaded += 1
                    if uploaded % 10 == 0:
                        print(f"uploaded={uploaded} last={object_name}", flush=True)
                time.sleep(1.2)
            except urllib.error.HTTPError as exc:
                failed += 1
                print(f"FAIL {title}: {exc}", flush=True)
                time.sleep(45 if exc.code == 429 else 2)
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print(f"FAIL {title}: {exc}", flush=True)
                time.sleep(2)

    final = list_names(base_url=base_url, key=key, bucket=bucket)
    print(
        f"done keep_before={len(keep)} uploaded={uploaded} skipped={skipped} "
        f"failed={failed} bucket_now={len(final)}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
