"""Generate Retirement Bucket List ideas via Gemini.

A bucket list is a long numbered list -- fifty to a hundred ideas -- of things
to do in retirement, grouped under theme headings, each with a box the reader
ticks once it is done: "Take a scenic train journey", "Grow a pot of herbs on
a windowsill". The reader browses it for possibilities, not a to-do list.

Everything here is printed and sold on KDP, so an idea only survives whole:

* **One concrete action.** It starts with a verb and names one experience: no
  "or", no second clause joined by "and <verb>", no list, no sentence. An idea
  left with nothing concrete once the empty words are gone ("Experience more
  adventure", "Learn new things") is too vague to print.
* **Short.** At most the characters the page reserved, so it sets in the lines
  its row holds and the checkbox stays beside it.
* **No repeats in meaning.** Ideas are compared on content words after
  qualifiers are dropped, set phrases and synonyms folded ("trip", "journey"
  and "holiday" are one word; "painting" and "watercolour" are one) and the
  generic verbs removed -- so "Try painting" and "Take a painting class" are
  the same idea. The model's own short name for the experience (``concept``)
  catches the same thing said in different words. Checked within the reply,
  against what the client says the book already prints, and against this
  worker's memory -- all bounded, never a comparison with every list ever made.
* **Nothing sensitive or exclusive.** Health, money worries, death, time
  running out, age jokes, politics, religion, alcohol, gambling, risky stunts,
  brands and celebrities are dropped; so are ideas that assume a spouse,
  grandchildren or a house.

Variety is structural. A list samples its themes from a bank of twenty-seven
(at least one from every group: calm, close to home, going places, creative,
people -- the seller's focus weighted up), and every idea gets its own brief --
one of that theme's facets plus a flavour (free, at home, with a friend...) --
so a list cannot be twenty ways of saying "travel", and two sellers on the
same settings get different lists. Themes are written in batches that run
concurrently, and each batch is told which headings the rest of the list owns.
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
from typing import Any, Iterable, List, Mapping, Sequence, Tuple

from app.core.config import settings
from app.schemas.studio_bucket_list import (
    BucketListItem,
    BucketListModelOutput,
    BucketListRequest,
    BucketListResponse,
    BucketListSection,
)
from app.services.prompt_data import (
    int_value,
    load_config,
    locale_line,
    section,
    string_list,
    word_pattern,
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

GAME = "bucket-list"
FINAL_ERROR = "Could not write a clear bucket list this time. Please try again."
# Remembered ideas a new one is checked against. Bounded, so the check stays a
# few tens of thousands of set comparisons however long a seller keeps going.
MEMORY_FILTER_LIMIT = 240
# Ideas named in a retry prompt as already written. Enough to cover the list.
RETRY_AVOID_LIMIT = 120

# Mirrors AGE_STEREOTYPE_PATTERNS in
# frontend/src/utils/studio/retirement-word-search/content-quality.ts.
_STEREOTYPE_RE = re.compile(
    r"\bfrail\b|\bforgetful\b|\bsenile\b|\bold[\s-]?timer\b|\bdecline\b|"
    r"\bfeeble\b|\buseless\b",
    re.IGNORECASE,
)
_NUMBER_RE = re.compile(r"^\s*(\(?\d{1,3}\s*[.):-]\s+|[-*•]\s+)")
_BOX_RE = re.compile(r"^\s*(\[\s?[xX]?\s?\]|[☐☑☒□■✓✔])\s*")
# Letters (any script), digits, spaces and light punctuation: no sentence
# break, no colon or slash offering a second idea, no emoji.
_ALLOWED_RE = re.compile(r"^[^\W_][\w ,'’&-]*$")
# A second idea hiding inside one ("... in Rome or Paris", "... then ...").
_SPLIT_RE = re.compile(r"\b(or|either|nor|then|plus|etc)\b", re.IGNORECASE)
_EDGE_TRIM_CHARS = "\"'“”‘’ "
_TAIL_TRIM_CHARS = " .!…;:,"
_WORD_RE = re.compile(r"[^\W_]+")
_JOIN_RE = re.compile(r"[^\W_]+|,")


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


def _words(key: str) -> frozenset[str]:
    return frozenset(word.lower() for word in string_list(_config(), key))


@lru_cache(maxsize=1)
def _qualifiers() -> frozenset[str]:
    return _words("qualifierWords")


@lru_cache(maxsize=1)
def _generic() -> frozenset[str]:
    words = _words("genericWords")
    return words | frozenset(stem(word) for word in words)


@lru_cache(maxsize=1)
def _starters() -> frozenset[str]:
    return _words("nonVerbStarters")


@lru_cache(maxsize=1)
def _lead_verbs() -> frozenset[str]:
    return _words("leadVerbs")


@lru_cache(maxsize=1)
def _synonyms() -> Mapping[str, str]:
    return {str(k).lower(): str(v).lower() for k, v in section(_config(), "synonyms").items()}


@lru_cache(maxsize=1)
def _phrases() -> tuple[tuple[re.Pattern[str], str], ...]:
    pairs = sorted(section(_config(), "phrases").items(), key=lambda kv: -len(kv[0]))
    return tuple(
        (re.compile(rf"\b{re.escape(str(phrase).lower())}\b"), str(repl).lower())
        for phrase, repl in pairs
    )


@lru_cache(maxsize=1)
def _blocked_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "blockedTerms"))


@lru_cache(maxsize=1)
def _brand_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "brandTerms"))


@lru_cache(maxsize=1)
def _cliche_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "clichePhrases"))


_rate_limiter = RateLimiter(
    label="Bucket List",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class BucketListRateLimitError(StudioRateLimitError):
    """User exceeded the short-window Bucket List quota."""


class BucketListGenerationError(StudioGenerationError):
    """Model output could not be turned into a usable list."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise BucketListRateLimitError(str(exc)) from exc


