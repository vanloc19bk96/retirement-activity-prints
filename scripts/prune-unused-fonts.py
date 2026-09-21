"""Prune font files not referenced by the font catalog or index.css @font-face rules."""
from __future__ import annotations

import re
import sys
from pathlib import Path

SERIF_NO_SEMIBOLD = {"PT Serif", "Cardo"}
SERIF_NO_BOLD_ITALIC = {"Cardo"}
SANS_NO_ITALIC = {"Lexend", "Manrope", "Outfit", "Oswald"}
SANS_NO_SEMIBOLD = {"Lato", "PT Sans"}
MONO_NO_SEMIBOLD = {"Space Mono", "Courier Prime"}

BODY_SERIF = [
    "Lora", "Merriweather", "Playfair Display", "Cormorant Garamond", "EB Garamond",
    "Crimson Text", "Crimson Pro", "Alegreya", "Source Serif 4", "PT Serif", "Vollkorn",
    "Bitter", "Noto Serif", "Literata", "Cardo", "Spectral", "Gelasio", "Rokkitt",
    "Besley", "Fraunces", "Newsreader",
]
BODY_SANS = [
    "Inter", "Open Sans", "Roboto", "Poppins", "Raleway", "Lexend", "Lato", "Montserrat",
    "Nunito", "Nunito Sans", "Work Sans", "Rubik", "Mulish", "Karla", "Source Sans 3",
    "Josefin Sans", "PT Sans", "Manrope", "Plus Jakarta Sans", "Hanken Grotesk", "Outfit", "Oswald",
]
MONO = ["Roboto Mono", "JetBrains Mono", "Space Mono", "Courier Prime"]
DISPLAY = [
    "Abril Fatface", "Anton", "Bebas Neue", "Lobster", "Lobster Two", "Pacifico", "Righteous",
    "Cinzel", "Cinzel Decorative", "Yeseva One", "Cormorant", "Alfa Slab One", "Archivo Black",
    "Bangers", "Creepster", "Chewy", "Bungee", "Galindo", "Pattaya", "Oi", "Ewert", "Henny Penny",
    "Mountains of Christmas", "Freckle Face", "Finger Paint", "DotGothic16", "Aoboshi One",
]
TRACING_PATHS = [
    "/fonts/TraceyDot.ttf",
    "/fonts/TraceySolid.ttf",
    "/fonts/Edu AU VIC WA NT Hand.ttf",
    "/fonts/Edu AU VIC WA NT Hand Dots.ttf",
    "/fonts/Playwrite US Modern.ttf",
    "/fonts/Playwrite US Modern Guides.ttf",
    "/fonts/Raleway Dots.ttf",
    "/fonts/Londrina Outline.ttf",
]


def variant_paths(
    name: str,
    *,
    include_semi_bold: bool = True,
    include_italic: bool = True,
    include_bold_italic: bool | None = None,
) -> list[str]:
    if include_bold_italic is None:
        include_bold_italic = include_italic

    paths = [f"/fonts/{name}.ttf", f"/fonts/{name} Bold.ttf"]
    if include_semi_bold:
        paths.append(f"/fonts/{name} SemiBold.ttf")
    if include_italic:
        paths.append(f"/fonts/{name} Italic.ttf")
    if include_bold_italic:
        paths.append(f"/fonts/{name} Bold Italic.ttf")
    return paths


def build_catalog_paths() -> set[str]:
    required: set[str] = set()

    for name in BODY_SERIF:
        required.update(
            variant_paths(
                name,
                include_semi_bold=name not in SERIF_NO_SEMIBOLD,
                include_bold_italic=name not in SERIF_NO_BOLD_ITALIC,
            )
        )

    for name in BODY_SANS:
        no_italic = name in SANS_NO_ITALIC
        required.update(
            variant_paths(
                name,
                include_semi_bold=name not in SANS_NO_SEMIBOLD,
                include_italic=not no_italic,
                include_bold_italic=not no_italic,
            )
        )

    for name in MONO:
        required.update(variant_paths(name, include_semi_bold=name not in MONO_NO_SEMIBOLD))

    for name in DISPLAY:
        required.add(f"/fonts/{name}.ttf")
        if name == "Mountains of Christmas":
            required.add(f"/fonts/{name} Bold.ttf")

    required.update(TRACING_PATHS)
    return required


def collect_index_css_paths(frontend_root: Path) -> set[str]:
    css = (frontend_root / "src" / "index.css").read_text(encoding="utf-8")
    return {f"/fonts/{match}" for match in re.findall(r"url\(['\"]?/fonts/([^'\"]+)['\"]?\)", css)}


def prune(frontend_root: Path, delete: bool) -> list[str]:
    fonts_dir = frontend_root / "public" / "fonts"
    required_names = {Path(p).name for p in build_catalog_paths()}
    required_names.update(Path(p).name for p in collect_index_css_paths(frontend_root))
    required_names.add(".gitkeep")

    disk_files = [p.name for p in fonts_dir.iterdir() if p.is_file()]
    to_delete = sorted(name for name in disk_files if name not in required_names)

    print(f"Project: {frontend_root.name}")
    print(f"Required: {len(required_names) - 1} font files (+ .gitkeep)")
    print(f"On disk: {len(disk_files)}")
    print(f"To delete: {len(to_delete)}")

    if delete:
        for name in to_delete:
            (fonts_dir / name).unlink()
            print(f"  Deleted: {name}")
    else:
        for name in to_delete:
            print(f"  - {name}")

    return to_delete


def main() -> None:
    delete = "--delete" in sys.argv
    roots = [Path(__file__).resolve().parents[1] / "frontend"]

    for root in roots:
        if not root.exists():
            print(f"Skip missing: {root}")
            continue
        prune(root, delete)
        print()


if __name__ == "__main__":
    main()
