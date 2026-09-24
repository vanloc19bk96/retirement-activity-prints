"""Generate Fill-in Funnies: Retirement Edition stories via Gemini.

One activity is one short, original retirement story with numbered blanks.
The reader first writes a word for each numbered prompt ("Describing word", "A
coworker's name") without seeing the story, then copies the words into the
matching blanks and reads the result aloud. The fun is the surprise, so the
story has to work with *any* ordinary word of the kind it asked for.

Everything here is printed and sold on KDP, so a story only survives whole:

* **Every blank maps.** Placeholders are ``[1]``, ``[2]`` ... in order of first
  appearance, one kind per number, every number used, nothing left over. A
  number may appear again later (a callback), never before its first use.
* **Grammar that holds for any word.** No "a"/"an" in front of a blank (the
  reader's word may start with a vowel), no article in front of a place or a
  name. A blind second call then names the word classes each position accepts
  without being told the kind asked for; a story survives only when every
  blank's kind fits its position.
* **A real story.** A title, two to five short paragraphs, a clear beginning
  and ending, enough blanks to be funny and enough different kinds that the
  list is not "Noun 1 ... Noun 5".
* **No repeats.** Stories are compared on content words -- whole text, title
  and opening -- against each other, the client's book and this worker's
  memory, so "my first day of retirement" does not come back as "my second".
* **Nothing sensitive.** Health, ageing bodies, memory, money trouble,
  loneliness, death, politics, religion, alcohol, gambling, crude humour,
  brands and celebrities are dropped.

Variety is structural. Each requested story gets its own brief -- a situation,
a format, a humour pattern and a mix of blank kinds, sampled by seed -- so two
sellers on the same settings get different books.
"""

from __future__ import annotations

import logging
import random
import re
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Iterable, Mapping, Sequence

from app.core.config import settings
from app.schemas.studio_fill_in_funnies import (
    FillInFunniesCheckOutput,
    FillInFunniesModelOutput,
    FillInFunniesRequest,
    FillInFunniesResponse,
    FillInFunniesStory,
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

GAME = "fill-in-funnies"
FINAL_ERROR = (
    "Could not write a clear Fill-in Funnies story for this theme. "
    "Try again, or pick a broader theme."
)
CHECK_ERROR = "Could not check the story before printing. Please try again."
# Remembered labels a new story is checked against. Bounded, so the check
# stays cheap however long a seller keeps going.
MEMORY_FILTER_LIMIT = 200
AVOID_LABEL_CHARS = 60
# Whole-story overlap past which two stories read as one with the nouns swapped.
STORY_REPEAT_JACCARD = 0.45
# Compact labels (title + premise) are short, so they need more in common.
LABEL_REPEAT_JACCARD = 0.5
OPENING_TOKENS = 6
OPENING_SHARED = 4

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
PLACEHOLDER_RE = re.compile(r"\[(\d{1,2})\]")
_STORY_ALLOWED_RE = re.compile(r"^[A-Za-z0-9 ,.!?'’‘\"“”\-–—:;()&\[\]…]+$")
_TITLE_ALLOWED_RE = re.compile(r"^[A-Za-z0-9 ,.!?'’‘\-–—:&]+$")
_PARAGRAPH_END_RE = re.compile(r"[.!?…][\"”’')]*$")
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?…])[\"”’')]*\s+")
_EDGE_TRIM_CHARS = "\"'“”‘’ "
_WORD_EDGE_RE = re.compile(r"^[^A-Za-z0-9]+|[^A-Za-z0-9]+$")
_TOKEN_RE = re.compile(r"[a-z0-9]+")


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
def _qualifiers() -> frozenset[str]:
    return frozenset(word.lower() for word in string_list(_config(), "qualifierWords"))


@lru_cache(maxsize=1)
def blank_kinds() -> Mapping[str, Mapping[str, Any]]:
    return section(_config(), "blankKinds")


@lru_cache(maxsize=1)
def _slot_classes() -> Mapping[str, str]:
    return section(_config(), "slotClasses")


def _word_set(key: str) -> frozenset[str]:
    return frozenset(word.lower() for word in string_list(_config(), key))