def _scope(req: BucketListRequest, user_id: str, seed: int) -> VarietyScope:
    """One memory per focus: that is what decides which ideas risk repeating."""
    return VarietyScope(game=GAME, user_id=user_id, bucket=bucket_key(req.focus), seed=seed)


def _idea_budget(req: BucketListRequest) -> int:
    return min(int_value(_limits(), "maxIdeaChars"), req.max_idea_chars)


# ---------------------------------------------------------------- themes


@dataclass(frozen=True)
class Theme:
    key: str
    title: str
    group: str
    facets: tuple[str, ...]


@dataclass(frozen=True)
class SectionPlan:
    """One heading of the list: how many ideas print, and how many to write."""

    theme: Theme
    target: int
    ask: int


@lru_cache(maxsize=1)
def themes() -> tuple[Theme, ...]:
    out: list[Theme] = []
    for raw in _config()["themes"]:
        out.append(
            Theme(
                key=str(raw["key"]),
                title=str(raw["title"]),
                group=str(raw["group"]),
                facets=tuple(str(f) for f in raw["facets"]),
            )
        )
    return tuple(out)


@lru_cache(maxsize=1)
def _theme_index() -> Mapping[str, Theme]:
    return {theme.key: theme for theme in themes()}


def _groups() -> tuple[str, ...]:
    return tuple(section(_config(), "groups").keys())


def _boosted(focus: str) -> tuple[str, ...]:
    return string_list(section(section(_config(), "focuses"), focus), "boost")


def section_count(count: int) -> int:
    """About eight ideas under each heading, within the bank's bounds."""
    per = int_value(_limits(), "itemsPerSection")
    wanted = int(count / per + 0.5)
    return max(int_value(_limits(), "minSections"), min(int_value(_limits(), "maxSections"), wanted))


def spares_for(target: int) -> int:
    """Extra ideas written per heading, for the gates on both sides to spend."""
    return max(2, math.ceil(target * 0.35))


def _weighted_pick(rng: random.Random, pool: list[Theme], boost: Sequence[str]) -> Theme:
    weights = [3.0 if theme.group in boost else 1.0 for theme in pool]
    return pool.pop(rng.choices(range(len(pool)), weights=weights)[0])


