"""Generate "What's Your Retired Name?" name pools via Gemini.

The page is a lookup table: the first letter of the reader's first name (A-Z)
gives a new first name, their birth month gives a new last name, and the two
are read together -- "Captain" + "Hammock Snoozer". Nobody checks the 312
pairings one by one, so the two lists are held to one shape instead, which
makes every pairing read as an intentional name:

* **First name** -- a friendly, gender-neutral title ("Captain", "Commodore")
  or a cheerful one-word nickname ("Breezy", "Mellow"). One word, or a fixed
  two-word nickname ("Big Cheese") that does not itself read like a surname.
* **Last name** -- exactly two words: a leisure thing and the doer of it
  ("Porch Rocker", "Crossword Champ"). The second word has to name a person
  doing something (-er / -or / -ist, or a word like Champ, Whiz, Buff).

A name only survives whole: letters (one hyphen or apostrophe at most),
pronounceable words, inside the character budget the page reserved, free of
sensitive topics, age jokes, insults, gendered words, brands and characters.
Nothing is repaired except letter case.

Within a list names must be genuinely different, not variations: no two share
a word root ("Sunny" / "Sunnyside", "Hammock Snoozer" / "Porch Snoozer").
Across generations a last name the seller already printed -- same pair of
roots, from the client's avoid list or this worker's memory -- is dropped.
First names are only steered away from repeats in the prompt: the pool of good
gender-neutral titles is finite, and a book that could never reuse "Captain"
would run dry.

Variety is structural. Every requested name gets its own brief -- a first-name
kind and flavour, or a retirement pastime -- shuffled by seed, so a reply
cannot be twelve kinds of napping, and two sellers on the same settings get
different tables.
"""

from __future__ import annotations

import logging
import random
import re
import time
from functools import lru_cache
from typing import Any, Iterable, Mapping

