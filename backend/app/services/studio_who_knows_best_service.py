"""Generate Who Knows the Retiree Best? questions via Gemini.

A party game for a retirement activity book: coworkers, friends or family
each answer the same twelve questions about the retiree on their own sheet --
"What was the very first job they were paid for?", "Tea, coffee or hot
chocolate: which do they reach for first?" -- then the retiree reads out the
real answers and everyone scores a point per match.

The service writes questions only. It never knows the retiree and never
invents an answer: the retiree writes the real ones in the book. Nothing
about the retiree is sent here, not even a name.

Everything here is printed and sold on KDP, so a question only survives whole:

* **One clear question about them.** One sentence ending in a single question
  mark, about the retiree as "they/their/them" -- never a name, "he" or "she",
  and never the player as "you". Short enough for the lines its block allows.
* **Kind and private.** Nothing about age, health, weight, money,
  relationships, politics, religion, alcohol or anything embarrassing, no
  security-question details (addresses, a first pet's name, account numbers),
  and nothing that assumes a partner, children or a house. No quotations,
  brands or celebrities.
* **No repeats in meaning.** A question is folded to the detail it asks about
  -- question words and "favourite"/"usually" padding dropped, synonyms folded
  (coffee and tea are one drink; job, career and office are one working life)
  -- and compared with the Bucket List's meaning-level test, the model's own
  ``concept`` name included. So "What was their first job?" and "Where did
  they work first?" are one question. Checked within the reply, against what
  the client says the book already prints and against this worker's memory
  -- all bounded, never a comparison with every set ever made.

Variety is structural. Every question gets its own brief -- a topic, one of
its facets and a question shape (a past detail, a habit, a pick between named
options, a number, a prediction, something they are known for, one specific
pick) -- sampled by seed from seventeen topics and about two hundred facets.
A set plans twelve different topics, weighted by who is playing and capped
per group (no more than two food questions, three office ones...), always
with one about retirement plans, plus spares for the gates on both sides. The
client picks and orders the printed twelve.
"""

from __future__ import annotations

import asyncio
import logging
import random
import re
import time
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, Iterable, List, Mapping, Sequence, Tuple

from app.core.config import settings
from app.schemas.studio_who_knows_best import (
    WhoKnowsBestItem,
    WhoKnowsBestModelOutput,
    WhoKnowsBestRequest,
    WhoKnowsBestResponse,
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
    keys_repeat,
    normalize_concept,
    stem,
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

GAME = "who-knows-retiree-best"
FINAL_ERROR = "Could not write clear questions about the retiree this time. Please try again."
# Remembered questions a new one is checked against. Bounded, so the check
# stays a few thousand set comparisons however long a seller keeps going.
MEMORY_FILTER_LIMIT = 200
# Questions named in a retry prompt as already written.
RETRY_AVOID_LIMIT = 80
# The shared memory keeps labels this long; longer questions are cut on a word.
MEMORY_LABEL_CHARS = 60
ANSWER_SIZES: Tuple[str, ...] = ("word", "phrase", "sentence")
FUTURE_GROUP = "future"
# Always in a full set: it is a retirement book.
ANCHOR_TOPIC = "retirement-plans"

# The prompt's own examples. Printed word for word, they are the model copying.
EXAMPLE_QUESTIONS: Tuple[str, ...] = (
    "What was the very first job they were paid for?",
    "Tea, coffee or hot chocolate: which do they reach for first?",
    "What time did they usually walk in on a workday?",
    "What snack would they pack for a long train ride?",
    "What do they always say when something goes wrong?",
    "If they could open a little shop, what would it sell?",
)

# Mirrors AGE_STEREOTYPE_PATTERNS in
# frontend/src/utils/studio/retirement-word-search/content-quality.ts.
_STEREOTYPE_RE = re.compile(
    r"\bfrail\b|\bforgetful\b|\bsenile\b|\bold[\s-]?timer\b|\bdecline\b|"
    r"\bfeeble\b|\buseless\b",
    re.IGNORECASE,
)
_NUMBER_RE = re.compile(r"^\s*(q(uestion)?\s*\d+\s*[.):-]?\s+|\(?\d{1,2}\s*[.):]\s+|[-*•]\s+)", re.IGNORECASE)
# Letters (any script), digits, spaces and light punctuation: no quotation
# marks, no slash offering two questions, no emoji.
_ALLOWED_RE = re.compile(r"^[^\W_][\w ,'’\-–:?]*$")
# A second sentence hiding before the question.
_SENTENCE_BREAK_RE = re.compile(r"[.!;]")
_EDGE_TRIM_CHARS = "\"'“”‘’ "
_WORD_RE = re.compile(r"[^\W_]+")


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


def _limit(key: str) -> int:
    return int_value(_limits(), key)


def _words(key: str) -> frozenset[str]:
    return frozenset(word.lower() for word in string_list(_config(), key))


@lru_cache(maxsize=1)
def _qualifiers() -> frozenset[str]:
    words = _words("qualifierWords")
    return words | frozenset(stem(word) for word in words)


@lru_cache(maxsize=1)
def _synonyms() -> Mapping[str, str]:
    return {str(k).lower(): str(v).lower() for k, v in section(_config(), "synonyms").items()}


@lru_cache(maxsize=1)
def _phrases() -> Tuple[Tuple[re.Pattern[str], str], ...]:
    pairs = sorted(section(_config(), "phrases").items(), key=lambda kv: -len(kv[0]))
    return tuple(
        (re.compile(rf"\b{re.escape(str(phrase).lower())}\b"), str(repl).lower())
        for phrase, repl in pairs
    )


@lru_cache(maxsize=1)
def _blocked_re() -> re.Pattern[str]:
    brands = string_list(load_config("bucket-list"), "brandTerms")
    return word_pattern([*string_list(_config(), "blockedTerms"), *brands])


@lru_cache(maxsize=1)
def _saying_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "sayingTerms"))