def plan_sections(req: BucketListRequest) -> list[SectionPlan]:
    """The headings this list prints, in print order, and their idea counts.

    A top-up request names its own headings. Otherwise every group is
    represented first -- rest and simple pleasures always sit beside travel --
    the focus's groups get a second heading, and the rest are drawn weighted
    towards the focus. The count is spread evenly across the headings.
    """
    if req.sections:
        plans: list[SectionPlan] = []
        seen: set[str] = set()
        for ask in req.sections:
            theme = _theme_index().get(ask.key)
            if theme is None or theme.key in seen:
                continue
            seen.add(theme.key)
            plans.append(SectionPlan(theme, ask.count, ask.count + spares_for(ask.count)))
        return plans

    rng = random.Random(req.seed)
    total = section_count(req.count)
    boost = _boosted(req.focus)
    pool = list(themes())
    chosen: list[Theme] = []

    groups = list(_groups())
    rng.shuffle(groups)
    for group in [*groups, *boost]:
        options = [theme for theme in pool if theme.group == group]
        if not options:
            continue
        pick = rng.choice(options)
        pool.remove(pick)
        chosen.append(pick)
    while len(chosen) < total and pool:
        chosen.append(_weighted_pick(rng, pool, boost))

    chosen = chosen[:total]
    rng.shuffle(chosen)
    base, extra = divmod(req.count, len(chosen))
    plans = []
    for index, theme in enumerate(chosen):
        target = base + (1 if index < extra else 0)
        plans.append(SectionPlan(theme, target, target + spares_for(target)))
    return plans


# ---------------------------------------------------------------- text keys


def stem(word: str) -> str:
    """Fold endings so PAINTING and PAINTS, BAKE and BAKING compare equal. Crude on purpose."""
    if len(word) <= 3:
        return word
    if len(word) > 4 and word.endswith("ies"):
        word = word[:-3] + "y"
    elif len(word) > 5 and word.endswith("ing"):
        word = _undouble(word[:-3])
    elif len(word) > 4 and word.endswith("ed"):
        word = _undouble(word[:-2])
    elif len(word) > 4 and word.endswith(("ches", "shes", "sses", "xes", "zes")):
        word = word[:-2]
    elif word.endswith("s") and not word.endswith("ss"):
        word = word[:-1]
    if len(word) > 3 and word.endswith("e"):
        word = word[:-1]
    return word


def _undouble(word: str) -> str:
    """SWIMM -> SWIM, PLANN -> PLAN; FALL and DRESS keep their doubles."""
    if len(word) >= 3 and word[-1] == word[-2] and word[-1] not in "aeiouls":
        return word[:-1]
    return word


def _fold(text: str) -> str:
    folded = text.lower().replace("’", "'")
    for pattern, replacement in _phrases():
        folded = pattern.sub(replacement, folded)
    return folded.replace("'s ", " ").replace("'", "")


def content_tokens(text: str) -> frozenset[str]:
    """What an idea is about: qualifiers, generic verbs and empty words gone, synonyms folded."""
    out: set[str] = set()
    for word in _WORD_RE.findall(_fold(text)):
        if word in _qualifiers():
            continue
        canon = _synonyms().get(word)
        if canon is None:
            stemmed = stem(word)
            canon = _synonyms().get(stemmed, stemmed)
        if canon in _generic() or word in _generic():
            continue
        out.add(canon)
    return frozenset(out)


def _jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    union = a | b
    return len(a & b) / len(union) if union else 1.0


def tokens_repeat(a: frozenset[str], b: frozenset[str]) -> bool:
    """True when a reader would call two ideas the same thing.

    Most of their substance shared, or one wholly inside the other -- once the
    smaller has two words of substance, or when neither has more than two
    ("Take a painting class" / "Paint a watercolour": both just PAINT).
    """
    if not a or not b:
        return False
    if a == b or _jaccard(a, b) >= 0.6:
        return True
    small, large = (a, b) if len(a) <= len(b) else (b, a)
    return small <= large and (len(small) >= 2 or len(large) <= 2)


@dataclass(frozen=True)
class IdeaKey:
    """An idea tokenised once, so a list of a hundred is a flat pass per candidate."""

    text: str
    tokens: frozenset[str]
    concept: frozenset[str] = frozenset()

    @classmethod
    def of(cls, text: str, concept: str = "") -> "IdeaKey":
        return cls(
            text=re.sub(r"\s+", " ", text).strip().lower(),
            tokens=content_tokens(text),
            concept=content_tokens(concept) if concept else frozenset(),
        )


