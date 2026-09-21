"""Generate reflective writing prompts via Gemini with safety validation.

Shared by life-timeline (mode=life-story) and memory-journal-prompt (mode=journal).

The journal theme is never looked up in a table: whatever the author picked or
typed is interpolated into the prompt, so presets and custom themes take one
path. Prompt wording, stage hints, limits and the blocklist are data, not code —
see ``app/data/studio/life-timeline/`` and ``app/data/studio/shared/``.
"""

from __future__ import annotations

import logging
import re
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_life_timeline import (
    LifeTimelineModelOutput,
    LifeTimelineRequest,
    LifeTimelineResponse,
)
from app.services.studio_gemini import (
    RateLimiter,
    StudioGenerationError,
    StudioRateLimitError,
    call_gemini_json,
    parse_json_object,
)
from app.services.prompt_data import (
    bullet_lines,
    float_value,
    int_value,
    load_config,
    load_template,
    locale_line,
    prefix_pattern,
    render_template,
    section,
    string_list,
    word_pattern,
)
from app.services.studio_variety import (
    VarietyScope,
    bucket_key,
    remember,
    with_variety,
)

logger = logging.getLogger(__name__)

GAME = "life-timeline"

_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


@lru_cache(maxsize=1)
def _shared_safety() -> Mapping[str, Any]:
    return load_config("shared", "reflective-safety")


@lru_cache(maxsize=1)
def _blocked_pattern() -> re.Pattern[str]:
    return word_pattern(string_list(_shared_safety(), "blockedTerms"))


@lru_cache(maxsize=1)
def _yes_no_pattern() -> re.Pattern[str]:
    return prefix_pattern(string_list(_shared_safety(), "yesNoOpeners"))


def _yes_no_openers_text() -> str:
    return "/".join(string_list(_shared_safety(), "yesNoOpeners"))


