"""Generate Roll-a-Day: Retirement Edition activity pools via Gemini.

The page is two six-row tables driven by a die: the first roll picks a morning
plan, the second an afternoon plan, and the two together make the reader's
day -- "Take a slow walk and grab a coffee" + "Bake a small batch of scones".
Nobody checks the 36 pairings one by one, so every activity is held to one
shape instead, which makes any morning combine with any afternoon:

* **Half a day, on its own.** About one to three hours; never a whole-day plan,
  a trip away or anything overnight; never continuing or depending on the
  other half of the day ("finish", "again", "after").
* **In its own half of the day.** No mealtime (lunch, dinner) and nothing of
  the evening on either side; nothing of the afternoon in a morning (a nap)
  and nothing needing an early start in an afternoon (sunrise, breakfast).
* **No day doubles up.** No two activities on the page share a word of
  substance (who and where aside: "a friend", "at home"), so a walk never meets
  a walk and baking never meets baking.
* **Open to everyone.** Nothing strenuous, no car, no golf course, beach or big
  budget assumed; the Bucket List's gates add the rest (one verb-led action,
  nothing vague, sensitive, branded or assuming a spouse, grandchildren or a
  house).

A reply is checked as a set, not item by item: activities are accepted in
brief order, alternating sides, and one that clashes with any already kept --
on either side -- is dropped. Meaning-level repeats (the Bucket List's content
words, synonyms folded, plus the model's own name for the concept) are also
checked against what the client says the book already prints and this
worker's memory -- all bounded, never a comparison with every table ever made.

Variety is structural. Each side takes six different kinds of activity (rest,
gentle movement, making and people always; two of learning, local outings,
home and play, the seller's mix first), every activity gets its own facet and
flavour, all shuffled by seed -- so a side cannot be six ways of drinking
coffee, and two sellers on the same settings get different tables.
"""

from __future__ import annotations

import logging
import random
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Iterable, Mapping, Sequence

