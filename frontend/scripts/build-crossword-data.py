"""Build crossword theme JSON from word-search wordlists + short clues.

Themes and word pools match `data/studio/wordlists/`. Clues prefer:
  1) existing curated crossword clues
  2) shortened open-dictionary definitions (cached)
  3) theme-aware fallback
"""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORDLISTS = ROOT / "src" / "data" / "studio" / "wordlists"
OUT = ROOT / "src" / "data" / "studio" / "crossword"
CACHE = ROOT / "scripts" / ".cache" / "open-dictionary"
WORD_RE = re.compile(r"^[A-Z]{3,12}$")
OPEN_DICT = "https://raw.githubusercontent.com/mhollingshead/open-dictionary/main/api"

THEMES: list[tuple[str, str]] = [
    ("animals", "Animals"),
    ("food", "Food"),
    ("nature", "Nature"),
    ("household", "Household"),
    ("body", "Body"),
    ("sports", "Sports"),
    ("travel", "Travel"),
    ("school", "School"),
    ("music", "Music"),
    ("space", "Space"),
]

THEME_FALLBACK: dict[str, str] = {
    "animals": "Creature from the animal world",
    "food": "Something to eat or cook",
    "nature": "Word from the natural world",
    "household": "Common household item or place",
    "body": "Part of the human body",
    "sports": "Word from sports or games",
    "travel": "Word about travel or places",
    "school": "Word from school or learning",
    "music": "Word about music or sound",
    "space": "Word about space or science",
}

PAREN_RE = re.compile(r"\([^)]*\)")
BRACKET_RE = re.compile(r"\[[^\]]*\]")
NON_ALPHA_RE = re.compile(r"[^A-Za-z\s\-']+")
WS_RE = re.compile(r"\s+")


def normalize_word(word: str) -> str:
    return word.upper().replace(" ", "").replace("-", "")


def clue_word_count(clue: str) -> int:
    return len(clue.split())


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def load_curated_clues() -> dict[str, str]:
    """Prefer previously curated crossword clues when regenerating."""
    clues: dict[str, str] = {}
    if not OUT.exists():
        return clues
    for path in sorted(OUT.glob("*-en.json")):
        raw = load_json(path)
        if not isinstance(raw, list):
            continue
        for entry in raw:
            if not isinstance(entry, dict):
                continue
            word = normalize_word(str(entry.get("word", "")))
            clue = " ".join(str(entry.get("clue", "")).split())
            if WORD_RE.match(word) and clue and word not in clues:
                clues[word] = clue
    return clues


def fetch_prefix_file(prefix: str) -> dict[str, object]:
    CACHE.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE / f"{prefix}.json"
    if cache_path.exists():
        return load_json(cache_path)  # type: ignore[return-value]

    letter = prefix[0]
    url = f"{OPEN_DICT}/{letter}/{prefix}.json"
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        data = {}
    cache_path.write_text(json.dumps(data), encoding="utf-8")
    time.sleep(0.05)
    return data if isinstance(data, dict) else {}


def first_sense(entry: object) -> str:
    if not isinstance(entry, dict):
        return ""
    etymologies = entry.get("etymologies")
    if not isinstance(etymologies, list):
        return ""
    for ety in etymologies:
        if not isinstance(ety, dict):
            continue
        parts = ety.get("partsOfSpeech")
        if not isinstance(parts, list):
            continue
        for part in parts:
            if not isinstance(part, dict):
                continue
            senses = part.get("senses")
            if not isinstance(senses, list):
                continue
            for sense in senses:
                if not isinstance(sense, dict):
                    continue
                text = str(sense.get("sense", "")).strip()
                if text:
                    return text
    return ""


def shorten_definition(raw: str, answer: str) -> str:
    text = PAREN_RE.sub(" ", raw)
    text = BRACKET_RE.sub(" ", text)
    text = text.replace(";", ".").replace(":", ".")
    text = text.split(".")[0]
    text = NON_ALPHA_RE.sub(" ", text)
    text = WS_RE.sub(" ", text).strip()
    words = [w for w in text.split(" ") if w]
    # Drop leading encyclopedia fluff.
    while words and words[0].lower() in {"a", "an", "the", "any", "one"}:
        words = words[1:]
    while len(words) > 8:
        words = words[:-1]
    if len(words) < 2:
        return ""
    clue = " ".join(words)
    clue = clue[0].upper() + clue[1:] if clue else ""
    if answer.upper() in clue.upper():
        return ""
    if clue_word_count(clue) < 2 or clue_word_count(clue) > 8:
        return ""
    return clue