_rate_limiter = RateLimiter(
    label="Who Knows the Retiree Best",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class WhoKnowsBestRateLimitError(StudioRateLimitError):
    """User exceeded the short-window Who Knows the Retiree Best? quota."""


class WhoKnowsBestGenerationError(StudioGenerationError):
    """Model output could not be turned into usable questions."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise WhoKnowsBestRateLimitError(str(exc)) from exc


def _scope(req: WhoKnowsBestRequest, user_id: str, seed: int) -> VarietyScope:
    """One memory per audience: that is what decides which questions risk repeating."""
    return VarietyScope(game=GAME, user_id=user_id, bucket=bucket_key(req.audience), seed=seed)


def _budget(req: WhoKnowsBestRequest) -> int:
    return min(_limit("maxQuestionChars"), req.max_question_chars)


# ---------------------------------------------------------------- topics


@dataclass(frozen=True)
class Topic:
    key: str
    label: str
    group: str
    audiences: Mapping[str, int]
    shapes: Tuple[str, ...]
    facets: Tuple[str, ...]

    def weight(self, audience: str) -> int:
        return int(self.audiences.get(audience, 0))


@dataclass(frozen=True)
class Slot:
    """One question to write: its topic, the facet to ask about and the shape to ask it in."""

    topic: Topic
    facet: int
    shape: str

    @property
    def facet_text(self) -> str:
        return self.topic.facets[self.facet % len(self.topic.facets)]


@lru_cache(maxsize=1)
def topics() -> Tuple[Topic, ...]:
    shapes = section(_config(), "shapes")
    out: List[Topic] = []
    for key, raw in section(_config(), "topics").items():
        own = tuple(str(s) for s in raw["shapes"] if s in shapes)
        out.append(
            Topic(
                key=str(key),
                label=str(raw["label"]),
                group=str(raw["group"]),
                audiences={str(k): int(v) for k, v in raw["audiences"].items()},
                shapes=own,
                facets=tuple(str(f) for f in raw["facets"]),
            )
        )
    return tuple(out)


@lru_cache(maxsize=1)
def _topic_index() -> Mapping[str, Topic]:
    return {topic.key: topic for topic in topics()}


def group_max(group: str) -> int:
    return int_value(section(section(_config(), "groups"), group), "max")


def shape_text(shape: str) -> str:
    return str(section(_config(), "shapes")[shape])


def eligible(audience: str) -> List[Topic]:
    """Topics players in this audience can answer, in data order."""
    return [topic for topic in topics() if topic.weight(audience) > 0]


def _weighted(rng: random.Random, pool: Sequence[Topic], audience: str) -> Topic:
    return rng.choices(list(pool), weights=[topic.weight(audience) for topic in pool], k=1)[0]


def plan_topics(audience: str, seed: int) -> List[Topic]:
    """Twelve different topics for the set, then the spares' topics.

    The set always asks about retirement plans; the rest is drawn by audience
    weight without repeats, never past a group's cap -- so a set cannot be
    four food questions or five office ones. Spares come from topics the set
    does not use yet, then a second question from the set's own topics.
    """
    rng = random.Random(seed)
    pool = eligible(audience)
    wanted = _limit("questions")
    index = _topic_index()
    primary: List[Topic] = [index[ANCHOR_TOPIC]] if ANCHOR_TOPIC in index else []
    groups: Counter[str] = Counter(topic.group for topic in primary)
    while len(primary) < wanted:
        open_ = [t for t in pool if t not in primary and groups[t.group] < group_max(t.group)]
        if not open_:
            break
        pick = _weighted(rng, open_, audience)
        primary.append(pick)
        groups[pick.group] += 1

    spares: List[Topic] = []
    unused = [t for t in pool if t not in primary]
    while len(spares) < _limit("spares") and unused:
        pick = _weighted(rng, unused, audience)
        spares.append(pick)
        unused.remove(pick)
    seconds = list(primary)
    rng.shuffle(seconds)
    while len(spares) < _limit("spares") and seconds:
        spares.append(seconds.pop())
    return primary + spares


def _assign(order: Sequence[Topic], rng: random.Random, facet_start: int = 0) -> List[Slot]:
    """Give each planned topic a facet (a different one per repeat) and a shape.

    Facets are shuffled per topic; each question takes the shape its topic
    allows that the set has used least so far, ties broken by seed -- so
    twelve questions spread over the shapes rather than twelve "favourites".
    """
    facet_order: Dict[str, List[int]] = {}
    used: Counter[str] = Counter()
    seen: Counter[str] = Counter()
    slots: List[Slot] = []
    for topic in order:
        if topic.key not in facet_order:
            indices = list(range(len(topic.facets)))
            rng.shuffle(indices)
            facet_order[topic.key] = indices
        n = seen[topic.key]
        seen[topic.key] += 1
        indices = facet_order[topic.key]
        facet = indices[(n + facet_start) % len(indices)]
        choices = list(topic.shapes) or ["top-pick"]
        rng.shuffle(choices)
        shape = min(choices, key=lambda s: used[s])
        used[shape] += 1
        slots.append(Slot(topic=topic, facet=facet, shape=shape))
    return slots


def plan_slots(req: WhoKnowsBestRequest) -> List[Slot]:
    """The questions this call writes, in brief order.

    A top-up names its own topics (those the client's set does not use yet)
    and how many questions it wants; otherwise the full set plus spares.
    """
    rng = random.Random(req.seed * 5 + 3)
    if req.topics:
        index = _topic_index()
        named: List[Topic] = []
        for key in req.topics:
            topic = index.get(key)
            if topic is not None and topic.weight(req.audience) > 0 and topic not in named:
                named.append(topic)
        if not named:
            return []
        count = min(_limit("maxAsk"), req.count or len(named))
        order = [named[i % len(named)] for i in range(count)]
        # A top-up follows a first call that used the leading facets.
        return _assign(order, rng, facet_start=1 + req.seed % 3)
    return _assign(plan_topics(req.audience, req.seed), rng)


# ---------------------------------------------------------------- text keys


def _fold(text: str) -> str:
    folded = text.lower().replace("’", "'")
    for pattern, replacement in _phrases():
        folded = pattern.sub(replacement, folded)
    return folded.replace("'s ", " ").replace("'", "")


def _plain_words(text: str) -> List[str]:
    """Lower-case words with apostrophes closed up: THEY'D -> theyd."""
    return _WORD_RE.findall(text.lower().replace("’", "'").replace("'", ""))


def question_tokens(text: str) -> frozenset[str]:
    """The detail a question asks about: question words and padding gone, synonyms folded."""
    out: set[str] = set()
    for word in _WORD_RE.findall(_fold(text)):
        if word in _qualifiers():
            continue
        canon = _synonyms().get(word) or _synonyms().get(stem(word)) or word
        canon = stem(canon)
        if canon in _qualifiers():
            continue
        out.add(canon)
    return frozenset(out)


def question_key(text: str, concept: str = "") -> IdeaKey:
    return IdeaKey(
        text=re.sub(r"\s+", " ", text).strip().lower(),
        tokens=question_tokens(text),
        concept=question_tokens(concept) if concept else frozenset(),
    )


def questions_repeat(first: str, second: str) -> bool:
    """True when a player would call two questions the same question."""
    return keys_repeat(question_key(first), question_key(second))


# ---------------------------------------------------------------- gates


def is_unsafe(text: str) -> bool:
    plain = text.replace("’", "'").replace("'", "")
    return bool(_STEREOTYPE_RE.search(plain) or _blocked_re().search(plain))


def _clean(raw: Any) -> str:
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    return text.strip(_EDGE_TRIM_CHARS)


def _mostly_lowercase(text: str) -> bool:
    letters = [ch for ch in text if ch.isalpha()]
    return bool(letters) and sum(ch.isupper() for ch in letters) <= len(letters) * 0.3


def normalize_question(raw: Any, *, budget: int) -> str | None:
    """One question as printed -- "What was the very first job they were paid for?" -- or None.

    One sentence ending in a single question mark, about the retiree as
    they/their/them, never the player or a gendered pronoun, kind and private,
    with a concrete detail left once the question words are gone.
    """
    text = _NUMBER_RE.sub("", _clean(raw)).strip(_EDGE_TRIM_CHARS)
    if not text or not text.endswith("?") or text.count("?") != 1:
        return None
    if not _ALLOWED_RE.match(text) or not text[0].isupper():
        return None
    if _SENTENCE_BREAK_RE.search(text[:-1]) or not _mostly_lowercase(text):
        return None
    if not _limit("minQuestionWords") <= len(text.split()) <= _limit("maxQuestionWords"):
        return None
    if not _limit("minQuestionChars") <= len(text) <= budget:
        return None
    words = set(_plain_words(text))
    if not words & _words("retireeWords"):
        return None
    if words & _words("readerWords") or words & _words("genderedWords"):
        return None
    if is_unsafe(text):
        return None
    # Only question words left: "What do they enjoy?" asks nothing in particular.
    if not question_tokens(text):
        return None
    if any(text.lower() == example.lower() for example in EXAMPLE_QUESTIONS):
        return None
    return text


def answer_floor(question: str) -> str:
    """The least room an answer needs: a saying or a story never fits on a short line."""
    return "sentence" if _saying_re().search(question) else "word"


def normalize_answer(raw: Any, question: str) -> str | None:
    """The room the answer needs -- "word", "phrase" or "sentence" -- or None."""
    size = _clean(raw).lower()
    if size not in ANSWER_SIZES:
        return None
    floor = answer_floor(question)
    return max(size, floor, key=ANSWER_SIZES.index)


def normalize_item(raw: Any, *, slot: Slot, budget: int) -> WhoKnowsBestItem | None:
    """One complete question -- or None. Never a repaired one."""
    if not isinstance(raw, dict):
        return None
    question = normalize_question(raw.get("question"), budget=budget)
    if question is None:
        return None
    answer = normalize_answer(raw.get("answer"), question)
    concept = normalize_concept(raw.get("concept"))
    # Straight from the model, a question carries the detail it asks about;
    # one it could not name is usually too broad to guess.
    if answer is None or not concept:
        return None
    return WhoKnowsBestItem(
        question=question,
        topic=slot.topic.key,
        shape=slot.shape,
        answer=answer,
        concept=concept,
    )


# ---------------------------------------------------------------- prompt


def briefs(asks: Sequence[Tuple[int, Slot]]) -> Tuple[List[str], Dict[int, int]]:
    """One numbered brief per question, and which slot each number fills."""
    lines: List[str] = []
    owners: Dict[int, int] = {}
    for number, (index, slot) in enumerate(asks, start=1):
        owners[number] = index
        lines.append(
            f"{number}. [{slot.topic.label}] {slot.facet_text} -- shape: {shape_text(slot.shape)}"
        )
    return lines, owners


def _build_prompt(
    asks: Sequence[Tuple[int, Slot]],
    *,
    audience: str,
    budget: int,
    locale: str,
) -> str:
    lines, _ = briefs(asks)
    want = len(lines)
    brief_block = "\n".join(lines)
    audience_line = str(section(section(_config(), "audiences"), audience)["line"])
    min_words = _limit("minQuestionWords")
    max_words = _limit("maxQuestionWords")
    favourites = _limit("favouriteMax")
    openings = _limit("openingMax")
    language = locale_line(section(_config(), "locale"), locale)
    examples = "\n".join(
        f'- "{question}" ({size})'
        for question, size in zip(
            EXAMPLE_QUESTIONS, ("phrase", "word", "word", "phrase", "sentence", "phrase")
        )
    )

    return f"""Write questions for "Who Knows the Retiree Best?", a party game in a
retirement activity book. Coworkers, friends or family each answer the same
twelve questions about the retiree on their own sheet, guessing what the
retiree would say. Then the retiree reads out the real answers and everyone
scores a point for each match. It should feel warm, playful and personal,
like a toast among people who like them -- never a test, an interview or a form.

{audience_line}

You do not know the retiree, and you never need to. Write questions that
anyone who knows them could guess at, each with one reasonably clear answer
the retiree can give. Never assume an answer or a fact about them.

Write exactly {want} questions, one per brief, in this order. Each brief names
a topic, the detail to ask about and the shape of the question:
{brief_block}

How to build each question -- in this order:
1. "concept": the one detail the question asks about, in 2 to 4 plain words,
   specific enough that two different questions never share it ("first paid
   job", "coffee order", "signature saying", "dream destination"; never just
   "food", "work" or "hobbies").
2. "question": one short question about that detail.
3. "answer": how much room a handwritten answer needs: "word" for a word, a
   name, a number or a time; "phrase" for a few words; "sentence" for a
   saying, a short story or anything that needs a line or two.

Strong questions are clear, specific and fun to guess (never copy these):
{examples}
Weak questions -- never write these kinds:
- Too broad, almost any answer fits: "What do they enjoy?", "What are they like?"
- The same detail twice in other words: "What was their first job?" beside "Where did they work first?"
- Intrusive or uncomfortable: their age, health, weight, money, relationships,
  politics, religion, or anything embarrassing.
- Private details: addresses, account numbers, a pet's name or anything that
  could be a security question.

Each question:
- Refers to the retiree only as "they", "their" or "them": no name, no "he"
  or "she", no "the retiree", and never speaks to the player as "you".
- One sentence ending with a single question mark; {min_words} to {max_words} words
  and at most {budget} characters. Eight to twelve words is ideal.
- Follows its brief's shape; if a shape truly does not suit the detail, keep
  the detail and use the closest natural shape.
- Asks about one detail with one reasonably clear answer the retiree could
  confirm: no two questions joined with "and".
- Varied across the set: open questions in different ways (What, Which,
  Where, How, Who, If...), use "favourite" at most {favourites} times, and never
  start more than {openings} questions with the same two words.
- Light, kind and respectful: gentle humour is welcome, but nothing that
  teases, embarrasses or talks down to them, and nothing about getting older.
- Works for anyone: do not assume a partner, children, grandchildren, pets,
  a house, a car, a religion or a particular country.
- Original wording: not a known quote, song lyric, film line or slogan, and
  not a question copied from a party game, printable or book.
- No brand names, celebrities, famous events or trademarks. No quotation marks.
{language}

Return JSON only:
{{ "items": [ {{ "brief": 1, "concept": "first paid job", "question": "What was the very first job they were paid for?", "answer": "phrase" }} ] }}
"""


def _parse_payload(raw: str) -> List[Any]:
    data = parse_json_object(raw)
    items = data.get("items", data.get("questions"))
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
        response_schema=WhoKnowsBestModelOutput,
        label="who_knows_best",
    )


# ---------------------------------------------------------------- generate


def _retry_slot(slot: Slot, attempt: int) -> Slot:
    """The same topic and shape on another facet, so a retry is not the same brief again."""
    return Slot(topic=slot.topic, facet=slot.facet + attempt, shape=slot.shape)


def _accept(
    items_raw: Iterable[Any],
    owners: Mapping[int, int],
    *,
    slots: Sequence[Slot],
    kept: Dict[int, WhoKnowsBestItem],
    accepted: List[IdeaKey],
    printed: Sequence[IdeaKey],
    budget: int,
) -> None:
    """File each valid, fresh question under the slot its brief belongs to."""
    for raw in items_raw:
        if not isinstance(raw, dict):
            continue
        index = owners.get(_brief_number(raw.get("brief")) or 0)
        if index is None or index in kept:
            continue
        item = normalize_item(raw, slot=slots[index], budget=budget)
        if item is None:
            continue
        key = question_key(item.question, item.concept)
        if any(keys_repeat(key, other) for other in accepted):
            continue
        if any(keys_repeat(key, other) for other in printed):
            continue
        kept[index] = item
        accepted.append(key)


async def generate_who_knows_best(req: WhoKnowsBestRequest, user_id: str) -> WhoKnowsBestResponse:
    _check_rate_limit(user_id)

    slots = plan_slots(req)
    if not slots:
        raise WhoKnowsBestGenerationError(FINAL_ERROR)
    budget = _budget(req)
    started = time.perf_counter()
    home = _scope(req, user_id, req.seed)
    # What this seller printed before: the client's list (spans workers and
    # restarts) plus this worker's own memory. A question that repeats either
    # is dropped here, not just discouraged in the prompt.
    printed = [question_key(label) for label in [*req.avoid, *recent(home, MEMORY_FILTER_LIMIT)]]
    kept: Dict[int, WhoKnowsBestItem] = {}
    accepted: List[IdeaKey] = []
    calls = 0

    for attempt in range(_limit("maxAttempts")):
        missing = [i for i in range(len(slots)) if i not in kept]
        if not missing:
            break
        asks = [(i, _retry_slot(slots[i], attempt)) for i in missing]
        written = [kept[i].question for i in sorted(kept)]
        seed = req.seed + attempt * 97
        prompt = _build_prompt(asks, audience=req.audience, budget=budget, locale=req.locale)
        prompt = with_variety(
            prompt,
            home.at_seed(seed),
            client_avoid=[*written, *req.avoid],
            limit=RETRY_AVOID_LIMIT if written else None,
        )
        calls += 1
        try:
            reply = await _call_gemini(prompt)
            items_raw = _parse_payload(reply)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 -- one bad call must not sink the set
            logger.warning("studio_who_knows_best_call_failed attempt=%s error=%s", attempt + 1, exc)
            continue
        _accept(
            items_raw,
            briefs(asks)[1],
            slots=_slot_map(slots, asks),
            kept=kept,
            accepted=accepted,
            printed=printed,
            budget=budget,
        )

    if not accepted:
        raise WhoKnowsBestGenerationError(FINAL_ERROR)

    questions = [kept[i] for i in sorted(kept)]
    remember(home, (memory_label(item.question) for item in questions))
    logger.info(
        "studio_who_knows_best_generated model=%s latency_ms=%s questions=%s wanted=%s calls=%s audience=%s top_up=%s",
        settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        len(questions),
        len(slots),
        calls,
        req.audience,
        bool(req.topics),
    )
    return WhoKnowsBestResponse(questions=questions)


def memory_label(question: str) -> str:
    """A question as remembered: whole, or cut on a word to fit the memory.

    The shared memory cuts labels at a fixed length; cut mid-word ("...leave
    tomorro") a long question would no longer match itself next time.
    """
    if len(question) <= MEMORY_LABEL_CHARS:
        return question
    cut = question[:MEMORY_LABEL_CHARS]
    return cut[: max(cut.rfind(" "), 1)].strip()


def _slot_map(slots: Sequence[Slot], asks: Sequence[Tuple[int, Slot]]) -> List[Slot]:
    """The slots as this attempt asked for them, retried facets included."""
    out = list(slots)
    for index, slot in asks:
        out[index] = slot
    return out


def build_prompt_for_tests(asks: Sequence[Tuple[int, Slot]], *, audience: str = "mixed") -> str:
    return _build_prompt(asks, audience=audience, budget=80, locale="en")


def parse_payload_for_tests(raw: str) -> List[Any]:
    return _parse_payload(raw)
