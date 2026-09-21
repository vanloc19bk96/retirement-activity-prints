"""Build the editor's cover-art image prompt.

The wording lives in ``app/data/prompts/cover-art/`` — this module only decides
which blocks apply to the fields the author enabled.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any, Mapping, Protocol

from app.services.prompt_data import (
    PROMPT_ROOT,
    load_config,
    load_template,
    render_template,
    section,
)

GAME = "cover-art"


class _TextField(Protocol):
    enabled: bool
    text: str
    position: str


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME, root=PROMPT_ROOT)


@lru_cache(maxsize=1)
def position_descriptions() -> Mapping[str, str]:
    return section(_config(), "positionDescriptions")


def _text_line(kind: str, field: _TextField) -> str | None:
    if not (field.enabled and field.text):
        return None
    return render_template(
        str(section(_config(), "textLines")[kind]),
        text=field.text,
        position=position_descriptions()[field.position],
    )


def _build_cover_text_section(
    title: _TextField,
    subtitle: _TextField,
    author: _TextField,
) -> str:
    lines = [
        line
        for line in (
            _text_line("title", title),
            _text_line("subtitle", subtitle),
            _text_line("author", author),
        )
        if line
    ]
    return "\n".join(lines)


def build_prompt(
    description: str,
    title: _TextField,
    subtitle: _TextField,
    author: _TextField,
) -> str:
    config = _config()
    cover_text_section = _build_cover_text_section(title, subtitle, author)
    text_rules = section(config, "textRules")

    if cover_text_section:
        typography_block = render_template(
            str(config["typographyBlock"]), cover_text_section=cover_text_section
        )
        text_rule = str(text_rules["withText"])
    else:
        typography_block = ""
        text_rule = str(text_rules["withoutText"])

    return (
        render_template(
            load_template(GAME, root=PROMPT_ROOT),
            description=description,
            typography_block=typography_block,
            text_rule=text_rule,
        )
        + "\n"
    )