from app.core.config import settings
from app.schemas.studio_retired_name import (
    RetiredNameModelOutput,
    RetiredNameRequest,
    RetiredNameResponse,
)
from app.services.prompt_data import (
    int_value,
    load_config,
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

GAME = "retired-name"
FINAL_ERROR = (
    "Could not write a full table of retired names for this theme. "
    "Try again, or pick a broader theme."
)
# Remembered names a new last name is checked against. Bounded, so the check
# stays a few hundred root comparisons however long a seller keeps going.
MEMORY_FILTER_LIMIT = 200
# Spares asked for on a retry, on top of what is still missing.
RETRY_SPARE_FIRST = 4
RETRY_SPARE_LAST = 2

_MEDICAL_RE = re.compile(
    r"\bprevent\s+dementia\b|\breverse\s+aging\b|\bcure\s+memory\s+loss\b|"
    r"\banti[\s-]?aging\b|\bmemory\s+loss\b",
    re.IGNORECASE,
)
_FINANCE_RE = re.compile(
    r"\bguaranteed\s+(return|income|profit)|\binvest\s+now\b|\bget[\s-]?rich\b|"
    r"\bcrypto|\bbitcoin\b|\bday[\s-]?trad|\bpenny\s+stock",
    re.IGNORECASE,
)
# Mirrors AGE_STEREOTYPE_PATTERNS in
# frontend/src/utils/studio/retirement-word-search/content-quality.ts.
_STEREOTYPE_RE = re.compile(
    r"\bfrail\b|\bforgetful\b|\bsenile\b|\bold[\s-]?timer\b|\bdecline\b|"
    r"\bfeeble\b|\buseless\b",
    re.IGNORECASE,
)
_WORD_RE = re.compile(r"^[A-Za-z]+(?:'[A-Za-z]+)?(?:-[A-Za-z]+(?:'[A-Za-z]+)?)?$")
_VOWEL_RE = re.compile(r"[aeiouy]")
_TRIPLE_RE = re.compile(r"(.)\1\1")
_CONSONANT_RUN_RE = re.compile(r"[^aeiouy]{5,}")
_EDGE_TRIM_CHARS = "\"'“”‘’ .,;:!?…"
_ROOT_SPLIT_RE = re.compile(r"[\s-]+")
_AGENT_SUFFIXES = ("er", "or", "ist")
# A non-agent word this long also catches compounds ending in it ("sunflower").
_NON_AGENT_SUFFIX_MIN = 6
_ROOT_MIN = 3
_ROOT_PREFIX_MIN = 4
_ROOT_PREFIX_SHARE = 0.6


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


@lru_cache(maxsize=1)
def _blocked_re() -> re.Pattern[str]:
    return word_pattern(
        [
            *string_list(_config(), "blockedTerms"),
            *string_list(_config(), "brandTerms"),
            *string_list(_config(), "genderedTerms"),
        ]
    )


@lru_cache(maxsize=1)
def _agent_heads() -> frozenset[str]:
    return frozenset(word.lower() for word in string_list(_config(), "agentHeads"))


@lru_cache(maxsize=1)
def _non_agent_heads() -> frozenset[str]:
    return frozenset(word.lower() for word in string_list(_config(), "nonAgentHeads"))


_rate_limiter = RateLimiter(
    label="Retired Name",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class RetiredNameRateLimitError(StudioRateLimitError):
    """User exceeded the short-window retired-name quota."""


class RetiredNameGenerationError(StudioGenerationError):
    """Model output could not be turned into usable name lists."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise RetiredNameRateLimitError(str(exc)) from exc


def _scope(req: RetiredNameRequest, user_id: str, seed: int) -> VarietyScope:
    """One memory per theme (or one for mixed): that is what risks repeating."""
    bucket = bucket_key("mixed" if req.mixed_topics else req.theme)
    return VarietyScope(game=GAME, user_id=user_id, bucket=bucket, seed=seed)


def _first_budget(req: RetiredNameRequest) -> int:
    return min(int_value(_limits(), "maxFirstChars"), req.max_first_chars)


def _last_budget(req: RetiredNameRequest) -> int:
    return min(int_value(_limits(), "maxLastChars"), req.max_last_chars)


def _first_cap(req: RetiredNameRequest) -> int:
    return min(int_value(_limits(), "maxFirstPool"), req.first_count)


def _last_cap(req: RetiredNameRequest) -> int:
    return min(int_value(_limits(), "maxLastPool"), req.last_count)


# ---------------------------------------------------------------- words


def is_unsafe(text: str) -> bool:
    return bool(
        _MEDICAL_RE.search(text)
        or _FINANCE_RE.search(text)
        or _STEREOTYPE_RE.search(text)
        or _blocked_re().search(text)
    )


def _clean(raw: Any) -> str:
    if isinstance(raw, dict):
        raw = raw.get("name")
    text = re.sub(r"\s+", " ", str(raw or "")).replace("’", "'").strip()
    return text.strip(_EDGE_TRIM_CHARS)


def _title_word(word: str) -> str:
    """"tee-time" -> "Tee-Time", "CAP'N" -> "Cap'n". Case is the only repair."""
    return "-".join(part[:1].upper() + part[1:].lower() for part in word.split("-"))


def is_pronounceable(word: str) -> bool:
    """Every hyphen part is a sayable word: a vowel, no stutters, no consonant pile."""
    if not _WORD_RE.match(word):
        return False
    for part in word.lower().split("-"):
        letters = part.replace("'", "")
        if not (
            int_value(_limits(), "minWordLetters")
            <= len(letters)
            <= int_value(_limits(), "maxWordLetters")
        ):
            return False
        if not _VOWEL_RE.search(letters) or _TRIPLE_RE.search(letters):
            return False
        if _CONSONANT_RUN_RE.search(letters):
            return False
    return True


def is_agent_head(word: str) -> bool:
    """Reads as a person doing something: "Snoozer", "Collector", "Champ"."""
    head = word.lower().replace("'", "").split("-")[-1]
    if head in _agent_heads():
        return True
    non_agents = _non_agent_heads()
    if head in non_agents or any(
        head.endswith(thing) for thing in non_agents if len(thing) >= _NON_AGENT_SUFFIX_MIN
    ):
        return False
    return len(head) >= 5 and head.endswith(_AGENT_SUFFIXES)


def name_roots(name: str) -> list[str]:
    """The word roots two names are compared on (hyphen parts count as words)."""
    parts = _ROOT_SPLIT_RE.split(name.lower().replace("'", "").replace("’", ""))
    return [part for part in parts if len(part) >= _ROOT_MIN]


def _roots_clash(a: str, b: str) -> bool:
    """Same word, or one plainly grown from the other ("snoozy" / "snoozer")."""
    if a == b:
        return True
    shared = 0
    for x, y in zip(a, b):
        if x != y:
            break
        shared += 1
    return shared >= _ROOT_PREFIX_MIN and shared >= _ROOT_PREFIX_SHARE * min(len(a), len(b))


def names_clash(first: str, second: str) -> bool:
    """True when the two names share any word root -- too alike for one table."""
    return any(_roots_clash(a, b) for a in name_roots(first) for b in name_roots(second))


def last_names_repeat(first: str, second: str) -> bool:
    """True when two last names are the same name, give or take an ending."""
    a, b = name_roots(first), name_roots(second)
    if not a or not b or len(a) != len(b):
        return first.strip().casefold() == second.strip().casefold()
    return all(any(_roots_clash(x, y) for y in b) for x in a) and all(
        any(_roots_clash(y, x) for x in a) for y in b
    )


# ---------------------------------------------------------------- gates


def normalize_last_name(raw: Any, *, budget: int) -> str | None:
    """One last name as printed -- "Hammock Snoozer" -- or None."""
    words = _clean(raw).split(" ")
    if len(words) != 2 or not all(is_pronounceable(word) for word in words):
        return None
    if not is_agent_head(words[1]):
        return None
    name = " ".join(_title_word(word) for word in words)
    if not int_value(_limits(), "minLastChars") <= len(name) <= budget:
        return None
    if is_unsafe(name):
        return None
    return name


def normalize_first_name(raw: Any, *, budget: int) -> str | None:
    """One first name as printed -- "Captain", "Big Cheese" -- or None."""
    words = _clean(raw).split(" ")
    if not 1 <= len(words) <= 2 or not all(is_pronounceable(word) for word in words):
        return None
    # "Golf Pro" is a last name; in front of "Hammock Snoozer" it reads as two.
    if len(words) == 2 and is_agent_head(words[1]):
        return None
    name = " ".join(_title_word(word) for word in words)
    if not int_value(_limits(), "minFirstChars") <= len(name) <= budget:
        return None
    if is_unsafe(name):
        return None
    return name


def filter_first_names(raw_items: Iterable[Any], *, budget: int, cap: int) -> list[str]:
    """Valid first names, none sharing a root with one kept before it."""
    kept: list[str] = []
    for raw in raw_items:
        name = normalize_first_name(raw, budget=budget)
        if name is None or any(names_clash(name, other) for other in kept):
            continue
        kept.append(name)
        if len(kept) >= cap:
            break
    return kept


def filter_last_names(
    raw_items: Iterable[Any],
    *,
    budget: int,
    cap: int,
    avoid: Iterable[str] = (),
) -> list[str]:
    """Valid last names: distinct roots within the list, none already printed."""
    avoided = [label for label in (str(a or "").strip() for a in avoid) if label]
    kept: list[str] = []
    for raw in raw_items:
        name = normalize_last_name(raw, budget=budget)
        if name is None:
            continue
        if any(names_clash(name, other) for other in kept):
            continue
        if any(last_names_repeat(name, label) for label in avoided):
            continue
        kept.append(name)
        if len(kept) >= cap:
            break
    return kept


# ---------------------------------------------------------------- prompt


def _parse_payload(raw: str) -> tuple[list[Any], list[Any]]:
    data = parse_json_object(raw)
    first = data.get("first_names", data.get("firstNames", []))
    last = data.get("last_names", data.get("lastNames", []))
    if not isinstance(first, list) or not isinstance(last, list) or not (first or last):
        raise ValueError("invalid JSON: missing first_names and last_names")
    return first, last


def _first_briefs(want: int, seed: int) -> list[str]:
    """One brief per first name: a kind (title / nickname) and a flavour.

    Kinds follow a fixed ratio, rotated by seed, because good gender-neutral
    titles are scarcer than cheerful nicknames; flavours are shuffled.
    """
    rng = random.Random(seed)
    flavours = list(string_list(_config(), "firstFlavours"))
    rng.shuffle(flavours)
    cycle = string_list(_config(), "firstKindCycle")
    offset = rng.randrange(len(cycle))
    kinds = section(_config(), "firstKinds")
    return [
        f"F{index + 1}. {kinds[cycle[(index + offset) % len(cycle)]]}; "
        f"flavour: {flavours[index % len(flavours)]}"
        for index in range(want)
    ]


def _last_briefs(req: RetiredNameRequest, want: int, seed: int) -> list[str]:
    """One brief per last name: a pastime when mixed, a corner of the theme otherwise."""
    rng = random.Random(seed ^ 0x5F3759DF)
    if req.mixed_topics:
        pastimes = list(string_list(_config(), "pastimes"))
        rng.shuffle(pastimes)
        return [f"L{index + 1}. pastime: {pastimes[index % len(pastimes)]}" for index in range(want)]
    facets = list(string_list(_config(), "themeFacets"))
    rng.shuffle(facets)
    return [
        f"L{index + 1}. pastime: part of {req.theme.strip()}, through {facets[index % len(facets)]}"
        for index in range(want)
    ]


def _first_section(want: int, seed: int, budget: int) -> str:
    if want <= 0:
        return 'FIRST NAMES -- none are needed this time: return "first_names": [].'
    briefs = "\n".join(_first_briefs(want, seed))
    return f"""FIRST NAMES -- write exactly {want}, one per brief, in this order:
{briefs}
Each first name:
- ONE word (two short words only for a fixed nickname like "Big Cheese"), at
  most {budget} characters.
- Either a friendly title or rank (Captain, Admiral, Commodore, Professor,
  Coach, Skipper, Maestro) or a cheerful nickname (Sunny, Breezy, Mellow,
  Jolly, Dapper, Toasty), as its brief asks.
- Gender-neutral: anyone at the party may get it. Never Sir, Lady, Duke,
  Queen, Grandma, Mister or similar.
- Works in front of ANY last name, and does not itself sound like a last name.
- All different: no two share a word or a root, and no near-synonyms (not
  both "Sunny" and "Sunshine")."""


def _last_section(want: int, briefs: list[str], budget: int) -> str:
    if want <= 0:
        return 'LAST NAMES -- none are needed this time: return "last_names": [].'
    lines = "\n".join(briefs)
    return f"""LAST NAMES -- write exactly {want}, one per brief, in this order:
{lines}
Build each last name in this order:
1. "pastime": the retirement pastime from its brief, in plain words.
2. "name": EXACTLY two words -- a THING from that pastime, then a DOER word
   for someone who does it: "Hammock Snoozer", "Porch Rocker",
   "Crossword Champ", "Tomato Whisperer", "Biscuit Dunker", "Fairway Explorer".
Each last name:
- The second word names a person doing something: usually ending in -er
  ("Snoozer", "Wanderer", "Whisperer"), or a word like Champ, Pro, Whiz, Buff.
- At most {budget} characters in total. Easy to say out loud.
- Every last name uses a DIFFERENT doer word and a DIFFERENT thing: no
  repeats, no near-repeats ("Porch Rocker" and "Porch Swinger" are a repeat)."""


def _build_prompt(
    req: RetiredNameRequest,
    *,
    want_first: int,
    want_last: int,
    seed: int | None = None,
) -> str:
    prompt_seed = req.seed if seed is None else seed
    theme_line = (
        "Theme: everyday retirement life. Each last name follows its own pastime, "
        "so the table ranges across retirement life."
        if req.mixed_topics
        else f"Theme: {req.theme.strip()}. Every last name comes from a different "
        "corner of this theme; first names stay general."
    )
    first = _first_section(want_first, prompt_seed, _first_budget(req))
    last = _last_section(
        want_last, _last_briefs(req, want_last, prompt_seed), _last_budget(req)
    )

    return f"""Create names for a "What's Your Retired Name?" game in a large-print
retirement activity book, played by retirees, families and guests at
retirement parties.

How the game works: a reader finds the FIRST LETTER of their first name in an
A-Z list to get a new first name, and their BIRTH MONTH in a January-December
list to get a new last name, then says the two together. Every first name
will meet every last name, so every combination must sound like one
intentional, funny, friendly retiree name:
- Captain + Hammock Snoozer = "Captain Hammock Snoozer"
- Breezy + Porch Rocker = "Breezy Porch Rocker"
- Commodore + Tomato Whisperer = "Commodore Tomato Whisperer"

{theme_line}

{first}

{last}

Everything:
- Funny, warm and flattering: names people laugh at and happily say out loud.
  Retirees are capable, busy and having fun.
- Everyday English words anyone understands. Title Case. Letters only, with a
  hyphen or apostrophe at most.
- Never: age jokes (old, geezer, senior, fossil), insults (lazy, grumpy, slob,
  nutty), health, bodies, medicine, memory, loneliness, money worries, death,
  alcohol, gambling, politics, religion, romance or anything suggestive.
- Never: brand names, trademarks, celebrities, famous characters, or song,
  film or TV titles.

Return JSON only:
{{ "first_names": [ {{ "brief": 1, "name": "Captain" }} ],
  "last_names": [ {{ "brief": 1, "pastime": "napping in a hammock", "name": "Hammock Snoozer" }} ] }}
"""


async def _call_gemini(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        temperature=1.0,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=RetiredNameModelOutput,
        label="retired_name",
    )


def _still_wanted(cap: int, have: int, required: int, spare: int, first_attempt: bool) -> int:
    """How many to ask for: the full pool first, then the shortfall plus spares."""
    if first_attempt:
        return cap
    if have >= required:
        return 0
    return min(cap, required - have + spare)


async def generate_retired_name(req: RetiredNameRequest, user_id: str) -> RetiredNameResponse:
    _check_rate_limit(user_id)

    first_budget, last_budget = _first_budget(req), _last_budget(req)
    first_cap, last_cap = _first_cap(req), _last_cap(req)
    letters, months = int_value(_limits(), "letters"), int_value(_limits(), "months")
    attempts = int_value(_limits(), "maxAttempts")
    last_error = FINAL_ERROR
    started = time.perf_counter()
    kept_first: list[str] = []
    kept_last: list[str] = []
    # What this seller printed before: the client's list (spans workers and
    # restarts) plus this worker's own memory. A last name that repeats either
    # is dropped here, not just discouraged in the prompt.
    printed = [*req.avoid, *recent(_scope(req, user_id, req.seed), MEMORY_FILTER_LIMIT)]

    for attempt in range(attempts):
        want_first = _still_wanted(first_cap, len(kept_first), letters, RETRY_SPARE_FIRST, attempt == 0)
        want_last = _still_wanted(last_cap, len(kept_last), months, RETRY_SPARE_LAST, attempt == 0)
        if want_first == 0 and want_last == 0:
            break
        seed = req.seed + attempt * 97
        scope = _scope(req, user_id, seed)
        # Names already kept go into the avoid list, so a retry writes new ones.
        avoid = [*kept_last, *kept_first, *req.avoid]
        prompt = with_variety(
            _build_prompt(req, want_first=want_first, want_last=want_last, seed=seed),
            scope,
            client_avoid=avoid,
        )
        try:
            raw = await _call_gemini(prompt)
            first_raw, last_raw = _parse_payload(raw)
        except Exception as exc:
            logger.warning(
                "studio_retired_name_attempt_failed attempt=%s error=%s", attempt + 1, exc
            )
            last_error = "The AI did not return valid retired names. Please try again."
            continue

        kept_first = filter_first_names(
            [*kept_first, *first_raw], budget=first_budget, cap=first_cap
        )
        kept_last = filter_last_names(
            [*kept_last, *last_raw], budget=last_budget, cap=last_cap, avoid=printed
        )
        if len(kept_first) >= letters and len(kept_last) >= months:
            break
        last_error = (
            "Could not get enough clear retired names for a full table. "
            "Try again, or pick a broader theme."
        )

    if not kept_first and not kept_last:
        raise RetiredNameGenerationError(last_error)

    remember(_scope(req, user_id, req.seed), [*kept_last, *kept_first])
    logger.info(
        "studio_retired_name_generated model=%s latency_ms=%s first=%s last=%s mixed=%s",
        settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        len(kept_first),
        len(kept_last),
        req.mixed_topics,
    )
    return RetiredNameResponse(first_names=kept_first, last_names=kept_last)


def build_prompt_for_tests(
    req: RetiredNameRequest,
    *,
    want_first: int | None = None,
    want_last: int | None = None,
    seed: int | None = None,
) -> str:
    return _build_prompt(
        req,
        want_first=_first_cap(req) if want_first is None else want_first,
        want_last=_last_cap(req) if want_last is None else want_last,
        seed=seed,
    )


def parse_payload_for_tests(raw: str) -> tuple[list[Any], list[Any]]:
    return _parse_payload(raw)