def build_open_clues(words: set[str]) -> dict[str, str]:
    by_prefix: dict[str, list[str]] = {}
    for word in words:
        prefix = word[:2].lower()
        by_prefix.setdefault(prefix, []).append(word)

    clues: dict[str, str] = {}
    prefixes = sorted(by_prefix)
    print(f"Fetching open-dictionary for {len(prefixes)} prefixes…")
    for index, prefix in enumerate(prefixes, start=1):
        payload = fetch_prefix_file(prefix)
        for word in by_prefix[prefix]:
            entry = payload.get(word.lower())
            sense = first_sense(entry)
            clue = shorten_definition(sense, word) if sense else ""
            if clue:
                clues[word] = clue
        if index % 25 == 0 or index == len(prefixes):
            print(f"  {index}/{len(prefixes)} prefixes ({len(clues)} clues)")
    return clues


def sanitize_clue(clue: str, word: str, theme: str) -> str:
    clue = " ".join(clue.split())
    if clue and clue_word_count(clue) >= 2 and clue_word_count(clue) <= 8:
        if word.upper() not in clue.upper():
            return clue
    return THEME_FALLBACK[theme]


def build_theme_entries(
    words: list[str],
    theme: str,
    curated: dict[str, str],
    open_clues: dict[str, str],
) -> list[dict[str, str]]:
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for raw in words:
        word = normalize_word(raw)
        if not WORD_RE.match(word) or word in seen:
            continue
        clue = sanitize_clue(
            curated.get(word) or open_clues.get(word) or "",
            word,
            theme,
        )
        seen.add(word)
        out.append({"word": word, "clue": clue})
    out.sort(key=lambda e: e["word"])
    return out


def build_dictionary(themes: dict[str, list[dict[str, str]]]) -> list[dict[str, str]]:
    seen: set[str] = set()
    merged: list[dict[str, str]] = []
    for key, _label in THEMES:
        for entry in themes[key]:
            if entry["word"] in seen:
                continue
            # Skip pure theme fallbacks in the shared dictionary when a better
            # clue may appear later from another theme — keep first non-fallback.
            seen.add(entry["word"])
            merged.append(entry)
    merged.sort(key=lambda e: e["word"])
    return merged


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    curated = load_curated_clues()
    print(f"Loaded {len(curated)} curated clues")

    theme_words: dict[str, list[str]] = {}
    all_words: set[str] = set()
    for key, _label in THEMES:
        path = WORDLISTS / f"{key}-en.json"
        words = [normalize_word(w) for w in load_json(path)]  # type: ignore[union-attr]
        words = [w for w in words if WORD_RE.match(w)]
        theme_words[key] = words
        all_words.update(words)
        print(f"Theme {key}: {len(words)} words from wordlists")

    need_open = {w for w in all_words if w not in curated}
    open_clues = build_open_clues(need_open)

    sanitized: dict[str, list[dict[str, str]]] = {}
    for key, label in THEMES:
        entries = build_theme_entries(theme_words[key], key, curated, open_clues)
        if len(entries) < 500:
            raise ValueError(f"{key}: only {len(entries)} entries (need >= 500)")
        path = OUT / f"{key}-en.json"
        path.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
        sanitized[key] = entries
        real = sum(
            1
            for e in entries
            if e["clue"] != THEME_FALLBACK[key]
        )
        print(f"Wrote {path.name}: {len(entries)} entries ({real} non-fallback clues)")

    # Remove legacy theme no longer used.
    legacy = OUT / "everyday-en.json"
    if legacy.exists():
        legacy.unlink()
        print("Removed everyday-en.json")

    dictionary = build_dictionary(sanitized)
    dict_path = OUT / "dictionary-en.json"
    dict_path.write_text(json.dumps(dictionary, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {dict_path.name}: {len(dictionary)} entries")

    index = [
        {
            "key": key,
            "label": label,
            "locale": "en",
            "count": len(sanitized[key]),
        }
        for key, label in THEMES
    ]
    index_path = OUT / "index.json"
    index_path.write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {index_path.name}")
    print("\nFinal counts:")
    for item in index:
        print(f"  {item['key']}: {item['count']}")
    print(f"  dictionary: {len(dictionary)}")


if __name__ == "__main__":
    main()
