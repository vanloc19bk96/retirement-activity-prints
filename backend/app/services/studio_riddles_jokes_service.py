"""Generate Retirement Riddles & Jokes items via Gemini.

An item is a short riddle or a clean joke, printed as a numbered question, with
its answer or punchline under the same number on the answer page:

    What is a retired baker's favourite part of the day?     (joke)
    Answer page: Loafing around.

This is printed and sold on KDP, and a joke that falls flat or a riddle with
two answers is the whole product failing, so nothing reaches the page on the
writer's word alone:

* **Shape first.** A setup is one or two short sentences ending in a single
  question mark; an answer is a short phrase or sentence with no question in
  it. A riddle's answer is a noun phrase and never already sits in its own
  setup. Labels ("Q:", "Answer:"), numbering, quotation marks, knock-knock
  jokes and anything over the page's budgets are dropped, not repaired.
* **A blind check.** A second call is shown every setup and every answer, the
  answers shuffled apart, and has to match each setup back to its answer
  without being told which is which. It then rates the pair: clear, a real
  payoff (a pun, a twist -- not a flat statement), one answer only, fresh (not
  a well-known joke lightly reworded) and suitable. An item survives only when
  the match comes back right and every rating is true. If the check cannot
  run, nothing is returned.
* **No repeats, including repeated ideas.** Items are compared on their
  content words, with function words, joke-frame words ("what do you call")
  and the retirement words every item shares dropped, and synonyms folded
  ("throw away" / "get rid of", "nap" / "snooze"). Two setups that share most
  of their words, or two distinctive words and a third of their meaning, are
  one joke; two answers with the same words are one riddle. Checked within a
  reply, against what the client says the book already prints, and against
  this worker's memory.
* **Varied structure.** No more than a few setups in a reply may open the same
  way, so a page cannot be eight "Why did the retiree ...?" jokes.
* **Nothing sensitive.** Age, memory, health, bodies, money, spouses, death,
  politics, religion, alcohol, gambling, brands and celebrities are dropped.

Variety is structural. Each requested item gets its own brief -- a kind, a
retirement topic, a format and a humour pattern, sampled by seed from ~70
topics, ~20 formats and a dozen patterns -- so two sellers on the same settings
get different books.
"""

from __future__ import annotations

import logging
import random
import re
import time
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Iterable, Mapping, Sequence

