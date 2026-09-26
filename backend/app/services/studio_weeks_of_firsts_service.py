"""Generate 52 Weeks of Firsts: Retirement Edition ideas via Gemini.

A year of small firsts for a retirement activity book: fifty-two numbered
weeks, each with one new thing to try -- "Cook a Thai green curry from
scratch", "Learn to recognise one bird by its song" -- a line for the date the
reader tried it, and room for a few notes. The weeks are numbered, not dated,
so the reader can start in any week of the year.

Everything here is printed and sold on KDP, so an idea only survives whole:

* **One concrete first.** The Bucket List's idea gates (one verb-led action,
  no "or", no second clause, nothing vague, sensitive, branded or assuming a
  spouse, grandchildren or a house), with a roomier line: a weekly prompt may
  run to twelve words. Once the "never tried before" padding every first
  carries is set aside (``fillerWords``), something concrete must be left --
  "Visit a place you've never been" is not a plan.
* **Undated and unpressured.** Nothing tied to a season, holiday or date
  (``seasonalTerms``) -- week 1 may fall in any month -- and nothing that
  sounds like an order or a test (``pressureTerms``).
* **No repeats in meaning.** The Bucket List's meaning-level comparison
  (content words, synonyms folded, the model's own ``concept`` name), with the
  filler words dropped so two firsts do not look alike merely for both being
  "never tried". Checked within the reply, against what the client says the
  book already prints, and against this worker's memory -- all bounded, never
  a comparison with every year ever made.

Variety is structural. The year is spread over eighteen areas -- food at home
and out, local exploring, nature, growing, making, pictures, words, music,
learning, people, kindness, culture, rest, games, gentle movement, small
adventures, home projects -- every area always present, two to four weeks
each (the seller's mix weights four areas up), so a year cannot be twenty
travel ideas. Every idea gets its own brief -- one of its area's facets plus
a flavour (free, at home, with a friend, on foot or by bus...) -- shuffled by
seed, so two sellers on the same settings get different years. Areas are
written in batches that run concurrently; each batch is told which areas the
rest of the year owns. The client picks the printed fifty-two from the pool,
caps the bigger outings (``stretchTerms``) and spaces the areas through the
year.
"""

from __future__ import annotations

import asyncio
import logging
import math
import random
import re
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, Iterable, List, Mapping, Sequence, Tuple

from app.core.config import settings
from app.schemas.studio_weeks_of_firsts import (
    WeeksOfFirstsArea,
    WeeksOfFirstsItem,
    WeeksOfFirstsModelOutput,
    WeeksOfFirstsRequest,
    WeeksOfFirstsResponse,
)
from app.services.prompt_data import (
    int_value,
    load_config,
    locale_line,
    section,
    string_list,
    word_pattern,
)
from app.services.studio_bucket_list_service import (
    IdeaKey,
    content_tokens,
    keys_repeat,
    normalize_concept,
    normalize_idea,
)
from app.services.studio_gemini import (
    RateLimiter,
    StudioGenerationError,
    StudioRateLimitError,
    call_gemini_json,
    parse_json_object,
)
from app.services.studio_variety import (
    VarietyScope,
    bucket_key,
    recent,
    remember,
    with_variety,
)

logger = logging.getLogger(__name__)

GAME = "weeks-of-firsts"
FINAL_ERROR = "Could not write a clear year of firsts this time. Please try again."
# Remembered ideas a new one is checked against. Bounded, so the check stays a
# few tens of thousands of set comparisons however long a seller keeps going.
MEMORY_FILTER_LIMIT = 240
# Ideas named in a retry prompt as already written. Enough to cover the year.
RETRY_AVOID_LIMIT = 120


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


def _limit(key: str) -> int:
    return int_value(_limits(), key)


@lru_cache(maxsize=1)
def _seasonal_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "seasonalTerms"))


@lru_cache(maxsize=1)
def _pressure_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "pressureTerms"))


@lru_cache(maxsize=1)
def _stretch_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "stretchTerms"))


@lru_cache(maxsize=1)
def _filler_tokens() -> frozenset[str]:
    """The "never tried before" padding, folded the same way as an idea's own words."""
    out: set[str] = set()
    for word in string_list(_config(), "fillerWords"):
        out |= content_tokens(word)
        out.add(word.lower())
    return frozenset(out)