def keys_repeat(x: IdeaKey, y: IdeaKey) -> bool:
    if x.text == y.text:
        return True
    # The model's name for the experience, when both carry one: the same
    # thing said in different words. A one-word name ("painting") is only a
    # match when the ideas themselves overlap too, or every painting idea
    # would crowd out the next.
    if x.concept and x.concept == y.concept:
        if len(x.concept) >= 2 or _jaccard(x.tokens, y.tokens) >= 0.34:
            return True
    return tokens_repeat(x.tokens, y.tokens)


def ideas_repeat(first: str, second: str) -> bool:
    return keys_repeat(IdeaKey.of(first), IdeaKey.of(second))


# ---------------------------------------------------------------- gates


def is_unsafe(text: str) -> bool:
    folded = text.replace("’", "'")
    return bool(
        _STEREOTYPE_RE.search(folded)
        or _blocked_re().search(folded)
        or _brand_re().search(folded)
        or _cliche_re().search(folded)
    )


def _clean(raw: Any) -> str:
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    return text.strip(_EDGE_TRIM_CHARS)


def _joins_two_ideas(text: str) -> bool:
    """ "Bake bread and share it", "Take a boat, see the fjords". """
    words = _JOIN_RE.findall(text.lower())
    return any(
        word in ("and", ",") and nxt in _lead_verbs() for word, nxt in zip(words, words[1:])
    )


def _opens_on_a_verb(first: str) -> bool:
    if first in _starters():
        return False
    # "Visiting ...", "Finally ...": not an action to take.
    if len(first) > 5 and first.endswith(("ing", "ly")):
        return False
    return True


def normalize_idea(raw: Any, *, budget: int) -> str | None:
    """One idea as printed -- "Take a scenic train journey" -- or None."""
    text = _clean(raw)
    for pattern in (_NUMBER_RE, _BOX_RE):
        text = pattern.sub("", text).strip()
    text = text.strip(_EDGE_TRIM_CHARS).rstrip(_TAIL_TRIM_CHARS).strip(_EDGE_TRIM_CHARS)
    if not text or not _ALLOWED_RE.match(text) or _SPLIT_RE.search(text):
        return None
    letters = [ch for ch in text if ch.isalpha()]
    if not letters or sum(ch.isupper() for ch in letters) > len(letters) * 0.5:
        return None
    words = _WORD_RE.findall(text.lower())
    if not words or not _opens_on_a_verb(words[0]) or _joins_two_ideas(text):
        return None
    count = len(text.split())
    if not int_value(_limits(), "minIdeaWords") <= count <= int_value(_limits(), "maxIdeaWords"):
        return None
    if not int_value(_limits(), "minIdeaChars") <= len(text) <= budget:
        return None
    if is_unsafe(text):
        return None
    # Nothing concrete left once the empty words are gone: a slogan, not a plan.
    if not content_tokens(text):
        return None
    return text[0].upper() + text[1:]


def normalize_concept(raw: Any) -> str:
    return _clean(raw).lower()[: int_value(_limits(), "maxConceptChars")].strip()


def normalize_item(raw: Any, *, budget: int) -> BucketListItem | None:
    """One complete idea -- or None. Never a repaired one."""
    if not isinstance(raw, dict):
        return None
    idea = normalize_idea(raw.get("idea"), budget=budget)
    if idea is None:
        return None
    # Straight from the model, an idea carries the experience it names; one it
    # could not name is usually a slogan.
    if "concept" in raw and not normalize_concept(raw.get("concept")):
        return None
    return BucketListItem(idea=idea, concept=normalize_concept(raw.get("concept")))


# ---------------------------------------------------------------- prompt


Batch = List[Tuple[SectionPlan, int]]


def batches(asks: Sequence[tuple[SectionPlan, int]]) -> list[Batch]:
    """Whole headings per call, about three to a call, so calls can run side by side."""
    limit = int_value(_limits(), "batchItems")
    out: list[Batch] = []
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