from app.core.config import settings
from app.schemas.studio_riddles_jokes import (
    RiddlesJokesCheckOutput,
    RiddlesJokesItem,
    RiddlesJokesModelOutput,
    RiddlesJokesRequest,
    RiddlesJokesResponse,
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

GAME = "riddles-and-jokes"
FINAL_ERROR = (
    "Could not write riddles and jokes good enough to print for this theme. "
    "Try again, or pick a broader theme."
)
CHECK_ERROR = "Could not check these riddles and jokes. Please try again."
# Remembered labels a new item is checked against. Bounded, so the check stays
# a few thousand token comparisons however long a seller keeps going.
MEMORY_FILTER_LIMIT = 200
AVOID_LABEL_CHARS = 60
KINDS = ("riddle", "joke")
# Answers this short are noun phrases: "A tree." and "An oak tree." are one answer.
SHORT_ANSWER_WORDS = 4

_MEDICAL_RE = re.compile(
    r"\bprevent\s+dementia\b|\breverse\s+aging\b|\bcures?\s+for\b|\banti[\s-]?aging\b",
    re.IGNORECASE,
)
_FINANCE_RE = re.compile(
    r"\bguaranteed\s+(return|income|profit)|\binvest\s+now\b|\bget[\s-]?rich\b|"
    r"\bcrypto|\bbitcoin\b|\bday[\s-]?trad|\bpenny\s+stock",
    re.IGNORECASE,
)
_ALLOWED_RE = re.compile(r"^[A-Za-z0-9 ,'’\-–().:;&!?]+$")
# A sentence break inside the text ("... every day. What am I?").
_INNER_SENTENCE_RE = re.compile(r"[.;:!]\s+[A-Z]")
_NUMBER_RE = re.compile(r"^\s*(\(?\d{1,2}[.):]\s+|[-*•]\s+)")
_SETUP_LABEL_RE = re.compile(r"^\s*(q|question|riddle|joke|setup)\s*[:\-–]\s*", re.IGNORECASE)
_ANSWER_LABEL_RE = re.compile(r"^\s*(answer|punchline|solution|a)\s*:\s*", re.IGNORECASE)
_EDGE_TRIM_CHARS = "\"'“”‘’ "
_QUOTE_CHARS = ('"', "“", "”")
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
    return frozenset(w.lower() for w in string_list(_config(), "qualifierWords"))


@lru_cache(maxsize=1)
def _aliases() -> Mapping[str, str]:
    raw = section(_config(), "aliases")
    return {str(k).lower(): str(v).lower() for k, v in raw.items()}


_rate_limiter = RateLimiter(
    label="Riddles & Jokes",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class RiddlesJokesRateLimitError(StudioRateLimitError):
    """User exceeded the short-window Riddles & Jokes quota."""


class RiddlesJokesGenerationError(StudioGenerationError):
    """Model output could not be turned into verified riddles and jokes."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise RiddlesJokesRateLimitError(str(exc)) from exc


def _scope(req: RiddlesJokesRequest, user_id: str, seed: int) -> VarietyScope:
    """One memory per theme: a riddle printed under any mix must not come back under another."""
    bucket = bucket_key("mixed" if req.mixed_topics else req.theme)
    return VarietyScope(game=GAME, user_id=user_id, bucket=bucket, seed=seed)


@dataclass(frozen=True)
class Budgets:
    setup: int
    answer: int


def budgets_for(req: RiddlesJokesRequest) -> Budgets:
    limits = _limits()
    return Budgets(
        setup=min(int_value(limits, "maxSetupChars"), req.max_setup_chars),
        answer=min(int_value(limits, "maxAnswerChars"), req.max_answer_chars),
    )


# ---------------------------------------------------------------- text keys


def is_unsafe(text: str) -> bool:
    return bool(
        _MEDICAL_RE.search(text)
        or _FINANCE_RE.search(text)
        or _blocked_re().search(text)
        or _brand_re().search(text)
    )


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
    """The words that carry an item's idea: frame and retirement words dropped, synonyms folded."""
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


def setups_repeat(first: str, second: str) -> bool:
    """True when a reader would call the two setups the same joke.

    Most of their words shared once both carry two words of substance ("What
    do you call a retired gardener who naps?" / "... a gardener who snoozes?");
    one wholly inside the other at three words; or two distinctive words and a
    third of their meaning shared -- "Why did the retiree throw away the alarm
    clock?" and "Why did the retired man get rid of his alarm clock?" are one
    joke with the nouns shuffled.
    """
    a, b = content_tokens(first), content_tokens(second)
    if not a or not b:
        return first.strip().lower() == second.strip().lower()
    if min(len(a), len(b)) < 2:
        return a == b
    jaccard = _jaccard(a, b)
    if jaccard >= 0.5:
        return True
    if min(len(a), len(b)) >= 3 and (a <= b or b <= a):
        return True
    return len(a & b) >= 2 and jaccard >= 0.34


def answers_repeat(first: str, second: str) -> bool:
    """True when two answers are the same answer: one riddle, or one punchline, twice.

    Short answers count as one when either sits wholly inside the other ("The
    alarm clock." / "Your old alarm clock!", "A tree." / "An oak tree.") --
    but a one-word answer only against another short one, so "Day." does not
    shadow every punchline that mentions a day.
    """
    a, b = content_tokens(first), content_tokens(second)
    if not a or not b:
        return first.strip().lower().rstrip(".!") == second.strip().lower().rstrip(".!")
    if a == b:
        return True
    small, large = sorted((a, b), key=len)
    short = max(len(first.split()), len(second.split())) <= SHORT_ANSWER_WORDS
    if small <= large and (len(small) >= 2 or short):
        return True
    return len(small) >= 3 and _jaccard(a, b) >= 0.6


def opener_key(setup: str) -> str:
    """The first three words, so "Why did the ...?" can only open so many setups."""
    return " ".join(_raw_tokens(setup)[:3])


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


def item_labels(item: RiddlesJokesItem) -> list[str]:
    """What a printed item is remembered by: its setup and its answer."""
    return [avoid_label(item.setup), avoid_label(item.answer)]


# ---------------------------------------------------------------- gates


def _clean(raw: Any) -> str:
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    return text.strip(_EDGE_TRIM_CHARS)


def _mostly_caps(text: str) -> bool:
    letters = [ch for ch in text if ch.isalpha()]
    return not letters or sum(ch.isupper() for ch in letters) > len(letters) * 0.4


def _plain(text: str) -> bool:
    """Printable, one or two sentences, starting with a capital, not shouted."""
    if any(q in text for q in _QUOTE_CHARS):
        return False
    if not _ALLOWED_RE.match(text):
        return False
    if len(_INNER_SENTENCE_RE.findall(text)) > 1:
        return False
    return text[0].isupper() and not _mostly_caps(text)


def normalize_setup(raw: Any, *, budget: int) -> str | None:
    """The question the reader sees, ending in its only question mark -- or None."""
    text = _clean(raw)
    for pattern in (_NUMBER_RE, _SETUP_LABEL_RE):
        text = pattern.sub("", text).strip()
    text = text.strip(_EDGE_TRIM_CHARS)
    if not text or not text.endswith("?") or text.count("?") != 1 or "!" in text:
        return None
    if not _plain(text):
        return None
    limits = _limits()
    if len(text.split()) > int_value(limits, "maxSetupWords"):
        return None
    if not int_value(limits, "minSetupChars") <= len(text) <= budget:
        return None
    if is_unsafe(text):
        return None
    return text


def normalize_answer(raw: Any, *, budget: int, kind: str) -> str | None:
    """The answer or punchline as printed, ending in a full stop or "!" -- or None."""
    text = _clean(raw)
    for pattern in (_NUMBER_RE, _ANSWER_LABEL_RE):
        text = pattern.sub("", text).strip()
    text = text.strip(_EDGE_TRIM_CHARS)
    if not text or "?" in text or not _plain(text):
        return None
    if text[-1] not in ".!":
        if not (text[-1].isalnum() or text[-1] == ")"):
            return None
        text = f"{text}."
    limits = _limits()
    words = "maxRiddleAnswerWords" if kind == "riddle" else "maxAnswerWords"
    if len(text.split()) > int_value(limits, words):
        return None
    if not int_value(limits, "minAnswerChars") <= len(text) <= budget:
        return None
    if is_unsafe(text):
        return None
    return text


def _gives_itself_away(kind: str, setup: str, answer: str) -> bool:
    """A riddle whose answer already sits in its setup has nothing left to guess."""
    answer_tokens = content_tokens(answer)
    setup_tokens = content_tokens(setup)
    if not answer_tokens:
        return False
    if kind == "riddle":
        return answer_tokens <= setup_tokens
    return answer_tokens == setup_tokens


def _examples() -> list[Mapping[str, Any]]:
    example = section(_config(), "example")
    return [section(example, kind) for kind in KINDS]


def _mix_allows(mix: str, kind: str) -> bool:
    return mix == "both" or mix == f"{kind}s"


def normalize_item(raw: Any, *, budgets: Budgets, mix: str = "both") -> RiddlesJokesItem | None:
    """One complete, well-formed item -- or None. Never a repaired one.

    Well-formed is not funny: this is every check that can be made without
    reading the joke. The blind check decides the rest.
    """
    if not isinstance(raw, dict):
        return None
    kind = str(raw.get("kind") or "").strip().lower()
    if kind not in KINDS or not _mix_allows(mix, kind):
        return None
    setup = normalize_setup(raw.get("setup"), budget=budgets.setup)
    if setup is None:
        return None
    answer = normalize_answer(raw.get("answer"), budget=budgets.answer, kind=kind)
    if answer is None or _gives_itself_away(kind, setup, answer):
        return None
    # The prompt's examples, handed back, are the model copying the shape sheet.
    for example in _examples():
        if setups_repeat(setup, str(example["setup"])) or answers_repeat(answer, str(example["answer"])):
            return None
    # Never verified here, whatever the input claims: only the checker marks an item.
    return RiddlesJokesItem(kind=kind, setup=setup, answer=answer)  # type: ignore[arg-type]


def items_repeat(item: RiddlesJokesItem, other: RiddlesJokesItem) -> bool:
    return setups_repeat(item.setup, other.setup) or answers_repeat(item.answer, other.answer)


def _repeats_label(item: RiddlesJokesItem, labels: Sequence[str]) -> bool:
    return any(
        setups_repeat(item.setup, label) or answers_repeat(item.answer, label) for label in labels
    )


def filter_items(
    raw_items: Iterable[Any],
    *,
    budgets: Budgets,
    cap: int,
    mix: str = "both",
    avoid: Iterable[str] = (),
    kept: Sequence[RiddlesJokesItem] = (),
) -> list[RiddlesJokesItem]:
    """Keep the well-formed items a page can print without repeating the book.

    ``kept`` is what an earlier round already holds: nothing may repeat it, and
    its openers count toward the cap.
    """
    avoided = [label for label in (str(a or "").strip() for a in avoid) if label]
    max_opener = int_value(_limits(), "maxSameOpener")
    openers = Counter(opener_key(item.setup) for item in kept)
    out: list[RiddlesJokesItem] = []
    for raw in raw_items:
        item = normalize_item(raw, budgets=budgets, mix=mix)
        if item is None:
            continue
        if any(items_repeat(item, other) for other in (*kept, *out)):
            continue
        if _repeats_label(item, avoided):
            continue
        opener = opener_key(item.setup)
        if openers[opener] >= max_opener:
            continue
        openers[opener] += 1
        out.append(item)
        if len(out) >= cap:
            break
    return out


# ---------------------------------------------------------------- the writer


def _parse_payload(raw: str) -> list[Any]:
    data = parse_json_object(raw)
    items = data.get("items", data.get("jokes", data.get("riddles")))
    if not isinstance(items, list) or not items:
        raise ValueError("invalid JSON: missing items")
    return items


def _kinds(mix: str, want: int, rng: random.Random) -> list[str]:
    if mix in ("riddles", "jokes"):
        return [mix[:-1]] * want
    first = rng.randrange(2)
    return [KINDS[(first + index) % 2] for index in range(want)]


def _briefs(req: RiddlesJokesRequest, want: int, seed: int) -> list[str]:
    """One distinct brief per item: kind, topic (when mixed), format and humour pattern.

    Topics, formats and patterns are shuffled by seed independently, so the
    same topic meets a different format on the next page, and no format repeats
    within a reply until every other one of its kind has been used.
    """
    rng = random.Random(seed)
    topics = list(string_list(_config(), "topics"))
    angles = list(string_list(_config(), "angles"))
    formats = {kind: list(string_list(section(_config(), "formats"), kind)) for kind in KINDS}
    rng.shuffle(topics)
    rng.shuffle(angles)
    for pool in formats.values():
        rng.shuffle(pool)
    used: Counter[str] = Counter()

    lines: list[str] = []
    for index, kind in enumerate(_kinds(req.mix, want, rng)):
        pool = formats[kind]
        shape = pool[used[kind] % len(pool)]
        used[kind] += 1
        parts = [f"kind: {kind}"]
        if req.mixed_topics:
            parts.append(f"topic: {topics[index % len(topics)]}")
        parts.append(f"format: {shape}")
        parts.append(f"humour: {angles[index % len(angles)]}")
        lines.append(f"{index + 1}. " + "; ".join(parts))
    return lines


def _build_prompt(req: RiddlesJokesRequest, *, seed: int | None = None) -> str:
    limits = _limits()
    want = min(int_value(limits, "maxWrite"), req.count + 4)
    prompt_seed = req.seed if seed is None else seed
    language = locale_line(section(_config(), "locale"), req.locale)
    budgets = budgets_for(req)
    theme = str(_config()["mixedTheme"]) if req.mixed_topics else req.theme.strip()
    theme_rule = (
        "Each item follows its own brief's topic, so the page ranges across retirement life."
        if req.mixed_topics
        else f"Every item is about {theme}, each from a different corner of it."
    )
    mix_rule = str(section(_config(), "mixes").get(req.mix, ""))
    briefs = "\n".join(_briefs(req, want, prompt_seed))
    riddle, joke = _examples()
    setup_words = int_value(limits, "maxSetupWords")
    riddle_words = int_value(limits, "maxRiddleAnswerWords")
    answer_words = int_value(limits, "maxAnswerWords")

    return f"""Create riddles and clean jokes for a large-print retirement activity book,
read by retirees and older adults, couples, families and guests at retirement
parties. Each item is printed as a numbered question. The reader tries to
guess the answer, then checks the answer page.

Theme: {theme}
{theme_rule}
{mix_rule}

Write exactly {want} items, one per brief, in this order:
{briefs}

How to build each item -- in this order:
1. "kind": the kind the brief names, "riddle" or "joke".
2. "idea": the one comic idea in 3 to 8 words.
3. "setup": the question the reader sees, in the brief's format.
4. "answer": the answer or punchline printed on the answer page.

Riddles:
- Clues that lead logically to ONE everyday answer any adult knows. A reader
  who thinks for a moment can get it, or smiles when they see it.
- The answer is a short noun phrase of 1 to {riddle_words} words.
- The setup never contains the answer word.
- No tricks that depend on spelling, letters, numbers, awkward grammar or a
  misspelling, and no answer that is only right under one reading.

Jokes:
- A short question with a punchline that pays it off: a pun, a double meaning,
  a twist or a warm, wry truth about retirement life.
- The punchline is one short sentence of at most {answer_words} words -- a payoff,
  never an explanation.

Every item:
- setup: one or two short sentences, at most {budgets.setup} characters and
  {setup_words} words, ending with a single question mark. Reads naturally aloud.
- answer: at most {budgets.answer} characters. No question mark.
- Everyday words. No specialist knowledge, no obscure wordplay, no multi-step
  reasoning, and not so obvious that there is nothing to guess.
- Original: invent new riddles and jokes in your own words. Never reuse or
  lightly reword a well-known joke or riddle ("What has hands but can't clap?",
  "Why did the chicken cross the road?"), or anything from a joke book,
  website, TV show, film, song, catchphrase or famous quotation.
- A different idea every time: never two items on the same comic idea or with
  the same answer, even with the nouns changed.
- Vary the wording. Use the format the brief names; never start more than two
  setups with the same three words.
- For adults: warm, witty and respectful, never childish. No knock-knock jokes.
- No quotation marks, numbering, labels ("Q:", "Answer:") or emoji.

The humour celebrates the good parts of retirement: free time, weekday
freedom, sleeping in, naps, coffee, hobbies, gardening, golf, travel, friends,
family, retirement parties, and life without meetings or alarm clocks.
Retirees are capable, busy, cheerful people.

Never:
- Jokes about age or being old, memory or forgetting, health, doctors, ageing
  bodies, teeth, hearing or eyesight, bathrooms, death, disability, money
  worries or pensions, loneliness, nagging spouses, divorce, sex, alcohol,
  gambling, politics or religion, or anything crude, mean or embarrassing.
- Stereotypes about retirees, or assuming every retiree has a spouse,
  grandchildren, money, a house or an office career.
- Brand names, trademarks, celebrities, real people, TV shows, films, songs or
  characters.
{language}

Return JSON only:
{{ "items": [
  {{ "brief": 1, "kind": "riddle", "idea": "old work tie now just hangs around",
    "setup": "{riddle['setup']}", "answer": "{riddle['answer']}" }},
  {{ "brief": 2, "kind": "joke", "idea": "baker who retired is loafing",
    "setup": "{joke['setup']}", "answer": "{joke['answer']}" }} ] }}
(Those examples show the shape only. Never write about their topics.)
"""


async def _call_writer(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        temperature=0.95,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=RiddlesJokesModelOutput,
        label="riddles_jokes",
    )


# ---------------------------------------------------------------- the checker


def _letter(position: int) -> str:
    return chr(65 + position)


@dataclass(frozen=True)
class CheckPlan:
    """How the candidates were shown to the checker, so its reply maps back.

    ``answer_order[pos]`` is the candidate whose answer is shown at letter
    ``pos`` (A = 0).
    """

    prompt: str
    answer_order: tuple[int, ...]


def build_check_plan(candidates: Sequence[RiddlesJokesItem], seed: int) -> CheckPlan:
    """A prompt that never says which answer belongs to which setup.

    Setups keep their numbers; answers are shuffled and lettered, so the
    checker has to find each punchline from the setup alone. A punchline that
    does not follow from its setup gets matched wrong, and a riddle whose
    answer is not the only fit is caught when another answer fits as well.
    """
    rng = random.Random(seed ^ 0x51DD1E)
    order = list(range(len(candidates)))
    rng.shuffle(order)
    setups = "\n".join(
        f"{index + 1}. ({item.kind}) {item.setup}" for index, item in enumerate(candidates)
    )
    answers = "\n".join(
        f"{_letter(pos)}. {candidates[k].answer}" for pos, k in enumerate(order)
    )

    prompt = f"""You are a strict editor for a published, large-print book of riddles and
clean jokes for retirees and older adults. A confusing, flat, copied or
unsuitable item means refunds, so when in doubt, answer false.

Below are numbered SETUPS and lettered ANSWERS. Each setup was written with
exactly one of the answers, but the answers are shuffled: their order means
nothing.

Step 1 -- For each setup, pick the letter of the answer that fits it best,
judging from the setup itself. Use "none" if no answer truly fits.

Step 2 -- Judge that setup together with the answer you picked:
- "clear": the setup is easy to understand on a first reading, grammatical,
  and needs no specialist knowledge; the answer makes sense the moment it is
  read.
- "payoff": it is a real riddle or joke. The answer is a clever solution or a
  genuine punchline tied to the setup (a pun, a double meaning, a twist), not
  a random or flat statement, and not so obvious there is nothing to guess.
- "one_answer": for a riddle, the clues point to this answer and to no other
  equally reasonable one; for a joke, the punchline is the natural payoff.
- "fresh": NOT a well-known joke or riddle, famous comedy line, catchphrase,
  quotation, lyric or film or TV line, even lightly reworded. False if you
  have seen essentially this setup and answer before.
- "suitable": clean, kind and respectful. Nothing about age or being old,
  memory or forgetting, health, bodies, death, disability, money worries,
  loneliness, spouses, sex, alcohol, gambling, politics or religion; no
  mocking of older people and no stereotypes; no brands, celebrities or
  characters.

SETUPS
{setups}

ANSWERS
{answers}

Return JSON only, one entry per setup:
{{ "items": [ {{ "index": 1, "match": "C", "clear": true, "payoff": true,
  "one_answer": true, "fresh": true, "suitable": true }} ] }}
"""
    return CheckPlan(prompt=prompt, answer_order=tuple(order))


def _matched(raw: Any, plan: CheckPlan) -> int | None:
    """The candidate whose answer the checker picked, or None."""
    letter = str(raw or "").strip().upper().rstrip(".")
    if len(letter) != 1 or not "A" <= letter <= "Z":
        return None
    position = ord(letter) - 65
    if position >= len(plan.answer_order):
        return None
    return plan.answer_order[position]


def apply_check(
    candidates: Sequence[RiddlesJokesItem],
    plan: CheckPlan,
    raw_check: Mapping[str, Any],
) -> list[RiddlesJokesItem]:
    """The candidates the checker independently matched and passed, marked verified.

    An item passes only when the answer the checker picked for its setup is its
    own, and it is clear, pays off, has one answer, is fresh and is suitable.
    A missing, duplicated or malformed entry fails the item it belongs to, and
    an answer the checker picked for two setups fails both: if it fits either,
    it does not belong to one.
    """
    entries: dict[int, Mapping[str, Any]] = {}
    for entry in raw_check.get("items") or []:
        if not isinstance(entry, Mapping):
            continue
        try:
            index = int(entry.get("index"))
        except (TypeError, ValueError):
            continue
        entries.setdefault(index, entry)

    picks = Counter(
        pick
        for entry in entries.values()
        if (pick := _matched(entry.get("match"), plan)) is not None
    )
    flags = ("clear", "payoff", "one_answer", "fresh", "suitable")
    kept: list[RiddlesJokesItem] = []
    for index, item in enumerate(candidates):
        entry = entries.get(index + 1)
        if entry is None:
            continue
        if _matched(entry.get("match"), plan) != index or picks[index] != 1:
            continue
        if not all(entry.get(flag) is True for flag in flags):
            continue
        kept.append(item.model_copy(update={"verified": True}))
    return kept


async def _call_checker(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        # Deterministic judging, with room to reason: this call is what keeps
        # flat, copied and unsuitable jokes out of a printed book.
        temperature=0.0,
        max_output_tokens=int_value(_limits(), "checkMaxOutputTokens"),
        response_schema=RiddlesJokesCheckOutput,
        thinking_level="low",
        model=settings.STUDIO_FACT_CHECK_MODEL or None,
        label="riddles_jokes_check",
    )


async def verify_items(
    candidates: Sequence[RiddlesJokesItem], seed: int
) -> list[RiddlesJokesItem]:
    """Run the blind check. Raises when the check itself could not run."""
    if not candidates:
        return []
    plan = build_check_plan(candidates, seed)
    raw = await _call_checker(plan.prompt)
    return apply_check(candidates, plan, parse_json_object(raw))


# ---------------------------------------------------------------- the run


def _min_items(cap: int) -> int:
    """Below this the page may not fill, so another round is worth its cost.

    Every round is two paid calls, and the client asks for spares on top of
    its fullest page; two thirds of that is a full page for the common trim.
    """
    return max(1, (cap * 2 + 2) // 3)


async def generate_riddles_jokes(
    req: RiddlesJokesRequest, user_id: str
) -> RiddlesJokesResponse:
    _check_rate_limit(user_id)

    budgets = budgets_for(req)
    cap = min(int_value(_limits(), "poolSize"), req.count)
    attempts = int_value(_limits(), "maxAttempts")
    last_error = FINAL_ERROR
    started = time.perf_counter()
    kept: list[RiddlesJokesItem] = []
    written = checked = 0
    # What this seller printed before: the client's list (spans workers and
    # restarts) plus this worker's own memory. An item that repeats either is
    # dropped here, not just discouraged in the prompt.
    printed = [*req.avoid, *recent(_scope(req, user_id, req.seed), MEMORY_FILTER_LIMIT)]

    for attempt in range(attempts):
        seed = req.seed + attempt * 97
        scope = _scope(req, user_id, seed)
        avoid = [*req.avoid, *(label for item in kept for label in item_labels(item))]
        prompt = with_variety(_build_prompt(req, seed=seed), scope, client_avoid=avoid)
        try:
            raw = await _call_writer(prompt)
            items_raw = _parse_payload(raw)
        except Exception as exc:
            logger.warning(
                "studio_riddles_jokes_write_failed attempt=%s error=%s", attempt + 1, exc
            )
            last_error = "The AI did not return valid riddles and jokes. Please try again."
            continue

        written += len(items_raw)
        candidates = filter_items(
            items_raw,
            budgets=budgets,
            cap=int_value(_limits(), "maxWrite"),
            mix=req.mix,
            avoid=printed,
            kept=kept,
        )
        checked += len(candidates)
        try:
            confirmed = await verify_items(candidates, seed)
        except Exception as exc:
            logger.warning(
                "studio_riddles_jokes_check_failed attempt=%s error=%s", attempt + 1, exc
            )
            last_error = CHECK_ERROR
            continue

        # Re-run the pool rules over what survived, so the opener cap and the
        # repeat checks hold across rounds exactly as they do within one.
        if len(kept) < cap:
            kept.extend(
                filter_items(
                    (item.model_dump() for item in confirmed),
                    budgets=budgets,
                    cap=cap - len(kept),
                    mix=req.mix,
                    kept=kept,
                )
            )
        if len(kept) >= _min_items(cap):
            break
        last_error = FINAL_ERROR

    if not kept:
        raise RiddlesJokesGenerationError(last_error)

    verified = [item.model_copy(update={"verified": True}) for item in kept]
    remember(
        _scope(req, user_id, req.seed),
        (label for item in verified for label in item_labels(item)),
    )
    logger.info(
        "studio_riddles_jokes_generated model=%s check_model=%s latency_ms=%s "
        "written=%s checked=%s verified=%s mix=%s mixed_topics=%s",
        settings.STUDIO_GEMINI_MODEL,
        settings.STUDIO_FACT_CHECK_MODEL or settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        written,
        checked,
        len(verified),
        req.mix,
        req.mixed_topics,
    )
    return RiddlesJokesResponse(items=verified)


def build_prompt_for_tests(req: RiddlesJokesRequest, *, seed: int | None = None) -> str:
    return _build_prompt(req, seed=seed)


def parse_payload_for_tests(raw: str) -> list[Any]:
    return _parse_payload(raw)