from app.core.config import settings
from app.schemas.studio_roll_a_day import (
    RollADayItem,
    RollADayModelOutput,
    RollADayRequest,
    RollADayResponse,
)
from app.services.prompt_data import (
    int_value,
    load_config,
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

GAME = "roll-a-day"
SIDES = ("morning", "afternoon")
FINAL_ERROR = "Could not write a full Roll-a-Day table this time. Please try again."
# Remembered activities a new one is checked against. Bounded, so the check
# stays a few thousand set comparisons however long a seller keeps going.
MEMORY_FILTER_LIMIT = 200
# Activities named in a retry prompt as already written.
RETRY_AVOID_LIMIT = 80


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


def _limit(key: str) -> int:
    return int_value(_limits(), key)


@lru_cache(maxsize=2)
def _side_re(side: str) -> Any:
    return word_pattern(
        [*string_list(_config(), "anySideBanned"), *string_list(_config(), f"{side}Banned")]
    )


@lru_cache(maxsize=1)
def _exclusive_re() -> Any:
    return word_pattern(string_list(_config(), "exclusiveTerms"))


@lru_cache(maxsize=1)
def _soft_tokens() -> frozenset[str]:
    """Who and where, not what: folded the same way as an activity's own words."""
    out: set[str] = set()
    for word in string_list(_config(), "softWords"):
        out |= content_tokens(word)
    return frozenset(out)


_rate_limiter = RateLimiter(
    label="Roll-a-Day",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class RollADayRateLimitError(StudioRateLimitError):
    """User exceeded the short-window Roll-a-Day quota."""


class RollADayGenerationError(StudioGenerationError):
    """Model output could not be turned into usable activity pools."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise RollADayRateLimitError(str(exc)) from exc


def _scope(req: RollADayRequest, user_id: str, seed: int) -> VarietyScope:
    """One memory per mix: that is what decides which activities risk repeating."""
    return VarietyScope(game=GAME, user_id=user_id, bucket=bucket_key(req.focus), seed=seed)


def _budget(req: RollADayRequest) -> int:
    return min(_limit("maxActivityChars"), req.max_activity_chars)


# ---------------------------------------------------------------- kinds


def kind_keys() -> tuple[str, ...]:
    return tuple(section(_config(), "kinds").keys())


def _side_salt(side: str) -> int:
    return 0 if side == "morning" else 1


def plan_kinds(focus: str, seed: int, side: str) -> list[str]:
    """The six kinds one side prints: the core four plus two extras, the mix's first.

    Drawn separately for each side, so a morning and an afternoon rarely take
    the same two extras.
    """
    rng = random.Random(seed * 2 + _side_salt(side))
    extras = list(string_list(_config(), "extraKinds"))
    rng.shuffle(extras)
    boost = string_list(section(section(_config(), "focuses"), focus), "boost")
    ordered = [kind for kind in boost if kind in extras] + [k for k in extras if k not in boost]
    core = list(string_list(_config(), "coreKinds"))
    kinds = core + ordered[: _limit("slots") - len(core)]
    rng.shuffle(kinds)
    return kinds


def briefs(
    req: RollADayRequest,
    side: str,
    want: int,
    seed: int,
    missing: Iterable[str] = (),
) -> list[tuple[str, str]]:
    """One brief per activity -- kind, facet, flavour -- with the kind it files under.

    Kinds cycle through the side's plan (kinds a retry still lacks first), so
    spares cover the kinds again. Facets are shuffled per kind and flavours
    across the side, both by seed, so the same facet meets a different flavour
    next time.
    """
    plan = plan_kinds(req.focus, req.seed, side)
    lacking = set(missing)
    order = [kind for kind in plan if kind in lacking] + [kind for kind in plan if kind not in lacking]
    rng = random.Random(seed * 2 + _side_salt(side))
    focus_flavours = string_list(section(section(_config(), "focuses"), req.focus), "flavours")
    flavours = [*string_list(_config(), "flavours"), *focus_flavours, *focus_flavours]
    rng.shuffle(flavours)
    kinds = section(_config(), "kinds")
    facets: dict[str, list[str]] = {}
    for kind in order:
        pool = list(string_list(kinds[kind], "facets"))
        rng.shuffle(pool)
        facets[kind] = pool

    prefix = "M" if side == "morning" else "A"
    out: list[tuple[str, str]] = []
    for index in range(want):
        kind = order[index % len(order)]
        pool = facets[kind]
        facet = pool[(index // len(order)) % len(pool)]
        label = str(kinds[kind]["label"])
        flavour = flavours[index % len(flavours)]
        out.append((f"{prefix}{index + 1}. {label} -- facet: {facet} -- flavour: {flavour}", kind))
    return out


# ---------------------------------------------------------------- gates


def normalize_activity(raw: Any, *, side: str, budget: int) -> str | None:
    """One activity as printed -- "Bake a small batch of scones" -- or None.

    The Bucket List's idea gates first (one verb-led action, nothing vague,
    sensitive, branded or exclusive), then this page's own: a tighter length,
    nothing of the wrong half of the day, and nothing that shuts readers out.
    """
    text = normalize_idea(raw, budget=budget)
    if text is None:
        return None
    if not _limit("minActivityWords") <= len(text.split()) <= _limit("maxActivityWords"):
        return None
    if len(text) < _limit("minActivityChars"):
        return None
    if _side_re(side).search(text) or _exclusive_re().search(text):
        return None
    return text


def normalize_item(raw: Any, *, side: str, budget: int) -> RollADayItem | None:
    """One complete activity (kind left for the caller) -- or None. Never a repaired one."""
    if not isinstance(raw, dict):
        return None
    activity = normalize_activity(raw.get("activity"), side=side, budget=budget)
    if activity is None:
        return None
    # Straight from the model, an activity carries the concept it names; one
    # it could not name is usually a slogan.
    if "concept" in raw and not normalize_concept(raw.get("concept")):
        return None
    return RollADayItem(activity=activity, concept=normalize_concept(raw.get("concept")))


@dataclass(frozen=True)
class ActivityKey:
    """An activity tokenised once: its meaning key and its words of substance."""

    idea: IdeaKey
    core: frozenset[str]

    @classmethod
    def of(cls, text: str, concept: str = "") -> "ActivityKey":
        idea = IdeaKey.of(text, concept)
        return cls(idea=idea, core=idea.tokens - _soft_tokens())


def activities_clash(x: ActivityKey, y: ActivityKey) -> bool:
    """Too alike for one page: the same activity, or any shared word of substance.

    Stricter than a repeat on purpose -- every morning meets every afternoon,
    so two activities sharing "walk" or "bake" would make a day of doing the
    same thing twice.
    """
    return keys_repeat(x.idea, y.idea) or bool(x.core & y.core)


def activities_repeat(x: ActivityKey, y: ActivityKey) -> bool:
    """The same activity in other words -- the test against other pages.

    Looser than a clash (a book may walk on two different pages), tighter than
    the Bucket List's repeat: an activity has only two to four words of
    substance, so "Bake a small tray of scones" repeats "Bake a small batch of
    scones" on two shared words, on half its substance, or when one of them is
    about nothing else ("Make some fresh scones").
    """
    if keys_repeat(x.idea, y.idea):
        return True
    shared = len(x.core & y.core)
    union = len(x.core | y.core)
    smallest = min(len(x.core), len(y.core))
    return shared >= 2 or (shared > 0 and (smallest == 1 or shared / union >= 0.5))


def side_ready(items: Sequence[RollADayItem]) -> bool:
    """Enough activities, of enough different kinds, to fill one side's six faces."""
    return (
        len(items) >= _limit("slots")
        and len({item.kind for item in items}) >= _limit("minKindsPerSide")
    )


# ---------------------------------------------------------------- prompt


def _side_block(side: str, lines: Sequence[str]) -> str:
    title = side.upper()
    if not lines:
        return f'{title} -- none are needed this time: return "{side}": [].'
    brief_block = "\n".join(lines)
    return f"""{title} -- {section(_config(), "sides")[side]}
Write exactly {len(lines)}, one per brief, in this order:
{brief_block}"""


def _build_prompt(side_briefs: Mapping[str, Sequence[tuple[str, str]]], *, budget: int) -> str:
    morning = _side_block("morning", [line for line, _ in side_briefs.get("morning", [])])
    afternoon = _side_block("afternoon", [line for line, _ in side_briefs.get("afternoon", [])])
    min_words = _limit("minActivityWords")
    max_words = _limit("maxActivityWords")

    return f"""Write activities for "Roll-a-Day", a page in a large-print activity book for
retirees. The reader rolls a die for their MORNING (1 to 6), rolls again for
their AFTERNOON (1 to 6), and enjoys the two together as a spontaneous,
unplanned day of retirement freedom. It should feel playful, warm and easy.

Every morning will meet every afternoon -- 36 possible days -- so EVERY
activity must pair naturally with ANY activity from the other list:
- It takes about one to three hours: comfortably half a day or less. Never a
  whole-day plan, a trip away or anything overnight.
- It is complete on its own: it never continues, finishes or depends on the
  other half of the day.
- No mealtimes (no lunch, dinner or brunch) and nothing of the evening or night.
- Every activity is a different kind of thing: no word of substance (walk,
  bake, garden, library, music, puzzle...) appears in more than one activity
  across BOTH lists, so no day does the same thing twice.
For example, the morning "Take a slow walk and grab a coffee" pairs just as well
with "Bake a small batch of scones" as with "Browse the shelves at the library".

{morning}

{afternoon}

Each brief names a kind of activity, a facet to build it from, and a flavour --
a gentle nudge on cost, place or company; set the flavour aside if it clashes
with the facet.

Build each activity in this order:
1. "concept": the underlying activity in 2 to 4 plain words, specific enough
   that two different activities never share it ("scone baking", "library
   browse"; never just "hobby" or "fun").
2. "activity": that concept as one short, inviting action the reader can
   picture doing, starting with a verb.

Strong activities are concrete and easy to picture:
- "Take a slow walk and grab a coffee"
- "Sketch the view from a window"
- "Call a friend for a long catch-up"
- "Bake a small batch of scones"
- "Browse the shelves at the library"
- "Play a board game with a neighbour"
Weak activities -- never write these kinds:
- Vague: "Do something fun", "Enjoy retirement", "Try a new hobby"
- A whole day or a trip: "Take a road trip to the coast", "Spend the day at a theme park"
- Tied to a time or to the other half: "Meet a friend for lunch", "Watch the
  sunset", "Finish this morning's project"
- Strenuous or exclusive: "Go for a long run", "Play a round of golf", "Drive to the hills"

Each activity:
- Starts with a verb and is one clear activity. No "or", no "then", no
  second sentence.
- {min_words} to {max_words} words and at most {budget} characters. Four to six words is ideal.
- Everyday words anyone understands; free or low-cost; no special skill needed.
- Works for everyone: do not assume a partner, children or grandchildren, a
  house, garden or yard, a car, a big budget, or great fitness. Keep movement
  gentle ("a stroll", "a gentle stretch"). Prefer "a friend", "a neighbour",
  "a pot on a windowsill", "on foot or by bus".
- Warm, light and positive: retirees are capable and busy enjoying their freedom.
- Original wording -- not a quote, slogan, song line, title, or a line from a
  published list or challenge.
- No full stop, numbering or quotation marks.

Never: health, illness, ageing bodies, memory lapses, loneliness, money worries,
death, age jokes, anything that talks down to older adults, politics, religion,
alcohol, gambling, brand names, celebrities, famous events or trademarks.
Write in clear, warm, natural English that reads well in both British and American homes.

Return JSON only:
{{ "morning": [ {{ "brief": 1, "concept": "coffee stroll", "activity": "Take a slow walk and grab a coffee" }} ],
  "afternoon": [ {{ "brief": 1, "concept": "scone baking", "activity": "Bake a small batch of scones" }} ] }}
"""


def _parse_payload(raw: str) -> tuple[list[Any], list[Any]]:
    data = parse_json_object(raw)
    morning = data.get("morning", [])
    afternoon = data.get("afternoon", [])
    if not isinstance(morning, list) or not isinstance(afternoon, list) or not (morning or afternoon):
        raise ValueError("invalid JSON: missing morning and afternoon")
    return morning, afternoon


def _brief_number(raw: Any) -> int | None:
    try:
        return int(str(raw).strip().lstrip("MAma").rstrip("."))
    except (TypeError, ValueError):
        return None


async def _call_gemini(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        temperature=0.95,
        max_output_tokens=_limit("maxOutputTokens"),
        response_schema=RollADayModelOutput,
        label="roll_a_day",
    )


# ---------------------------------------------------------------- generate


def _interleave(morning: Sequence[Any], afternoon: Sequence[Any]) -> list[tuple[str, Any]]:
    """M1, A1, M2, A2...: each side's first briefs -- its core -- win any clash over spares."""
    out: list[tuple[str, Any]] = []
    for index in range(max(len(morning), len(afternoon))):
        if index < len(morning):
            out.append(("morning", morning[index]))
        if index < len(afternoon):
            out.append(("afternoon", afternoon[index]))
    return out


def _accept(
    pairs: Iterable[tuple[str, Any]],
    owners: Mapping[str, Mapping[int, str]],
    *,
    caps: Mapping[str, int],
    kept: dict[str, list[RollADayItem]],
    accepted: list[ActivityKey],
    printed: Sequence[ActivityKey],
    budget: int,
) -> None:
    """File each valid activity that clashes with nothing kept and repeats nothing printed."""
    for side, raw in pairs:
        if not isinstance(raw, dict) or len(kept[side]) >= caps[side]:
            continue
        kind = owners[side].get(_brief_number(raw.get("brief")) or 0)
        if kind is None:
            continue
        item = normalize_item(raw, side=side, budget=budget)
        if item is None:
            continue
        key = ActivityKey.of(item.activity, item.concept)
        if any(activities_clash(key, other) for other in accepted):
            continue
        if any(activities_repeat(key, other) for other in printed):
            continue
        kept[side].append(RollADayItem(activity=item.activity, concept=item.concept, kind=kind))
        accepted.append(key)


def _missing_kinds(req: RollADayRequest, side: str, items: Sequence[RollADayItem]) -> list[str]:
    have = {item.kind for item in items}
    return [kind for kind in plan_kinds(req.focus, req.seed, side) if kind not in have]


async def generate_roll_a_day(req: RollADayRequest, user_id: str) -> RollADayResponse:
    _check_rate_limit(user_id)

    cap = _limit("maxPerSide")
    wants = {"morning": min(cap, req.morning_count), "afternoon": min(cap, req.afternoon_count)}
    if not any(wants.values()):
        raise RollADayGenerationError(FINAL_ERROR)
    budget = _budget(req)
    started = time.perf_counter()
    home = _scope(req, user_id, req.seed)
    # What this seller printed before: the client's list (spans workers and
    # restarts) plus this worker's own memory. An activity that repeats either
    # is dropped here, not just discouraged in the prompt.
    printed = [ActivityKey.of(label) for label in [*req.avoid, *recent(home, MEMORY_FILTER_LIMIT)]]
    kept: dict[str, list[RollADayItem]] = {side: [] for side in SIDES}
    accepted: list[ActivityKey] = []
    last_error = FINAL_ERROR
    calls = 0

    for attempt in range(_limit("maxAttempts")):
        asks: dict[str, int] = {}
        for side in SIDES:
            if wants[side] == 0 or side_ready(kept[side]):
                continue
            short = max(0, _limit("slots") - len(kept[side]))
            asks[side] = wants[side] if attempt == 0 else min(cap, short + _limit("retrySpare"))
        if not asks:
            break

        seed = req.seed + attempt * 97
        side_briefs = {
            side: briefs(req, side, want, seed, missing=_missing_kinds(req, side, kept[side]))
            for side, want in asks.items()
        }
        written = [item.activity for side in SIDES for item in kept[side]]
        prompt = with_variety(
            _build_prompt(side_briefs, budget=budget),
            home.at_seed(seed),
            client_avoid=[*written, *req.avoid],
            limit=RETRY_AVOID_LIMIT if written else None,
        )
        calls += 1
        try:
            morning_raw, afternoon_raw = _parse_payload(await _call_gemini(prompt))
        except Exception as exc:
            logger.warning("studio_roll_a_day_attempt_failed attempt=%s error=%s", attempt + 1, exc)
            last_error = "The AI did not return valid Roll-a-Day activities. Please try again."
            continue

        owners = {
            side: {index + 1: kind for index, (_, kind) in enumerate(side_briefs.get(side, []))}
            for side in SIDES
        }
        _accept(
            _interleave(morning_raw, afternoon_raw),
            owners,
            caps={side: len(kept[side]) + asks.get(side, 0) for side in SIDES},
            kept=kept,
            accepted=accepted,
            printed=printed,
            budget=budget,
        )

    if not accepted:
        raise RollADayGenerationError(last_error)

    remember(home, [item.activity for side in SIDES for item in kept[side]])
    logger.info(
        "studio_roll_a_day_generated model=%s latency_ms=%s morning=%s afternoon=%s calls=%s focus=%s",
        settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        len(kept["morning"]),
        len(kept["afternoon"]),
        calls,
        req.focus,
    )
    return RollADayResponse(morning=kept["morning"], afternoon=kept["afternoon"])


def build_prompt_for_tests(req: RollADayRequest, *, seed: int | None = None) -> str:
    seed = req.seed if seed is None else seed
    side_briefs = {
        side: briefs(req, side, count, seed)
        for side, count in (("morning", req.morning_count), ("afternoon", req.afternoon_count))
        if count > 0
    }
    return _build_prompt(side_briefs, budget=_budget(req))


def parse_payload_for_tests(raw: str) -> tuple[list[Any], list[Any]]:
    return _parse_payload(raw)