def briefs(batch: Batch, seed: int) -> tuple[list[str], dict[int, str]]:
    """One brief per idea -- heading, facet, flavour -- and which heading each number belongs to.

    Facets are shuffled per heading and flavours across the batch, both by
    seed, so the same facet meets a different flavour next time.
    """
    rng = random.Random(seed)
    flavours = list(string_list(_config(), "flavours"))
    rng.shuffle(flavours)
    lines: list[str] = []
    owners: dict[int, str] = {}
    number = 0
    for plan, want in batch:
        facets = list(plan.theme.facets)
        rng.shuffle(facets)
        for index in range(want):
            flavour = flavours[number % len(flavours)]
            number += 1
            owners[number] = plan.theme.key
            lines.append(
                f"{number}. [{plan.theme.title}] {facets[index % len(facets)]} -- flavour: {flavour}"
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
    headings = ", ".join(f'"{plan.theme.title}"' for plan, _ in batch)
    other_line = (
        "Other headings in the same list (leave their ground to them): "
        + ", ".join(f'"{title}"' for title in others)
        + "."
        if others
        else ""
    )
    brief_block = "\n".join(lines)
    min_words = int_value(_limits(), "minIdeaWords")
    max_words = int_value(_limits(), "maxIdeaWords")
    language = locale_line(section(_config(), "locale"), locale)

    return f"""Write ideas for a Retirement Bucket List in a large-print activity book for
retirees. The reader browses the list, discovers things they would love to do in
retirement, and ticks the box beside each idea once they have done it -- over
months and years. It should feel inspiring, warm and realistic, never like a
to-do list or a test.

This part of the list covers: {headings}.
{other_line}

Write exactly {want} ideas, one per brief, in this order. Each brief names its
heading, a facet to build the idea from, and a flavour -- a gentle nudge on
cost, place or company; set the flavour aside if it clashes with the facet.
{brief_block}

How to build each idea -- in this order:
1. "concept": the underlying experience in 2 to 4 plain words, specific enough
   that two different ideas never share it ("scenic train journey",
   "watercolour landscapes", "bread from scratch"; never just "travel", "art").
2. "idea": that experience as one short action the reader can picture doing,
   starting with a verb.

Strong ideas are concrete and inviting -- the reader thinks "I could actually do that":
- "Take a scenic train journey"
- "Learn to cook a dish from another country"
- "Watch a sunrise from the top of a hill"
- "Grow a pot of herbs on a windowsill"
- "Write a letter to a teacher who inspired you"
- "Spend an afternoon at a botanical garden"
Weak ideas -- never write these kinds:
- Vague or motivational: "Experience more adventure", "Learn new things"
- Two ideas in one: "Bake bread and sell it at a market", "Visit a castle or a palace"
- The same idea in other words: "Take a painting class" beside "Try painting"
- Instructions or explanations: "Plan a trip by first setting a budget"

Each idea:
- Starts with a verb and is one single, clear experience. No "or", no "and then",
  no list, no second sentence.
- {min_words} to {max_words} words and at most {budget} characters. Four to seven words is ideal.
- Everyday words anyone understands; no specialist expertise needed.
- Genuinely different from every other idea, not just worded differently. Vary
  the opening verb: never start more than two ideas with the same verb.
- Realistic for many retirees: mix free and low-cost ideas, things at home and
  nearby, social and solo, restful and more adventurous. Rest and simple
  pleasures count as much as big trips.
- Works for everyone: do not assume the reader has a partner, children or
  grandchildren, owns a house or garden, drives, has a big budget, is very
  athletic, or lives in any particular country. Prefer "a friend", "someone you
  love", "a pot on a windowsill", "by train or bus".
- Original wording -- not a known quote, slogan, song line, title, or a line
  from a published list.
- No full stop, numbering or quotation marks.

Never:
- Health, illness, ageing bodies, memory lapses, loneliness, money worries,
  death, or anything suggesting time is running out ("before it's too late").
- Jokes about age, or anything that talks down to older adults.
- Dangerous stunts, extreme sports, anything illegal or reckless. Keep
  adventurous ideas gentle and sensible ("Take a hot air balloon ride" is fine).
- Politics, religion, alcohol, gambling, brand names, celebrities, famous
  events or trademarks.
{language}

Return JSON only:
{{ "items": [ {{ "brief": 1, "concept": "scenic train journey", "idea": "Take a scenic train journey" }} ] }}
"""


def _parse_payload(raw: str) -> list[Any]:
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
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=BucketListModelOutput,
        label="bucket_list",
    )