_rate_limiter = RateLimiter(
    label="Fill-in Funnies",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class FillInFunniesRateLimitError(StudioRateLimitError):
    """User exceeded the short-window Fill-in Funnies quota."""


class FillInFunniesGenerationError(StudioGenerationError):
    """Model output could not be turned into a usable story."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise FillInFunniesRateLimitError(str(exc)) from exc


def _scope(req: FillInFunniesRequest, user_id: str, seed: int) -> VarietyScope:
    """One memory per theme (or one for mixed): that is what risks repeating."""
    bucket = bucket_key("mixed" if req.mixed_topics else req.theme)
    return VarietyScope(game=GAME, user_id=user_id, bucket=bucket, seed=seed)


@dataclass(frozen=True)
class Budgets:
    min_blanks: int
    max_blanks: int
    max_words: int


def budgets_for(req: FillInFunniesRequest) -> Budgets:
    """The request's budgets, held inside the service's hard limits."""
    limits = _limits()
    max_blanks = min(int_value(limits, "maxBlanks"), req.max_blanks)
    min_blanks = min(max(int_value(limits, "minBlanks"), req.min_blanks), max_blanks)
    return Budgets(
        min_blanks=min_blanks,
        max_blanks=max_blanks,
        max_words=min(int_value(limits, "maxWords"), req.max_words),
    )


# ---------------------------------------------------------------- text keys


def is_unsafe(text: str) -> bool:
    return bool(
        _MEDICAL_RE.search(text)
        or _FINANCE_RE.search(text)
        or _STEREOTYPE_RE.search(text)
        or _blocked_re().search(text)
        or _brand_re().search(text)
    )


def _stem(token: str) -> str:
    """Fold plurals so SOCK and SOCKS compare equal. Deliberately crude."""
    if len(token) > 4 and token.endswith("ies"):
        return token[:-3] + "y"
    if len(token) > 4 and token.endswith(("ches", "shes", "sses", "xes", "zes")):
        return token[:-2]
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def _raw_tokens(text: str) -> list[str]:
    folded = PLACEHOLDER_RE.sub(" ", text).lower().replace("’", "'").replace("'s ", " ")
    return _TOKEN_RE.findall(folded.replace("'", ""))


def _content_words(text: str) -> list[str]:
    return [_stem(word) for word in _raw_tokens(text) if word not in _qualifiers()]


def content_tokens(text: str) -> frozenset[str]:
    """The words that carry a text's meaning, qualifiers, blanks and plurals folded."""
    return frozenset(_content_words(text))


def _jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    union = a | b
    return len(a & b) / len(union) if union else 1.0


def story_text(story: FillInFunniesStory) -> str:
    return " ".join(story.paragraphs)


def stories_repeat(first: FillInFunniesStory, second: FillInFunniesStory) -> bool:
    """True when a reader would call the two stories the same activity.

    The same title, most of the story's words shared (the same story with a
    few nouns swapped), or the same opening ("On my first day of retirement"
    / "On my second day of retirement").
    """
    title_a, title_b = content_tokens(first.title), content_tokens(second.title)
    if title_a and title_a == title_b:
        return True
    text_a, text_b = story_text(first), story_text(second)
    if _jaccard(content_tokens(text_a), content_tokens(text_b)) >= STORY_REPEAT_JACCARD:
        return True
    open_a = frozenset(_content_words(text_a)[:OPENING_TOKENS])
    open_b = frozenset(_content_words(text_b)[:OPENING_TOKENS])
    return len(open_a & open_b) >= OPENING_SHARED


def avoid_label(story: FillInFunniesStory) -> str:
    """Compact label for avoid lists: title and premise content words, capped."""
    words = [w for w in _raw_tokens(f"{story.title} {story.premise}") if w not in _qualifiers()]
    out = ""
    for word in words:
        candidate = f"{out} {word}".strip()
        if len(candidate) > AVOID_LABEL_CHARS:
            break
        out = candidate
    return out or story.title[:AVOID_LABEL_CHARS]


def label_repeats(story: FillInFunniesStory, label: str) -> bool:
    """True when a compact label someone already printed names this story."""
    mine = content_tokens(avoid_label(story))
    theirs = content_tokens(label)
    if not mine or not theirs:
        return False
    return _jaccard(mine, theirs) >= LABEL_REPEAT_JACCARD


# ---------------------------------------------------------------- gates


def _clean(raw: Any) -> str:
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    return text.strip(_EDGE_TRIM_CHARS)


def normalize_kind(raw: Any) -> str | None:
    """A blank kind from the fixed list -- or None."""
    if isinstance(raw, Mapping):
        raw = raw.get("kind")
    kind = re.sub(r"[\s\-]+", "_", str(raw or "").strip().lower())
    return kind if kind in blank_kinds() else None


def normalize_title(raw: Any) -> str | None:
    limits = _limits()
    title = _clean(raw).rstrip(" .:;")
    if not title or not _TITLE_ALLOWED_RE.match(title):
        return None
    if not 3 <= len(title) <= int_value(limits, "maxTitleChars"):
        return None
    if len(title.split()) > int_value(limits, "maxTitleWords"):
        return None
    letters = [ch for ch in title if ch.isalpha()]
    if not letters or (len(letters) > 4 and all(ch.isupper() for ch in letters)):
        return None
    if is_unsafe(title):
        return None
    return title


def _mostly_lowercase(text: str) -> bool:
    letters = [ch for ch in text if ch.isalpha()]
    return bool(letters) and sum(ch.isupper() for ch in letters) <= len(letters) * 0.35


def _previous_word(paragraph: str, start: int) -> str:
    """The word read straight into a placeholder, lowercased; '' at a boundary.

    A blank glued to opening punctuation ("“[5]") or following the end of a
    clause has no word in front of it.
    """
    before = paragraph[:start]
    if not before or not before[-1].isspace():
        return ""
    chunk = before.split()[-1]
    if chunk[-1] in ".!?:;,…\"”)–—":
        return ""
    return _WORD_EDGE_RE.sub("", chunk).lower()


def _glued_to_word(paragraph: str, start: int, end: int) -> bool:
    """True for a blank inside a word ("super[3]", "[3]ville"); "[3]'s" is fine."""
    before = paragraph[start - 1] if start > 0 else ""
    after = paragraph[end] if end < len(paragraph) else ""
    return before.isalnum() or after.isalnum()


def story_problem(
    title: str, paragraphs: Sequence[str], blanks: Sequence[str], budgets: Budgets
) -> str | None:
    """Why a story may not print, or None when it may."""
    limits = _limits()
    if not int_value(limits, "minParagraphs") <= len(paragraphs) <= int_value(
        limits, "maxParagraphs"
    ):
        return "paragraph count"
    count = len(blanks)
    if not budgets.min_blanks <= count <= budgets.max_blanks:
        return "blank count"

    seen = 0
    callbacks = 0
    words = 0
    articles = _word_set("articleWords")
    determiners = _word_set("determinerWords")
    no_article = set(string_list(_config(), "noArticleKinds"))
    for paragraph in paragraphs:
        if not paragraph or not _STORY_ALLOWED_RE.match(paragraph):
            return "characters"
        if not _PARAGRAPH_END_RE.search(paragraph):
            return "paragraph ending"
        if not _mostly_lowercase(paragraph):
            return "shouting"
        stripped = PLACEHOLDER_RE.sub("", paragraph)
        if "[" in stripped or "]" in stripped or "][" in paragraph:
            return "malformed placeholder"
        paragraph_words = len(paragraph.split())
        if paragraph_words > int_value(limits, "maxParagraphWords"):
            return "paragraph length"
        words += paragraph_words
        for sentence in _SENTENCE_SPLIT_RE.split(paragraph):
            if len(sentence.split()) > int_value(limits, "maxSentenceWords"):
                return "sentence length"
        for match in PLACEHOLDER_RE.finditer(paragraph):
            number = int(match.group(1))
            if number == seen + 1:
                seen = number
            elif 1 <= number <= seen:
                callbacks += 1
            else:
                return "placeholder order"
            if number > count:
                return "placeholder without a kind"
            if _glued_to_word(paragraph, match.start(), match.end()):
                return "malformed placeholder"
            previous = _previous_word(paragraph, match.start())
            if previous in articles:
                return "article before a blank"
            if blanks[number - 1] in no_article and previous in determiners:
                return "article before a place or name"
    if seen != count:
        return "unused blank"
    if callbacks > int_value(limits, "maxCallbacks"):
        return "too many callbacks"
    if not int_value(limits, "minWords") <= words <= budgets.max_words:
        return "story length"

    kinds: dict[str, int] = {}
    for kind in blanks:
        kinds[kind] = kinds.get(kind, 0) + 1
    if max(kinds.values()) > int_value(limits, "maxKindRepeats"):
        return "one kind repeated"
    if len(kinds) < min(int_value(limits, "minDistinctKinds"), count):
        return "too few kinds"
    names = sum(kinds.get(kind, 0) for kind in string_list(_config(), "nameKinds"))
    if names > int_value(limits, "maxNameBlanks"):
        return "too many names"
    if is_unsafe(" ".join([title, *paragraphs])):
        return "unsafe"
    return None


def normalize_item(raw: Any, *, budgets: Budgets) -> FillInFunniesStory | None:
    """One complete story -- or None. Never a repaired one."""
    if not isinstance(raw, Mapping):
        return None
    title = normalize_title(raw.get("title"))
    if title is None:
        return None
    raw_paragraphs = raw.get("paragraphs")
    if not isinstance(raw_paragraphs, list):
        return None
    paragraphs = [re.sub(r"\s+", " ", str(p or "")).strip() for p in raw_paragraphs]
    paragraphs = [p for p in paragraphs if p]
    raw_blanks = raw.get("blanks")
    if not isinstance(raw_blanks, list):
        return None
    blanks: list[str] = []
    for index, entry in enumerate(raw_blanks):
        if isinstance(entry, Mapping) and "n" in entry:
            try:
                if int(entry.get("n")) != index + 1:
                    return None
            except (TypeError, ValueError):
                return None
        kind = normalize_kind(entry)
        if kind is None:
            return None
        blanks.append(kind)
    # Straight from the model, a story names its premise first; one that could
    # not is a list of gags, not a story. Stories already kept come back
    # without the check.
    premise = _clean(raw.get("premise"))[: int_value(_limits(), "maxPremiseChars")]
    if "brief" in raw and not premise:
        return None
    if story_problem(title, paragraphs, blanks, budgets) is not None:
        return None
    if premise and is_unsafe(premise):
        return None
    return FillInFunniesStory(
        title=title,
        paragraphs=paragraphs,
        blanks=blanks,
        premise=premise,
        topic=_clean(raw.get("topic"))[:60],
    )


def filter_stories(
    raw_items: Iterable[Any],
    *,
    budgets: Budgets,
    cap: int,
    avoid: Iterable[str] = (),
    kept: Sequence[FillInFunniesStory] = (),
) -> list[FillInFunniesStory]:
    """Keep the stories a page can print without repeating the book."""
    avoided = [label for label in (str(a or "").strip() for a in avoid) if label]
    out: list[FillInFunniesStory] = []
    if cap <= 0:
        return out
    for raw in raw_items:
        item = normalize_item(raw, budgets=budgets)
        if item is None:
            continue
        if any(stories_repeat(item, other) for other in [*kept, *out]):
            continue
        if any(label_repeats(item, label) for label in avoided):
            continue
        out.append(item)
        if len(out) >= cap:
            break
    return out


# ---------------------------------------------------------------- prompt


def _parse_payload(raw: str) -> list[Any]:
    data = parse_json_object(raw)
    items = data.get("stories", data.get("items"))
    if not isinstance(items, list) or not items:
        raise ValueError("invalid JSON: missing stories")
    return items


def _kind_lines() -> str:
    return "\n".join(
        f'- "{kind}": {spec["label"]} ({spec["hint"]})' for kind, spec in blank_kinds().items()
    )


def _briefs(req: FillInFunniesRequest, want: int, seed: int) -> list[str]:
    """One distinct brief per story: situation, format, humour and kinds.

    Every list is shuffled by seed independently, so the same situation meets a
    different format and humour pattern on the next page.
    """
    rng = random.Random(seed)
    scenarios = list(string_list(_config(), "scenarios"))
    formats = list(string_list(_config(), "formats"))
    twists = list(string_list(_config(), "twists"))
    for values in (scenarios, formats, twists):
        rng.shuffle(values)
    groups = section(_config(), "kindGroups")

    lines: list[str] = []
    for index in range(want):
        suggested = [rng.choice(list(string_list(groups, group))) for group in groups]
        rng.shuffle(suggested)
        parts = []
        if req.mixed_topics:
            parts.append(f"situation: {scenarios[index % len(scenarios)]}")
        else:
            parts.append(f"situation: a fresh, specific moment within {req.theme.strip()}")
        parts.append(f"written as: {formats[index % len(formats)]}")
        parts.append(f"humour: {twists[index % len(twists)]}")
        parts.append(f"blank kinds to include: {', '.join(dict.fromkeys(suggested))}")
        lines.append(f"{index + 1}. " + "; ".join(parts))
    return lines


def _build_prompt(req: FillInFunniesRequest, *, seed: int | None = None) -> str:
    want = min(int_value(_limits(), "poolSize"), req.count)
    prompt_seed = req.seed if seed is None else seed
    budgets = budgets_for(req)
    limits = _limits()
    language = locale_line(section(_config(), "locale"), req.locale)
    theme = str(_config()["mixedTheme"]) if req.mixed_topics else req.theme.strip()
    briefs = "\n".join(_briefs(req, want, prompt_seed))
    min_words = int_value(limits, "minWords")
    target_words = max(min_words + 10, budgets.max_words - 20)

    return f"""Write original "Fill-in Funnies" stories for a large-print retirement
activity book, read by retirees, couples, families and guests at retirement
parties. The reader first writes one word for each numbered prompt WITHOUT
seeing the story, then copies the words into the numbered blanks and reads the
story aloud. The laughs come from the reader's unexpected words landing in
just the right places.

Theme: {theme}

Write exactly {want} stories, one per brief, in this order:
{briefs}

How to build each story -- in this order:
1. "premise": one line naming the single situation the story is about.
2. "title": a short, warm title, 2 to {int_value(limits, "maxTitleWords")} words, no blanks in it
   (e.g. "My Grand Farewell Speech").
3. "paragraphs": {int_value(limits, "minParagraphs")} to {int_value(limits, "maxParagraphs")} short paragraphs that tell the story with a clear
   beginning and a satisfying ending. Blanks are written [1], [2], [3] ... in
   the order they first appear. The same number may appear once more later as
   a callback (at most {int_value(limits, "maxCallbacks")} callbacks), never before its first use.
4. "blanks": one entry per number, in order: {{ "n": 1, "kind": "adjective" }}.

Blank kinds -- use ONLY these kinds, spelled exactly:
{_kind_lines()}

Example of the shape (do not reuse its title, situation or wording):
{{ "brief": 1, "premise": "a retiree's thank-you speech at the office party",
  "title": "My Grand Farewell Speech",
  "paragraphs": [
    "Thank you all for coming to my [1] retirement party. After [2] years of meetings, I am finally free to spend my days [3].",
    "I will miss the [4] in the break room and the way [5] [6] into every Monday meeting.",
    "Tomorrow I set off for [7] with a suitcase full of [8]. If you need me, just shout \\"[9]!\\" and I will wave from my hammock."
  ],
  "blanks": [ {{ "n": 1, "kind": "adjective" }}, {{ "n": 2, "kind": "number" }},
    {{ "n": 3, "kind": "verb_ing" }}, {{ "n": 4, "kind": "household_item" }},
    {{ "n": 5, "kind": "coworker_name" }}, {{ "n": 6, "kind": "verb_past" }},
    {{ "n": 7, "kind": "place" }}, {{ "n": 8, "kind": "plural_noun" }},
    {{ "n": 9, "kind": "exclamation" }} ] }}

Each story:
- {budgets.min_blanks} to {budgets.max_blanks} numbered blanks, and about {target_words} words in total
  ({min_words} to {budgets.max_words}, each blank counting as one word). Sentences under
  {int_value(limits, "maxSentenceWords")} words; paragraphs under {int_value(limits, "maxParagraphWords")} words.
- At least {int_value(limits, "minDistinctKinds")} different kinds, no kind more than {int_value(limits, "maxKindRepeats")} times, and at most
  {int_value(limits, "maxNameBlanks")} name blanks. Include the brief's suggested kinds.
- Put blanks where a surprising word makes the sentence funny -- on the
  punchline words, not on filler. The story must stay funny whatever
  ordinary word of that kind the reader chooses.

Grammar -- every blank must read correctly with ANY word of its kind:
- NEVER put "a" or "an" directly before a blank (the reader's word may begin
  with a vowel). Use "the", "my", "one", "some" or a number instead.
- Never put "the", "my" or any other article before a Place or a name blank.
- "verb" blanks sit where the plain form reads right ("I love to [n]",
  "we all [n]"); "verb_ing" where an -ing word reads right; "verb_past" where
  a past-tense action reads right; "plural_noun" where several things read
  right ("a basket of [n]"); "adjective" before a noun or after "so"/"very";
  "adverb" after an action.
- A blank may be followed directly by punctuation or 's ("[5]'s desk").

Tone and content:
- Playful, warm, slightly silly and respectful -- adult, never childish.
- Retirement jokes about free time, sleeping in, hobbies, escaping meetings,
  travel, coffee, gardening, golf, crafts and weekday freedom are welcome.
- Do not assume a spouse, children, grandchildren, wealth, a house or one
  kind of career; anyone should be able to play.
- Never: health, illness, ageing bodies, memory lapses, loneliness, money
  worries, death, disability, politics, religion, alcohol, gambling, crude or
  bathroom humour, or jokes that mock older adults as slow, lazy or out of
  touch.
- Entirely original: no brand names, celebrities, characters, TV shows,
  films, songs, famous quotations or known jokes, and no wording from any
  published fill-in-the-blank game.
- Vary openings, sentence patterns and endings across stories; never reuse
  another story's structure with a few words swapped.
{language}

Return JSON only:
{{ "stories": [ {{ "brief": 1, "premise": "...", "title": "...",
  "paragraphs": ["...", "..."], "blanks": [ {{ "n": 1, "kind": "adjective" }} ] }} ] }}
"""


async def _call_writer(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        temperature=0.95,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=FillInFunniesModelOutput,
        label="fill_in_funnies",
    )


# ---------------------------------------------------------------- the checker


def build_check_prompt(candidates: Sequence[FillInFunniesStory]) -> str:
    """A prompt that never says which kind of word each blank asked for.

    The checker names every word class that reads naturally at each blank on
    the sentence alone, so a kind that does not fit its position cannot be
    confirmed just because the writer said so.
    """
    classes = "\n".join(f'- "{name}": {text}' for name, text in _slot_classes().items())
    blocks = []
    for index, story in enumerate(candidates):
        body = "\n".join(story.paragraphs)
        blocks.append(f"Story {index + 1}: {story.title}\n{body}\nBlanks: 1 to {len(story.blanks)}")
    stories = "\n\n".join(blocks)
    return f"""You are an editor checking fill-in-the-blank stories before they are
printed in a retirement activity book. A reader writes one word per numbered
blank without seeing the story, so every blank has to read correctly with any
ordinary word of the kind it needs.

Word classes:
{classes}

For each story, and for each blank number, list EVERY word class above that
would read naturally and grammatically in every place that number appears.
Judge the sentence around the blank only. A class that needs a word changed
next to the blank (such as "a" becoming "an") does not fit.

Then, for the story as a whole:
- "complete": true only if it has a clear beginning and a satisfying ending
  and reads as one piece.
- "funny": true only if the blanks sit where a surprising word makes the
  story funnier -- not on filler words.
- "suitable": true only if it is warm and respectful for retirees; free of
  health, ageing, memory, money worries, loneliness, death, disability,
  politics, religion, alcohol, gambling and crude humour; does not mock older
  adults; names no brands or celebrities; and quotes no song, film, famous
  saying or known joke.

STORIES
{stories}

Return JSON only, one entry per story, one entry per blank number:
{{ "stories": [ {{ "index": 1, "blanks": [ {{ "n": 1, "fits": ["adjective"] }} ],
  "complete": true, "funny": true, "suitable": true }} ] }}
"""


def _entries_by_index(raw: Any, key: str = "index") -> dict[int, Mapping[str, Any]]:
    out: dict[int, Mapping[str, Any]] = {}
    for entry in raw or []:
        if not isinstance(entry, Mapping):
            continue
        try:
            index = int(entry.get(key))
        except (TypeError, ValueError):
            continue
        out.setdefault(index, entry)
    return out


def _fits(raw: Any) -> frozenset[str]:
    if not isinstance(raw, list):
        return frozenset()
    return frozenset(re.sub(r"[\s\-]+", "_", str(v or "").strip().lower()) for v in raw)


def apply_check(
    candidates: Sequence[FillInFunniesStory], raw_check: Mapping[str, Any]
) -> list[FillInFunniesStory]:
    """The stories the checker independently confirmed.

    A story passes only when every blank's kind shares a word class with what
    the checker says its position accepts, and it is complete, funny and
    suitable. A missing, duplicated or malformed entry fails its story.
    """
    by_index = _entries_by_index(raw_check.get("stories"))
    kept: list[FillInFunniesStory] = []
    for index, story in enumerate(candidates):
        entry = by_index.get(index + 1)
        if entry is None:
            continue
        if not all(entry.get(flag) is True for flag in ("complete", "funny", "suitable")):
            continue
        blanks = _entries_by_index(entry.get("blanks"), "n")
        ok = True
        for number, kind in enumerate(story.blanks, start=1):
            accepted = frozenset(blank_kinds()[kind]["classes"])
            fits = _fits(blanks.get(number, {}).get("fits"))
            if not accepted & fits:
                ok = False
                break
        if ok:
            kept.append(story.model_copy(update={"verified": True}))
    return kept


async def _call_checker(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        # Deterministic judging: this call is what makes the grammar trustworthy.
        temperature=0.0,
        max_output_tokens=int_value(_limits(), "checkMaxOutputTokens"),
        response_schema=FillInFunniesCheckOutput,
        thinking_level="low",
        label="fill_in_funnies_check",
    )


async def verify_stories(candidates: Sequence[FillInFunniesStory]) -> list[FillInFunniesStory]:
    """Run the blind check. Raises when the check itself could not run."""
    if not candidates:
        return []
    raw = await _call_checker(build_check_prompt(candidates))
    return apply_check(candidates, parse_json_object(raw))


# ---------------------------------------------------------------- the run


async def generate_fill_in_funnies(
    req: FillInFunniesRequest, user_id: str
) -> FillInFunniesResponse:
    _check_rate_limit(user_id)

    budgets = budgets_for(req)
    cap = min(int_value(_limits(), "poolSize"), req.count)
    target = min(cap, int_value(_limits(), "targetStories"))
    attempts = int_value(_limits(), "maxAttempts")
    last_error = FINAL_ERROR
    started = time.perf_counter()
    kept: list[FillInFunniesStory] = []
    written = checked = 0
    # What this seller printed before: the client's list (spans workers and
    # restarts) plus this worker's own memory. A story that repeats either is
    # dropped here, not just discouraged in the prompt.
    printed = [*req.avoid, *recent(_scope(req, user_id, req.seed), MEMORY_FILTER_LIMIT)]

    for attempt in range(attempts):
        seed = req.seed + attempt * 97
        scope = _scope(req, user_id, seed)
        avoid = [*req.avoid, *(avoid_label(item) for item in kept)]
        prompt = with_variety(_build_prompt(req, seed=seed), scope, client_avoid=avoid)
        try:
            raw = await _call_writer(prompt)
            items_raw = _parse_payload(raw)
        except Exception as exc:
            logger.warning("studio_fill_in_funnies_write_failed attempt=%s error=%s", attempt + 1, exc)
            last_error = "The AI did not return a valid story. Please try again."
            continue

        written += len(items_raw)
        # Screened first, so the checker only spends tokens on stories that
        # could still print.
        candidates = filter_stories(
            items_raw, budgets=budgets, cap=cap - len(kept), avoid=printed, kept=kept
        )
        checked += len(candidates)
        try:
            confirmed = await verify_stories(candidates)
        except Exception as exc:
            logger.warning("studio_fill_in_funnies_check_failed attempt=%s error=%s", attempt + 1, exc)
            last_error = CHECK_ERROR
            continue

        kept.extend(confirmed)
        if len(kept) >= target:
            break
        last_error = FINAL_ERROR

    if not kept:
        raise FillInFunniesGenerationError(last_error)

    remember(_scope(req, user_id, req.seed), (avoid_label(item) for item in kept))
    logger.info(
        "studio_fill_in_funnies_generated model=%s latency_ms=%s written=%s checked=%s "
        "verified=%s mixed=%s",
        settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        written,
        checked,
        len(kept),
        req.mixed_topics,
    )
    return FillInFunniesResponse(stories=kept)


def build_prompt_for_tests(req: FillInFunniesRequest, *, seed: int | None = None) -> str:
    return _build_prompt(req, seed=seed)


def parse_payload_for_tests(raw: str) -> list[Any]:
    return _parse_payload(raw)