_rate_limiter = RateLimiter(
    label="52 Weeks of Firsts",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class WeeksOfFirstsRateLimitError(StudioRateLimitError):
    """User exceeded the short-window 52 Weeks of Firsts quota."""


class WeeksOfFirstsGenerationError(StudioGenerationError):
    """Model output could not be turned into a usable year."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise WeeksOfFirstsRateLimitError(str(exc)) from exc


def _scope(req: WeeksOfFirstsRequest, user_id: str, seed: int) -> VarietyScope:
    """One memory per mix: that is what decides which ideas risk repeating."""
    return VarietyScope(game=GAME, user_id=user_id, bucket=bucket_key(req.focus), seed=seed)


def _budget(req: WeeksOfFirstsRequest) -> int:
    return min(_limit("maxIdeaChars"), req.max_idea_chars)


# ---------------------------------------------------------------- areas


@dataclass(frozen=True)
class Area:
    key: str
    label: str
    group: str
    facets: Tuple[str, ...]


@dataclass(frozen=True)
class AreaPlan:
    """One area of the year: how many weeks it prints, and how many ideas to write."""

    area: Area
    target: int
    ask: int


@lru_cache(maxsize=1)
def areas() -> Tuple[Area, ...]:
    out: List[Area] = []
    for key, raw in section(_config(), "areas").items():
        out.append(
            Area(
                key=str(key),
                label=str(raw["label"]),
                group=str(raw["group"]),
                facets=tuple(str(f) for f in raw["facets"]),
            )
        )
    return tuple(out)


@lru_cache(maxsize=1)
def _area_index() -> Mapping[str, Area]:
    return {area.key: area for area in areas()}


def boosted(focus: str) -> Tuple[str, ...]:
    keys = _area_index()
    return tuple(k for k in string_list(section(section(_config(), "focuses"), focus), "boost") if k in keys)


def spares_for(target: int) -> int:
    """Extra ideas written per area, for the gates on both sides to spend."""
    return max(1, math.ceil(target * 0.5))


def plan_targets(focus: str, seed: int) -> Dict[str, int]:
    """Weeks per area, summing to the year.

    Every area starts at the minimum, the mix's areas rise to the boost, and
    the rest of the year is spread one week at a time over the other areas in
    seed order -- to the base first, and only past it (never past the maximum)
    if the year still needs more.
    """
    rng = random.Random(seed)
    keys = [area.key for area in areas()]
    boost = boosted(focus)
    targets = {key: _limit("areaMin") for key in keys}
    for key in boost:
        targets[key] = _limit("areaBoost")
    others = [key for key in keys if key not in boost]
    rng.shuffle(others)
    remaining = _limit("weeks") - sum(targets.values())
    for ceiling in (_limit("areaBase"), _limit("areaMax")):
        progressed = True
        while remaining > 0 and progressed:
            progressed = False
            for key in others if ceiling == _limit("areaBase") else keys:
                if remaining > 0 and targets[key] < ceiling:
                    targets[key] += 1
                    remaining -= 1
                    progressed = True
    return targets


def plan_areas(req: WeeksOfFirstsRequest) -> List[AreaPlan]:
    """The areas this call writes, and how many ideas each.

    A top-up names its own areas; otherwise every area, in seed order so the
    batches mix differently each time.
    """
    index = _area_index()
    if req.areas:
        plans: List[AreaPlan] = []
        seen: set[str] = set()
        for ask in req.areas:
            area = index.get(ask.key)
            if area is None or area.key in seen:
                continue
            seen.add(area.key)
            plans.append(AreaPlan(area, ask.count, ask.count + spares_for(ask.count)))
        return plans

    targets = plan_targets(req.focus, req.seed)
    order = list(areas())
    random.Random(req.seed * 3 + 1).shuffle(order)
    return [
        AreaPlan(area, targets[area.key], targets[area.key] + spares_for(targets[area.key]))
        for area in order
    ]


# ---------------------------------------------------------------- gates


def first_key(text: str, concept: str = "") -> IdeaKey:
    """An idea's meaning key with the "never tried before" padding set aside."""
    key = IdeaKey.of(text, concept)
    filler = _filler_tokens()
    return IdeaKey(text=key.text, tokens=key.tokens - filler, concept=key.concept - filler)


def firsts_repeat(first: str, second: str) -> bool:
    return keys_repeat(first_key(first), first_key(second))


def is_stretch(text: str) -> bool:
    """A bigger outing -- far, strenuous or costly. Allowed, but only a few a year."""
    return bool(_stretch_re().search(text))


def normalize_first(raw: Any, *, budget: int) -> str | None:
    """One weekly idea as printed -- "Cook a Thai green curry from scratch" -- or None.

    The Bucket List's idea gates with a roomier line, then this game's own:
    at least three words, nothing seasonal or calendar-bound, no pressure, and
    something concrete left once the "never tried" padding is gone.
    """
    text = normalize_idea(raw, budget=budget, max_words=_limit("maxIdeaWords"))
    if text is None:
        return None
    if len(text.split()) < _limit("minIdeaWords") or len(text) < _limit("minIdeaChars"):
        return None
    if _seasonal_re().search(text) or _pressure_re().search(text):
        return None
    if not first_key(text).tokens:
        return None
    return text


def normalize_item(raw: Any, *, budget: int) -> WeeksOfFirstsItem | None:
    """One complete idea -- or None. Never a repaired one."""
    if not isinstance(raw, dict):
        return None
    idea = normalize_first(raw.get("idea"), budget=budget)
    if idea is None:
        return None
    # Straight from the model, an idea carries the experience it names; one it
    # could not name is usually a slogan.
    if "concept" in raw and not normalize_concept(raw.get("concept")):
        return None
    return WeeksOfFirstsItem(idea=idea, concept=normalize_concept(raw.get("concept")))


# ---------------------------------------------------------------- prompt


Batch = List[Tuple[AreaPlan, int]]


def batches(asks: Sequence[Tuple[AreaPlan, int]]) -> List[Batch]:
    """Whole areas per call, about thirty ideas to a call, so calls can run side by side."""
    limit = _limit("batchItems")
    out: List[Batch] = []
    current: Batch = []
    size = 0
    for plan, want in asks:
        if current and size + want > limit:
            out.append(current)
            current, size = [], 0
        current.append((plan, want))
        size += want
    if current:
        out.append(current)
    return out


def briefs(batch: Batch, seed: int) -> Tuple[List[str], Dict[int, str]]:
    """One brief per idea -- area, facet, flavour -- and which area each number belongs to.

    Facets are shuffled per area and flavours across the batch, both by seed,
    so the same facet meets a different flavour next time.
    """
    rng = random.Random(seed)
    flavours = list(string_list(_config(), "flavours"))
    rng.shuffle(flavours)
    lines: List[str] = []
    owners: Dict[int, str] = {}
    number = 0
    for plan, want in batch:
        facets = list(plan.area.facets)
        rng.shuffle(facets)
        for index in range(want):
            flavour = flavours[number % len(flavours)]
            number += 1
            owners[number] = plan.area.key
            lines.append(
                f"{number}. [{plan.area.label}] {facets[index % len(facets)]} -- flavour: {flavour}"
            )
    return lines, owners


def _build_prompt(
    batch: Batch,
    *,
    seed: int,
    others: Sequence[str],
    budget: int,
    locale: str,
) -> str:
    lines, _ = briefs(batch, seed)
    want = len(lines)
    covered = ", ".join(f'"{plan.area.label}"' for plan, _ in batch)
    other_line = (
        "Other areas in the same year (leave their ground to them): "
        + ", ".join(f'"{label}"' for label in others)
        + "."
        if others
        else ""
    )
    brief_block = "\n".join(lines)
    min_words = _limit("minIdeaWords")
    max_words = _limit("maxIdeaWords")
    language = locale_line(section(_config(), "locale"), locale)

    return f"""Write weekly ideas for "52 Weeks of Firsts", a large-print activity book for
retirees. Each week the reader tries one new thing, writes down the date and
jots a few notes about how it went. The weeks are numbered, not dated: the
reader may start in any week of the year and go at their own pace. It should
feel curious, warm and inviting -- "here is something you could try" -- never
a test, a to-do list or something they must do.

This part of the year covers: {covered}.
{other_line}

Write exactly {want} ideas, one per brief, in this order. Each brief names its
area, a facet to build the idea from, and a flavour -- a gentle nudge on cost,
place or company; set the flavour aside if it clashes with the facet.
{brief_block}

How to build each idea -- in this order:
1. "concept": the underlying experience in 2 to 4 plain words, specific enough
   that two different ideas never share it ("thai green curry", "birdsong by
   ear", "clay pinch pot"; never just "cooking", "nature", "art").
2. "idea": that experience as one short, concrete invitation to try something
   for the first time, starting with a verb.

Strong ideas are concrete -- the reader knows exactly what to do that week:
- "Cook a Thai green curry from scratch"
- "Learn to recognise one bird by its song"
- "Shape a small pinch pot from air-dry clay"
- "Ride a bus route to the very end of the line"
- "Invite a neighbour you barely know round for tea"
- "Try a cuisine you've never tasted at a local cafe"
Weak ideas -- never write these kinds:
- Vague: "Try something different in the kitchen", "Go somewhere new", "Learn a new skill"
- Two ideas in one: "Bake bread and share it with a neighbour", "Visit a gallery or a museum"
- The same idea in other words: "Take a painting class" beside "Try painting for the first time"
- Orders or pressure: "Finally face your fears", "Challenge yourself to run a mile"
- Tied to a season, holiday or date: "Build a snowman", "Watch the fireworks on New Year's Eve"

Each idea:
- Starts with a verb and is one single experience that fits comfortably into
  one week: a day, an outing or a sitting. No "or", no "and then", no list, no
  second sentence.
- {min_words} to {max_words} words and at most {budget} characters. Six to ten words is ideal.
- Everyday words anyone understands; no specialist skill, kit or membership needed.
- Genuinely different from every other idea, not just worded differently. Vary
  the opening verb: never start more than two ideas with the same verb.
- Realistic for many retirees: mostly free or low-cost, at home or nearby, and
  gentle on the body. A bigger outing is welcome now and then, but keep it easy
  and sensible.
- Works for everyone: do not assume the reader has a partner, children or
  grandchildren, owns a house or garden, drives, has a big budget, is very
  athletic, or lives in any particular country or culture. Prefer "a friend",
  "a neighbour", "a pot on a windowsill", "by bus or train".
- Never tied to a season, month, holiday or date: any week may fall at any time of year.
- Original wording -- not a known quote, slogan, song line, title, or a line
  from a published list, journal or challenge.
- No full stop, numbering or quotation marks.

Never:
- Health, illness, ageing bodies, memory lapses, loneliness, money worries,
  death, or anything suggesting time is running out.
- Jokes about age, or anything that talks down to older adults or suggests
  they are bored.
- Dangerous stunts, extreme sports, anything illegal or reckless.
- Politics, religion, alcohol, gambling, brand names, celebrities, famous
  events or trademarks.
{language}

Return JSON only:
{{ "items": [ {{ "brief": 1, "concept": "thai green curry", "idea": "Cook a Thai green curry from scratch" }} ] }}
"""


def _parse_payload(raw: str) -> List[Any]:
    data = parse_json_object(raw)
    items = data.get("items", data.get("ideas"))
    if not isinstance(items, list) or not items:
        raise ValueError("invalid JSON: missing items")
    return items


def _brief_number(raw: Any) -> int | None:
    try:
        return int(str(raw).strip().rstrip("."))
    except (TypeError, ValueError):
        return None


async def _call_gemini(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        temperature=0.95,
        max_output_tokens=_limit("maxOutputTokens"),
        response_schema=WeeksOfFirstsModelOutput,
        label="weeks_of_firsts",
    )


# ---------------------------------------------------------------- generate


def _asks(plans: Sequence[AreaPlan], kept: Mapping[str, List[WeeksOfFirstsItem]], attempt: int) -> Batch:
    """How many ideas to write per area this round: all of them, then only what is short."""
    asks: List[Tuple[AreaPlan, int]] = []
    for plan in plans:
        have = len(kept[plan.area.key])
        if have >= plan.target:
            continue
        if attempt == 0:
            asks.append((plan, plan.ask - have))
        else:
            short = plan.target - have
            asks.append((plan, short + spares_for(short)))
    return asks


def _accept(
    items_raw: Iterable[Any],
    owners: Mapping[int, str],
    *,
    plans: Mapping[str, AreaPlan],
    kept: Dict[str, List[WeeksOfFirstsItem]],
    accepted: List[IdeaKey],
    printed: Sequence[IdeaKey],
    budget: int,
) -> None:
    """File each valid, fresh idea under the area its brief belongs to."""
    for raw in items_raw:
        if not isinstance(raw, dict):
            continue
        owner = owners.get(_brief_number(raw.get("brief")) or 0)
        if owner is None or len(kept[owner]) >= plans[owner].ask:
            continue
        item = normalize_item(raw, budget=budget)
        if item is None:
            continue
        key = first_key(item.idea, item.concept)
        if any(keys_repeat(key, other) for other in accepted):
            continue
        if any(keys_repeat(key, other) for other in printed):
            continue
        kept[owner].append(item)
        accepted.append(key)


async def generate_weeks_of_firsts(
    req: WeeksOfFirstsRequest, user_id: str
) -> WeeksOfFirstsResponse:
    _check_rate_limit(user_id)

    plans = plan_areas(req)
    if not plans:
        raise WeeksOfFirstsGenerationError(FINAL_ERROR)
    by_key = {plan.area.key: plan for plan in plans}
    budget = _budget(req)
    started = time.perf_counter()
    home = _scope(req, user_id, req.seed)
    # What this seller printed before: the client's list (spans workers and
    # restarts) plus this worker's own memory. An idea that repeats either is
    # dropped here, not just discouraged in the prompt.
    printed = [first_key(label) for label in [*req.avoid, *recent(home, MEMORY_FILTER_LIMIT)]]
    kept: Dict[str, List[WeeksOfFirstsItem]] = {plan.area.key: [] for plan in plans}
    accepted: List[IdeaKey] = []
    labels = [plan.area.label for plan in plans]
    calls = 0

    for attempt in range(_limit("maxAttempts")):
        asks = _asks(plans, kept, attempt)
        if not asks:
            break
        written = [item.idea for items in kept.values() for item in items]
        avoid = [*written, *req.avoid]
        jobs: List[Tuple[Dict[int, str], str]] = []
        for index, batch in enumerate(batches(asks)):
            seed = req.seed + attempt * 97 + index * 13
            own = {plan.area.label for plan, _ in batch}
            prompt = _build_prompt(
                batch,
                seed=seed,
                others=[label for label in labels if label not in own],
                budget=budget,
                locale=req.locale,
            )
            prompt = with_variety(
                prompt,
                home.at_seed(seed),
                client_avoid=avoid,
                limit=RETRY_AVOID_LIMIT if written else None,
            )
            jobs.append((briefs(batch, seed)[1], prompt))

        calls += len(jobs)
        replies = await asyncio.gather(
            *(_call_gemini(prompt) for _, prompt in jobs), return_exceptions=True
        )
        for (owners, _), reply in zip(jobs, replies):
            if isinstance(reply, asyncio.CancelledError):
                raise reply
            if isinstance(reply, BaseException):
                logger.warning(
                    "studio_weeks_of_firsts_batch_failed attempt=%s error=%s", attempt + 1, reply
                )
                continue
            try:
                items_raw = _parse_payload(reply)
            except ValueError as exc:
                logger.warning(
                    "studio_weeks_of_firsts_batch_invalid attempt=%s error=%s", attempt + 1, exc
                )
                continue
            _accept(
                items_raw,
                owners,
                plans=by_key,
                kept=kept,
                accepted=accepted,
                printed=printed,
                budget=budget,
            )

    if not accepted:
        raise WeeksOfFirstsGenerationError(FINAL_ERROR)

    remember(home, (item.idea for items in kept.values() for item in items))
    logger.info(
        "studio_weeks_of_firsts_generated model=%s latency_ms=%s ideas=%s wanted=%s areas=%s calls=%s focus=%s",
        settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        len(accepted),
        sum(plan.target for plan in plans),
        len(plans),
        calls,
        req.focus,
    )
    # Every planned area comes back, empty or not, so the client can name a
    # short one in a top-up.
    return WeeksOfFirstsResponse(
        areas=[
            WeeksOfFirstsArea(key=plan.area.key, target=plan.target, items=kept[plan.area.key])
            for plan in plans
        ]
    )


def build_prompt_for_tests(batch: Batch, *, seed: int = 1, others: Sequence[str] = ()) -> str:
    return _build_prompt(batch, seed=seed, others=others, budget=60, locale="en")


def parse_payload_for_tests(raw: str) -> List[Any]:
    return _parse_payload(raw)