# ---------------------------------------------------------------- generate


@dataclass
class _Kept:
    item: BucketListItem
    key: IdeaKey


def _asks(
    plans: Sequence[SectionPlan], kept: Mapping[str, list[_Kept]], attempt: int
) -> Batch:
    """How many ideas to write per heading this round: all of them, then only what is short."""
    asks: list[tuple[SectionPlan, int]] = []
    for plan in plans:
        have = len(kept[plan.theme.key])
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
    plans: Mapping[str, SectionPlan],
    kept: dict[str, list[_Kept]],
    accepted: list[IdeaKey],
    printed: Sequence[IdeaKey],
    budget: int,
) -> None:
    """File each valid, fresh idea under the heading its brief belongs to."""
    for raw in items_raw:
        if not isinstance(raw, dict):
            continue
        owner = owners.get(_brief_number(raw.get("brief")) or 0)
        if owner is None or len(kept[owner]) >= plans[owner].ask:
            continue
        item = normalize_item(raw, budget=budget)
        if item is None:
            continue
        key = IdeaKey.of(item.idea, item.concept)
        if any(keys_repeat(key, other) for other in accepted):
            continue
        if any(keys_repeat(key, other) for other in printed):
            continue
        kept[owner].append(_Kept(item, key))
        accepted.append(key)


async def generate_bucket_list(req: BucketListRequest, user_id: str) -> BucketListResponse:
    _check_rate_limit(user_id)

    plans = plan_sections(req)
    if not plans:
        raise BucketListGenerationError(FINAL_ERROR)
    by_key = {plan.theme.key: plan for plan in plans}
    budget = _idea_budget(req)
    started = time.perf_counter()
    home = _scope(req, user_id, req.seed)
    # What this seller printed before: the client's list (spans workers and
    # restarts) plus this worker's own memory. An idea that repeats either is
    # dropped here, not just discouraged in the prompt.
    printed = [IdeaKey.of(label) for label in [*req.avoid, *recent(home, MEMORY_FILTER_LIMIT)]]
    kept: dict[str, list[_Kept]] = {plan.theme.key: [] for plan in plans}
    accepted: list[IdeaKey] = []
    titles = [plan.theme.title for plan in plans]
    calls = 0

    for attempt in range(int_value(_limits(), "maxAttempts")):
        asks = _asks(plans, kept, attempt)
        if not asks:
            break
        written = [k.item.idea for entries in kept.values() for k in entries]
        avoid = [*written, *req.avoid]
        jobs: list[tuple[dict[int, str], str]] = []
        for index, batch in enumerate(batches(asks)):
            seed = req.seed + attempt * 97 + index * 13
            own = {plan.theme.title for plan, _ in batch}
            prompt = _build_prompt(
                batch,
                seed=seed,
                others=[title for title in titles if title not in own],
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
                    "studio_bucket_list_batch_failed attempt=%s error=%s", attempt + 1, reply
                )
                continue
            try:
                items_raw = _parse_payload(reply)
            except ValueError as exc:
                logger.warning(
                    "studio_bucket_list_batch_invalid attempt=%s error=%s", attempt + 1, exc
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
        raise BucketListGenerationError(FINAL_ERROR)

    remember(home, (k.item.idea for entries in kept.values() for k in entries))
    logger.info(
        "studio_bucket_list_generated model=%s latency_ms=%s ideas=%s wanted=%s sections=%s calls=%s focus=%s",
        settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        len(accepted),
        sum(plan.target for plan in plans),
        len(plans),
        calls,
        req.focus,
    )
    return BucketListResponse(
        sections=[
            BucketListSection(
                key=plan.theme.key,
                title=plan.theme.title,
                target=plan.target,
                items=[k.item for k in kept[plan.theme.key]],
            )
            for plan in plans
            if kept[plan.theme.key]
        ]
    )


def build_prompt_for_tests(batch: Batch, *, seed: int = 1, others: Sequence[str] = ()) -> str:
    return _build_prompt(batch, seed=seed, others=others, budget=52, locale="en")


def parse_payload_for_tests(raw: str) -> list[Any]:
    return _parse_payload(raw)
