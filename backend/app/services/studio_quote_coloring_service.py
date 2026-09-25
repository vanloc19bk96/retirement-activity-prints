"""Generate Quote Coloring Page sayings via Gemini.

A Quote Coloring Page prints one short, original retirement saying as large
outline lettering, set in a decorative pattern, for the reader to color:

    Sunshine is my new schedule

The saying is the whole page and it is printed and sold on KDP, so nothing
reaches the page on the writer's word alone:

* **Shape first.** One idea, three to twelve words, one or two short sentences,
  within the character budget the page can letter at a colorable size.
  Numbering, labels, quotation marks, attributions ("-- Unknown"), digits,
  ellipses and anything shouted in capitals are dropped, not repaired. A
  closing full stop is removed, since display lettering does not carry one;
  that is the only edit, and the page letters the text exactly as returned.
* **Not a famous line.** Sayings that contain a stock quotation, slogan, lyric
  or greeting-card line ("live laugh love", "not all who wander are lost")
  are dropped outright. That list is only a floor: the blind check below is
  what judges originality.
* **A blind check.** A second call reads every saying cold and rates it:
  original (not a known quote, proverb, slogan, lyric or title, even lightly
  reworded), natural and correctly spelled, clear on a first reading, warm,
  suitable, and about retirement life. A saying survives only when every
  rating is true. If the check cannot run, nothing is returned.
* **No repeats, including repeated ideas.** Sayings are compared on their
  content words, with function words dropped and synonyms folded ("tea" /
  "coffee", "journey" / "travel"): "Retirement means more time for what
  matters" and "Retirement gives you more time for what really matters" are
  one saying. Checked within a reply, against what the client says the book
  and this seller already print, and against this worker's memory -- all
  bounded, so the check stays a few thousand token comparisons however long a
  seller keeps going.
* **Varied structure.** No more than two sayings in a reply may open with the
  same two words, so a page pool cannot be six "Retirement is ..." lines.
* **Nothing sensitive.** Age, health, memory, death, money worries,
  loneliness, spouses, alcohol, politics, religion, brands and celebrities
  are dropped.

Variety is structural. Each requested saying gets its own brief -- a topic, a
tone, a sentence form and a length band, shuffled by seed from ~90 topics, ~13
tones and 20 forms -- so two sellers on the same settings get different books,
and one seller's book does not read as one saying reworded forty times.
"""

from __future__ import annotations

import logging
import random
import re
import time
from collections import Counter
from functools import lru_cache
from typing import Any, Iterable, Mapping, Sequence

from app.core.config import settings
from app.schemas.studio_quote_coloring import (
    QuoteColoringCheckOutput,
    QuoteColoringItem,
    QuoteColoringModelOutput,
    QuoteColoringRequest,
    QuoteColoringResponse,
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

GAME = "quote-coloring"
FINAL_ERROR = (
    "Could not write a saying good enough to print for this theme. "
    "Try again, or pick a broader theme."
)
CHECK_ERROR = "Could not check the sayings for this page. Please try again."
# Remembered labels a new saying is checked against. Bounded, so the check
# stays cheap however many books a seller builds.
MEMORY_FILTER_LIMIT = 200
AVOID_LABEL_CHARS = 60
LENGTH_BANDS = ("short", "medium", "long")
# Character budgets under which a length band cannot fit at all.
_MEDIUM_MIN_CHARS = 30
_LONG_MIN_CHARS = 44

_ALLOWED_RE = re.compile(r"^[A-Za-z ,.'!?\-]+$")
_INNER_SENTENCE_RE = re.compile(r"[.!?]\s+[A-Z]")
_NUMBER_RE = re.compile(r"^\s*(\(?\d{1,2}[.):]\s+|[-*•]\s+)")
_LABEL_RE = re.compile(r"^\s*(saying|quote|line|text)\s*[:\-–]\s*", re.IGNORECASE)
# "... -- Unknown", "... - Mark Twain": an attributed line is a quotation.
_ATTRIBUTION_RE = re.compile(r"\s[-–—]{1,2}\s*[A-Z][\w.]*(?:\s+[A-Z][\w.]*)*\s*$")
_DASH_RE = re.compile(r"\s+[-–—]{1,2}\s+")
_EDGE_TRIM_CHARS = "\"“”‘’' "
_QUOTE_CHARS = ('"', "“", "”")
_TOKEN_RE = re.compile(r"[a-z]+")


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


@lru_cache(maxsize=1)
def _blocked_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "blockedTerms"))