_rate_limiter = RateLimiter(
    label="life-timeline",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class LifeTimelineRateLimitError(StudioRateLimitError):
    """User exceeded the short-window life-prompt generation quota."""


class LifeTimelineGenerationError(StudioGenerationError):
    """Model output could not be turned into a valid prompt set."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise LifeTimelineRateLimitError(str(exc)) from exc


def _is_yes_no(prompt: str) -> bool:
    return bool(_yes_no_pattern().match(prompt.strip()))


def _normalize_key(prompt: str) -> str:
    """Lowercase + strip punctuation so near-duplicates collapse."""
    return " ".join(_PUNCT.sub("", prompt.casefold()).split())


def _max_len_for(mode: str) -> int:
    key = "journalMaxLen" if mode == "journal" else "lifeMaxLen"
    return int_value(_limits(), key)


def _validate(prompts: list[str], *, max_len: int | None = None) -> list[str]:
    limit = max_len if max_len is not None else _max_len_for("life-story")
    clean: list[str] = []
    seen: set[str] = set()
    for raw in prompts:
        prompt = str(raw).strip()
        if not prompt or len(prompt) > limit:
            continue
        if _blocked_pattern().search(prompt):
            continue
        if _is_yes_no(prompt):
            continue
        if not prompt.endswith("?"):
            continue
        key = _normalize_key(prompt)
        if not key or key in seen:
            continue
        seen.add(key)
        clean.append(prompt)
    return clean


def _parse_prompts_json(raw: str) -> list[str]:
    prompts = parse_json_object(raw).get("prompts")
    if not isinstance(prompts, list):
        raise ValueError("missing prompts")
    return [str(p) for p in prompts]


def _locale_line(locale: str) -> str:
    return locale_line(section(_config(), "locale"), locale)


def _avoid_topics(mode_cfg: Mapping[str, Any]) -> str:
    openers = _yes_no_openers_text()
    return bullet_lines(
        topic.format(yes_no_openers=openers)
        for topic in string_list(mode_cfg, "avoidTopics")
    )


def _stage_anchors(mode_cfg: Mapping[str, Any], stage: str) -> str:
    """Phrases that place a prompt in this stage without parroting the heading.

    A prompt with no anchor drifts: "What did the main room smell like in the
    morning?" answers just as well for childhood as for the working years.
    """
    anchors_cfg = section(mode_cfg, "stageAnchors")
    anchors = (
        string_list(anchors_cfg, stage)
        if stage in anchors_cfg
        else tuple(
            phrase.format(stage=stage)
            for phrase in string_list(mode_cfg, "customStageAnchors")
        )
    )
    return ", ".join(f'"{anchor}"' for anchor in anchors)


def _build_life_story_prompt(req: LifeTimelineRequest, needed: int) -> str:
    mode_cfg = section(_config(), "lifeStory")
    hints = section(mode_cfg, "stageHints")
    stage_hint = hints.get(req.stage) or str(mode_cfg["customStageHint"]).format(
        stage=req.stage
    )
    stage_lens = section(mode_cfg, "stageLenses").get(req.stage) or str(
        mode_cfg["customStageLens"]
    ).format(stage=req.stage)
    # The request carries the config key ("youngAdult"); the model must be given
    # words it can write about. A custom stage is already the author's own words.
    stage_label = section(mode_cfg, "stageLabels").get(req.stage, req.stage)
    return render_template(
        load_template(GAME, "life-story"),
        needed=needed,
        stage=stage_label,
        seed=req.seed,
        tone=section(_config(), "tones")[req.tone],
        stage_hint=stage_hint,
        stage_lens=stage_lens,
        stage_anchors=_stage_anchors(mode_cfg, req.stage),
        max_len=_max_len_for("life-story"),
        locale_line=_locale_line(req.locale),
        avoid_topics=_avoid_topics(mode_cfg),
    )


def _build_journal_prompt(req: LifeTimelineRequest, needed: int) -> str:
    mode_cfg = section(_config(), "journal")
    # `stage` carries the journal theme: the author's own words, or empty for
    # "a bit of everything". No table lookup — a new preset is a frontend edit.
    theme = req.stage.strip()
    theme_hint = (
        str(mode_cfg["themeHint"]).format(theme=theme)
        if theme
        else str(mode_cfg["openThemeHint"])
    )
    time_frames = section(mode_cfg, "timeFrames")
    time_frame = req.time_frame or str(mode_cfg["defaultTimeFrame"])
    return render_template(
        load_template(GAME, "journal"),
        needed=needed,
        seed=req.seed,
        tone=section(_config(), "tones")[req.tone],
        theme_hint=theme_hint,
        time_line=time_frames[time_frame],
        max_len=_max_len_for("journal"),
        locale_line=_locale_line(req.locale),
        avoid_topics=_avoid_topics(mode_cfg),
    )


def _build_prompt(req: LifeTimelineRequest, needed: int) -> str:
    if req.mode == "journal":
        return _build_journal_prompt(req, needed)
    return _build_life_story_prompt(req, needed)


async def _call_gemini(prompt: str, *, max_output_tokens: int) -> str:
    """Seam for tests; keeps the shared client call in one place."""
    return await call_gemini_json(
        prompt=prompt,
        temperature=float_value(_limits(), "temperature"),
        max_output_tokens=max_output_tokens,
        response_schema=LifeTimelineModelOutput,
        label="life_timeline",
    )


def _scope(req: LifeTimelineRequest, user_id: str) -> VarietyScope:
    """Mode + stage/theme decide which memories the model asks about."""
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.mode, req.stage, req.time_frame or "", req.tone),
        seed=req.seed,
    )


async def _generate_batch(
    req: LifeTimelineRequest, needed: int, seed: int, scope: VarietyScope
) -> list[str]:
    # Ask for extras — validation drops yes/no, blocked, and near-duplicate lines.
    limits = _limits()
    ask_for = min(
        int_value(limits, "aiBatchSize"),
        max(
            needed * int_value(limits, "overRequestMultiplier"),
            needed + int_value(limits, "overRequestExtra"),
        ),
    )
    prompt = with_variety(
        _build_prompt(req, ask_for), scope.at_seed(seed), client_avoid=req.avoid
    )
    max_tokens = min(
        int_value(limits, "maxOutputTokens"),
        max(
            int_value(limits, "minOutputTokens"),
            ask_for * int_value(limits, "tokensPerPrompt"),
        ),
    )
    raw = await _call_gemini(prompt, max_output_tokens=max_tokens)
    parsed = _parse_prompts_json(raw)
    return _validate(parsed, max_len=_max_len_for(req.mode))


def _merge_unique(kept: list[str], incoming: list[str], limit: int) -> list[str]:
    seen = {_normalize_key(p) for p in kept}
    for prompt in incoming:
        key = _normalize_key(prompt)
        if key in seen:
            continue
        kept.append(prompt)
        seen.add(key)
        if len(kept) >= limit:
            break
    return kept


async def generate_life_prompts(
    req: LifeTimelineRequest, user_id: str
) -> LifeTimelineResponse:
    _check_rate_limit(user_id)
    scope = _scope(req, user_id)
    started = time.perf_counter()
    raw_count = 0
    kept: list[str] = []
    batch_seed = req.seed
    # No curated top-up in either mode — retry so the page count comes out exact.
    max_idle_batches = int_value(_limits(), "maxIdleBatches")
    batch_size = int_value(_limits(), "aiBatchSize")

    try:
        while len(kept) < req.prompt_count:
            needed = min(batch_size, req.prompt_count - len(kept))
            batch = await _generate_batch(req, needed, batch_seed, scope)
            raw_count += len(batch)
            before = len(kept)
            kept = _merge_unique(kept, batch, req.prompt_count)
            batch_seed += 1
            if len(kept) == before and batch_seed - req.seed > max_idle_batches:
                break
    except LifeTimelineGenerationError:
        raise
    except Exception as exc:
        logger.warning(
            "studio_life_timeline_generation_failed",
            extra={
                "user_id": user_id,
                "model": settings.STUDIO_GEMINI_MODEL,
                "error": str(exc),
                "mode": req.mode,
            },
        )
        kept = []

    if not kept:
        raise LifeTimelineGenerationError(
            "Model did not return valid life-timeline prompts"
        )
    if len(kept) < req.prompt_count:
        raise LifeTimelineGenerationError(
            f"Model returned {len(kept)} prompts; needed {req.prompt_count}"
        )

    kept = kept[: req.prompt_count]
    drop_rate = 0.0
    if raw_count > 0:
        drop_rate = max(0.0, 1.0 - (len(kept) / raw_count))

    remember(scope, kept)

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "studio_life_timeline_generated",
        extra={
            "user_id": user_id,
            "model": settings.STUDIO_GEMINI_MODEL,
            "latency_ms": elapsed_ms,
            "mode": req.mode,
            "stage": req.stage,
            "prompt_count": len(kept),
            "validation_drop_rate": round(drop_rate, 3),
        },
    )

    return LifeTimelineResponse(stage=req.stage, prompts=kept)


# Test helpers (pure, no network)
def validate_prompts_for_tests(
    prompts: list[Any], *, mode: str = "life-story"
) -> list[str]:
    return _validate([str(p) for p in prompts], max_len=_max_len_for(mode))


def parse_prompts_json_for_tests(raw: str) -> list[str]:
    return _parse_prompts_json(raw)


def build_prompt_for_tests(req: LifeTimelineRequest) -> str:
    return _build_prompt(req, req.prompt_count)


def is_yes_no_for_tests(prompt: str) -> bool:
    return _is_yes_no(prompt)


def normalize_key_for_tests(prompt: str) -> str:
    return _normalize_key(prompt)