@lru_cache(maxsize=1)
def _brand_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "brandTerms"))


@lru_cache(maxsize=1)
def _famous_re() -> re.Pattern[str]:
    return word_pattern(_fold(phrase) for phrase in string_list(_config(), "famousPhrases"))


@lru_cache(maxsize=1)
def _qualifiers() -> frozenset[str]:
    return frozenset(w.lower() for w in string_list(_config(), "qualifierWords"))


@lru_cache(maxsize=1)
def _aliases() -> Mapping[str, str]:
    raw = section(_config(), "aliases")
    return {str(k).lower(): str(v).lower() for k, v in raw.items()}


_rate_limiter = RateLimiter(
    label="Quote Coloring",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class QuoteColoringRateLimitError(StudioRateLimitError):
    """User exceeded the short-window Quote Coloring quota."""


class QuoteColoringGenerationError(StudioGenerationError):
    """Model output could not be turned into verified sayings."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise QuoteColoringRateLimitError(str(exc)) from exc


def _scope(req: QuoteColoringRequest, user_id: str, seed: int) -> VarietyScope:
    """One memory per theme, whatever the tone: a saying printed once must not come back."""
    bucket = bucket_key("mixed" if req.mixed_topics else req.theme)
    return VarietyScope(game=GAME, user_id=user_id, bucket=bucket, seed=seed)


# ---------------------------------------------------------------- text keys


def _fold(text: str) -> str:
    """Lower case, curly apostrophes straightened, punctuation other than apostrophes dropped."""
    folded = text.lower().replace("’", "'").replace("‘", "'")
    folded = re.sub(r"[^a-z' ]+", " ", folded)
    return re.sub(r"\s+", " ", folded).strip()


def is_unsafe(text: str) -> bool:
    return bool(_blocked_re().search(text) or _brand_re().search(text))


def is_famous(text: str) -> bool:
    """True when the saying contains a stock quotation, slogan or greeting-card line."""
    return bool(_famous_re().search(_fold(text)))


def _stem(token: str) -> str:
    """Fold plurals and regular verb endings. Deliberately crude."""
    if len(token) > 4 and token.endswith("ies"):
        return token[:-3] + "y"
    if len(token) > 4 and token.endswith(("ches", "shes", "sses", "xes", "zes")):
        return token[:-2]
    if len(token) > 5 and token.endswith("ing"):
        return token[:-3]
    if len(token) > 4 and token.endswith("ed"):
        return token[:-2]
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def _raw_tokens(text: str) -> list[str]:
    folded = text.lower().replace("’", "'").replace("'s ", " ").replace("'", "")
    return _TOKEN_RE.findall(folded)


def content_tokens(text: str) -> frozenset[str]:
    """The words that carry a saying's idea: function words dropped, synonyms folded."""
    aliases = _aliases()
    out: set[str] = set()
    for word in _raw_tokens(text):
        if word in _qualifiers():
            continue
        word = aliases.get(word, word)
        stemmed = _stem(word)
        out.add(aliases.get(stemmed, stemmed))
    return frozenset(out)


def _jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    union = a | b
    return len(a & b) / len(union) if union else 1.0


def sayings_repeat(first: str, second: str) -> bool:
    """True when a reader would call the two sayings the same line.

    Half their content words shared; one wholly inside the other at three
    words; or two words and a third of their meaning shared -- "Retirement
    means more time for what matters" and "Retirement gives you more time for
    what really matters" are one saying with a verb swapped.
    """
    a, b = content_tokens(first), content_tokens(second)
    if not a or not b:
        return _fold(first) == _fold(second)
    if min(len(a), len(b)) < 2:
        return a == b
    jaccard = _jaccard(a, b)
    if jaccard >= 0.5:
        return True
    if min(len(a), len(b)) >= 3 and (a <= b or b <= a):
        return True
    return len(a & b) >= 2 and jaccard >= 0.34


def opener_key(text: str) -> str:
    """The first two words, so "Retirement is ..." can only open so many sayings."""
    return " ".join(_raw_tokens(text)[:2])


def avoid_label(text: str) -> str:
    """Compact label for avoid lists: content words only, inside the label cap."""
    words = [w for w in _raw_tokens(text) if w not in _qualifiers()]
    out = ""
    for word in words:
        candidate = f"{out} {word}".strip()
        if len(candidate) > AVOID_LABEL_CHARS:
            break
        out = candidate
    return out or text[:AVOID_LABEL_CHARS]


# ---------------------------------------------------------------- gates


def _mostly_caps(text: str) -> bool:
    letters = [ch for ch in text if ch.isalpha()]
    return not letters or sum(ch.isupper() for ch in letters) > len(letters) * 0.4


def normalize_saying(raw: Any, *, max_chars: int) -> str | None:
    """The saying exactly as it will be lettered -- or None. Never a rewritten one.

    The only edits are mechanical: whitespace collapsed, curly apostrophes
    straightened, a spaced dash read as a comma, and a closing full stop
    dropped, since display lettering does not carry one.
    """
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    for pattern in (_NUMBER_RE, _LABEL_RE):
        text = pattern.sub("", text).strip()
    text = text.strip(_EDGE_TRIM_CHARS)
    if not text or any(q in text for q in _QUOTE_CHARS):
        return None
    if _ATTRIBUTION_RE.search(text):
        return None
    text = text.replace("’", "'").replace("‘", "'")
    text = _DASH_RE.sub(", ", text)
    if ".." in text or re.search(r"[,.!?]{2,}", text):
        return None
    if text.endswith(".") and text.count(".") == 1:
        text = text[:-1].rstrip()
    if not text or not _ALLOWED_RE.match(text):
        return None
    if not text[0].isupper() or _mostly_caps(text):
        return None
    # "word ,word" and "word,word" letter badly and read as typos.
    if re.search(r"\s[,.!?]", text) or re.search(r"[,.!?][A-Za-z]", text):
        return None
    if len(_INNER_SENTENCE_RE.findall(text)) > 1:
        return None
    limits = _limits()
    words = text.split(" ")
    if not int_value(limits, "minWords") <= len(words) <= int_value(limits, "maxWords"):
        return None
    longest = max(len(re.sub(r"[^A-Za-z]", "", word)) for word in words)
    if longest > int_value(limits, "maxWordLetters"):
        return None
    budget = min(max_chars, int_value(limits, "maxChars"))
    if not int_value(limits, "minChars") <= len(text) <= budget:
        return None
    if is_unsafe(text) or is_famous(text):
        return None
    # The prompt's example, handed back, is the model copying the shape sheet.
    if sayings_repeat(text, str(_config()["example"])):
        return None
    return text


def filter_sayings(
    raw_items: Iterable[Any],
    *,
    max_chars: int,
    cap: int,
    avoid: Iterable[str] = (),
    kept: Sequence[str] = (),
) -> list[str]:
    """Keep the well-formed sayings a page can letter without repeating the book.

    ``kept`` is what an earlier round already holds: nothing may repeat it,
    and its openers count toward the cap. ``raw_items`` may be writer items
    (objects with ``text``) or plain strings.
    """
    avoided = [label for label in (str(a or "").strip() for a in avoid) if label]
    max_opener = int_value(_limits(), "maxSameOpener")
    openers = Counter(opener_key(text) for text in kept)
    out: list[str] = []
    for raw in raw_items:
        value = raw.get("text") if isinstance(raw, Mapping) else raw
        text = normalize_saying(value, max_chars=max_chars)
        if text is None:
            continue
        if any(sayings_repeat(text, other) for other in (*kept, *out)):
            continue
        if any(sayings_repeat(text, label) for label in avoided):
            continue
        opener = opener_key(text)
        if openers[opener] >= max_opener:
            continue
        openers[opener] += 1
        out.append(text)
        if len(out) >= cap:
            break
    return out


# ---------------------------------------------------------------- the writer


def _parse_payload(raw: str) -> list[Any]:
    data = parse_json_object(raw)
    items = data.get("items", data.get("sayings"))
    if not isinstance(items, list) or not items:
        raise ValueError("invalid JSON: missing items")
    return items


def _tones(tone: str) -> list[str]:
    pools = section(_config(), "tones")
    if tone in pools:
        return list(string_list(pools, tone))
    return [t for name in sorted(pools) for t in string_list(pools, name)]


def _lengths(max_chars: int) -> list[str]:
    if max_chars < _MEDIUM_MIN_CHARS:
        return ["short"]
    if max_chars < _LONG_MIN_CHARS:
        return ["short", "medium"]
    return list(LENGTH_BANDS)


def _briefs(req: QuoteColoringRequest, want: int, seed: int) -> list[str]:
    """One distinct brief per saying: topic (when mixed), tone, form and length.

    Each pool is shuffled by seed independently, so the same topic meets a
    different form and tone on the next page, and no form repeats within a
    reply until every other one has been used.
    """
    rng = random.Random(seed)
    topics = list(string_list(_config(), "topics"))
    tones = _tones(req.tone)
    forms = list(string_list(_config(), "forms"))
    lengths = _lengths(req.max_chars)
    band_words = section(_config(), "lengths")
    for pool in (topics, tones, forms):
        rng.shuffle(pool)
    offset = rng.randrange(len(lengths))

    lines: list[str] = []
    for index in range(want):
        parts: list[str] = []
        if req.mixed_topics:
            parts.append(f"topic: {topics[index % len(topics)]}")
        parts.append(f"tone: {tones[index % len(tones)]}")
        parts.append(f"form: {forms[index % len(forms)]}")
        band = lengths[(index + offset) % len(lengths)]
        parts.append(f"length: {band_words[band]}")
        lines.append(f"{index + 1}. " + "; ".join(parts))
    return lines


def _build_prompt(req: QuoteColoringRequest, *, seed: int | None = None) -> str:
    limits = _limits()
    want = min(int_value(limits, "maxWrite"), req.count + 4)
    prompt_seed = req.seed if seed is None else seed
    language = locale_line(section(_config(), "locale"), req.locale)
    budget = min(req.max_chars, int_value(limits, "maxChars"))
    theme = str(_config()["mixedTheme"]) if req.mixed_topics else req.theme.strip()
    theme_rule = (
        "Each saying follows its own brief's topic, so the sayings range across retirement life."
        if req.mixed_topics
        else f"Every saying is about {theme}, each from a different corner of it."
    )
    briefs = "\n".join(_briefs(req, want, prompt_seed))
    max_words = int_value(limits, "maxWords")
    max_letters = int_value(limits, "maxWordLetters")

    return f"""Write short, original retirement sayings for a coloring book for retirees
and older adults. Each saying is printed on its own page in big outline letters
that the reader colors in, inside a decorative pattern. The saying is the whole
page: it has to be worth reading, and worth an hour of coloring.

Theme: {theme}
{theme_rule}

Write exactly {want} sayings, one per brief, in this order:
{briefs}

How to build each saying -- in this order:
1. "idea": the one thought behind it, in 3 to 8 words.
2. "text": the saying itself, exactly as it should be printed.

Every saying:
- Original: invent it in your own words. Never use, echo or lightly reword a
  famous quotation, proverb, slogan, song lyric, film or TV line, book title,
  catchphrase, greeting-card verse or a line from quote websites, posters or
  merchandise. If it sounds familiar, write something else.
- One clear idea, in natural, grammatical English that reads well aloud.
  Concrete and specific beats abstract: a porch, a map, a seed packet, a
  Tuesday with no meetings.
- Warm, positive and adult: a smile, an encouragement or a quiet pleasure.
  Never bitter, sarcastic, sentimental to the point of syrup, or childish.
- At most {budget} characters including spaces, at most {max_words} words, and
  no word longer than {max_letters} letters. One sentence, or two very short
  ones.
- Plain letters with ordinary punctuation only (comma, apostrophe, question
  or exclamation mark). No digits, quotation marks, dashes, colons, emoji,
  hashtags or ALL CAPS, and no full stop at the end.
- No attribution, no author, no numbering or labels.
- A different idea and a different opening every time. Never start two
  sayings with the same two words, and never write two versions of one idea.

Retirement here means freedom, time of one's own, hobbies, travel, friends,
creativity, the garden, slow mornings and new beginnings. Retirees are
capable, curious, busy people.

Never:
- Anything about age or being old, health, bodies, memory, decline, death,
  loneliness, money worries or pensions, spouses, alcohol, gambling, politics
  or religion, or anything that suggests retirement means doing nothing useful.
- Brand names, trademarks, celebrities, real people, places named after
  businesses, films, songs or characters.
{language}

Return JSON only:
{{ "items": [ {{ "brief": 1, "idea": "the day follows the weather now",
  "text": "{_config()["example"]}" }} ] }}
(That example shows the shape only. Never write about its idea.)
"""


async def _call_writer(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        temperature=1.0,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=QuoteColoringModelOutput,
        label="quote_coloring",
    )


# ---------------------------------------------------------------- the checker

CHECK_FLAGS = ("original", "natural", "clear", "positive", "suitable", "retirement")


def build_check_prompt(candidates: Sequence[str]) -> str:
    """A cold read of every saying, numbered, with nothing about how it was written."""
    sayings = "\n".join(f"{index + 1}. {text}" for index, text in enumerate(candidates))
    return f"""You are a strict editor for a published coloring book for retirees and
older adults. Each saying below will be printed alone on a page in big
letters and sold commercially. A copied, awkward, confusing or unsuitable
saying means refunds and a copyright complaint, so when in doubt, answer false.

For each numbered saying, answer:
- "original": NOT a famous quotation, proverb, idiom used as a slogan, song
  lyric, film or TV line, book title, catchphrase, advertising slogan or a
  line you have seen on posters, mugs, greeting cards or quote websites --
  including a lightly reworded or shortened version of one. False if you
  recognise it or it feels like a stock phrase.
- "natural": grammatical, correctly spelled, idiomatic English that a native
  speaker would say; no missing or doubled words; reads well aloud.
- "clear": the meaning is obvious on a first reading, with no guesswork, no
  specialist knowledge and no confusing wordplay.
- "positive": warm, cheerful, encouraging or peaceful; not bitter, sarcastic,
  sad, preachy or overly sentimental.
- "suitable": respectful of older adults and not childish. Nothing about age
  or being old, health, bodies, memory, decline, death, loneliness, money
  worries, spouses, alcohol, gambling, politics or religion; no stereotypes;
  does not imply retirement means being idle or useless; no brands, real
  people or characters.
- "retirement": clearly about retirement life -- free time, hobbies, travel,
  friends, slow days, a new chapter after work.

SAYINGS
{sayings}

Return JSON only, one entry per saying:
{{ "items": [ {{ "index": 1, "original": true, "natural": true, "clear": true,
  "positive": true, "suitable": true, "retirement": true }} ] }}
"""


def apply_check(candidates: Sequence[str], raw_check: Mapping[str, Any]) -> list[str]:
    """The candidates the checker passed on every count.

    A missing, duplicated or malformed entry fails the saying it belongs to.
    """
    entries: dict[int, Mapping[str, Any]] = {}
    duplicated: set[int] = set()
    for entry in raw_check.get("items") or []:
        if not isinstance(entry, Mapping):
            continue
        try:
            index = int(entry.get("index"))
        except (TypeError, ValueError):
            continue
        if index in entries:
            duplicated.add(index)
            continue
        entries[index] = entry
    kept: list[str] = []
    for index, text in enumerate(candidates):
        entry = entries.get(index + 1)
        if entry is None or index + 1 in duplicated:
            continue
        if all(entry.get(flag) is True for flag in CHECK_FLAGS):
            kept.append(text)
    return kept


async def _call_checker(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        # Deterministic judging, with room to reason: this call is what keeps
        # copied, awkward and unsuitable sayings out of a printed book.
        temperature=0.0,
        max_output_tokens=int_value(_limits(), "checkMaxOutputTokens"),
        response_schema=QuoteColoringCheckOutput,
        thinking_level="low",
        model=settings.STUDIO_FACT_CHECK_MODEL or None,
        label="quote_coloring_check",
    )


async def verify_sayings(candidates: Sequence[str]) -> list[str]:
    """Run the blind check. Raises when the check itself could not run."""
    if not candidates:
        return []
    raw = await _call_checker(build_check_prompt(candidates))
    return apply_check(candidates, parse_json_object(raw))


# ---------------------------------------------------------------- the run


def _min_items(cap: int) -> int:
    """Below this the page has too few spares, so another round is worth its cost."""
    return max(1, (cap + 1) // 2)


async def generate_quote_coloring(
    req: QuoteColoringRequest, user_id: str
) -> QuoteColoringResponse:
    _check_rate_limit(user_id)

    cap = min(int_value(_limits(), "poolSize"), req.count)
    attempts = int_value(_limits(), "maxAttempts")
    last_error = FINAL_ERROR
    started = time.perf_counter()
    kept: list[str] = []
    written = checked = 0
    # What this seller printed before: the client's list (spans workers and
    # restarts) plus this worker's own memory. A saying repeating either is
    # dropped here, not just discouraged in the prompt.
    printed = [*req.avoid, *recent(_scope(req, user_id, req.seed), MEMORY_FILTER_LIMIT)]

    for attempt in range(attempts):
        seed = req.seed + attempt * 97
        scope = _scope(req, user_id, seed)
        avoid = [*req.avoid, *(avoid_label(text) for text in kept)]
        prompt = with_variety(_build_prompt(req, seed=seed), scope, client_avoid=avoid)
        try:
            raw = await _call_writer(prompt)
            items_raw = _parse_payload(raw)
        except Exception as exc:
            logger.warning("studio_quote_coloring_write_failed attempt=%s error=%s", attempt + 1, exc)
            last_error = "The AI did not return valid sayings. Please try again."
            continue

        written += len(items_raw)
        candidates = filter_sayings(
            items_raw,
            max_chars=req.max_chars,
            cap=int_value(_limits(), "maxWrite"),
            avoid=printed,
            kept=kept,
        )
        checked += len(candidates)
        try:
            confirmed = await verify_sayings(candidates)
        except Exception as exc:
            logger.warning("studio_quote_coloring_check_failed attempt=%s error=%s", attempt + 1, exc)
            last_error = CHECK_ERROR
            continue

        # Re-run the pool rules over what survived, so the opener cap and the
        # repeat checks hold across rounds exactly as they do within one.
        if len(kept) < cap:
            kept.extend(
                filter_sayings(confirmed, max_chars=req.max_chars, cap=cap - len(kept), kept=kept)
            )
        if len(kept) >= _min_items(cap):
            break
        last_error = FINAL_ERROR

    if not kept:
        raise QuoteColoringGenerationError(last_error)

    remember(_scope(req, user_id, req.seed), (avoid_label(text) for text in kept))
    logger.info(
        "studio_quote_coloring_generated model=%s check_model=%s latency_ms=%s "
        "written=%s checked=%s verified=%s tone=%s mixed_topics=%s",
        settings.STUDIO_GEMINI_MODEL,
        settings.STUDIO_FACT_CHECK_MODEL or settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        written,
        checked,
        len(kept),
        req.tone,
        req.mixed_topics,
    )
    return QuoteColoringResponse(items=[QuoteColoringItem(text=text, verified=True) for text in kept])


def build_prompt_for_tests(req: QuoteColoringRequest, *, seed: int | None = None) -> str:
    return _build_prompt(req, seed=seed)


def parse_payload_for_tests(raw: str) -> list[Any]:
    return _parse_payload(raw)
