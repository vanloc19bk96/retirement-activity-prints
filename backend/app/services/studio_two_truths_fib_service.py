"""Generate Two Truths and a Fib: Retirement Edition sets via Gemini.

A set is a short title and three statements on one topic -- two true, one
false -- plus a one-sentence correction for the answer page:

    Lighthouse Lights
    * The lighthouse at Alexandria was one of the Seven Wonders ...   (true)
    * Many lighthouse lamps in the 1700s burned whale oil ...         (true)
    * The Fresnel lighthouse lens was invented in the 1920s.          (fib)
    Correction: Augustin Fresnel invented his lighthouse lens in 1822.

The whole game rests on the answer key being right, and this is printed and
sold on KDP, so nothing reaches the page on the writer's word alone:

* **Shape first.** A set is exactly two truths, one fib and a correction. The
  fib is its own field, never an index, so no reordering can point the key at
  a true statement. Every statement is one plain, standalone sentence: no
  question, no quote, no "It ..." leaning on another statement, no absolute
  ("never", "only", "the largest"), hedge ("reportedly", "about 30"), or
  time-sensitive word ("today", "still") that makes a claim partly true or
  true only this year. Anything that needs repairing is dropped, not rewritten.
* **A blind fact check.** A second call judges every statement without being
  told which one is the fib (statements shuffled per set), plus every
  correction as a standalone claim. A set survives only when the checker reads
  it as exactly true / true / false with the false one where the writer put the
  fib, calls the correction true, and finds the three on one topic, the fib
  believable and the content suitable. "Unsure" anywhere drops the set: a
  puzzle whose key is debatable is worse than one puzzle fewer. If the check
  cannot run, nothing is returned.
* **No repeats.** Statements are compared on their content words -- qualifiers
  dropped, plurals and verb forms folded, synonyms such as "invented / existed"
  and "earlier / before" aliased -- against each other, against what the client
  says the book already prints, and against this worker's memory. A set
  repeating any one statement is dropped whole.
* **Nothing sensitive.** Health, death, disability, money trouble, war,
  politics, religion, alcohol, gambling, brands and celebrities are dropped.

Variety is structural. Each requested set gets its own brief -- a subject
domain and an angle sampled by seed from ~100 domains and a dozen angles -- so
a reply cannot be eight versions of "the telephone", and two sellers on the
same settings get different books.
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
from app.schemas.studio_two_truths_fib import (
    TwoTruthsFibCheckOutput,
    TwoTruthsFibItem,
    TwoTruthsFibModelOutput,
    TwoTruthsFibRequest,
    TwoTruthsFibResponse,
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

GAME = "two-truths-and-a-fib"
FINAL_ERROR = (
    "Could not write reliable Two Truths and a Fib puzzles for this subject. "
    "Try again, or pick a broader subject."
)
CHECK_ERROR = "Could not fact-check these puzzles. Please try again."
# Remembered labels a new set is checked against. Bounded, so the check stays
# a few thousand token comparisons however long a seller keeps going.
MEMORY_FILTER_LIMIT = 200
AVOID_LABEL_CHARS = 60
STATEMENTS_PER_SET = 3

_MEDICAL_RE = re.compile(
    r"\bprevent\s+dementia\b|\breverse\s+aging\b|\bcures?\s+for\b|\banti[\s-]?aging\b|\bmemory\s+loss\b",
    re.IGNORECASE,
)
_FINANCE_RE = re.compile(
    r"\bguaranteed\s+(return|income|profit)|\binvest\s+now\b|\bget[\s-]?rich\b|"
    r"\bcrypto|\bbitcoin\b|\bday[\s-]?trad|\bpenny\s+stock",
    re.IGNORECASE,
)
# An approximate number cannot be checked true or false.
_NUMERIC_HEDGE_RE = re.compile(
    r"\b(about|around|over|under|nearly|almost|roughly|approximately|some|up\s+to|more\s+than|less\s+than|fewer\s+than)\s+\$?£?\d",
    re.IGNORECASE,
)
# "didn't", "wasn't": a negated fact is a trick of wording waiting to happen.
_CONTRACTED_NOT_RE = re.compile(r"n['’]t\b", re.IGNORECASE)
_YEAR_RE = re.compile(r"\b(1[0-9]{3}|20[0-9]{2})s?\b")
_ALLOWED_RE = re.compile(r"^[A-Za-z0-9 ,'’\-–().:;&%£$/]+$")
# A second sentence ("... in 1901. It was ...") inside one statement.
_INNER_SENTENCE_RE = re.compile(r"[.;:]\s+[A-Z]")
_NUMBER_RE = re.compile(r"^\s*(\(?[A-Ca-c1-9][.):]\s+|[-*•]\s+)")
_LABEL_RE = re.compile(r"^\s*(true|false|fib|truth|fact|correction)\s*[:\-–]\s*", re.IGNORECASE)
_EDGE_TRIM_CHARS = "\"'“”‘’ "
_TOKEN_RE = re.compile(r"[a-z0-9]+")
_TITLE_ALLOWED_RE = re.compile(r"^[A-Za-z0-9 &'’\-,]+$")
_TITLE_SMALL_WORDS = frozenset({"a", "an", "and", "the", "of", "in", "on", "at", "to", "for", "by", "or"})


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
def _time_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "timeTerms"))


@lru_cache(maxsize=1)
def _absolute_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "absoluteTerms"))


@lru_cache(maxsize=1)
def _hedge_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "hedgeTerms"))


@lru_cache(maxsize=1)
def _leading_pronouns() -> frozenset[str]:
    return frozenset(w.lower() for w in string_list(_config(), "leadingPronouns"))


@lru_cache(maxsize=1)
def _personal_words() -> frozenset[str]:
    return frozenset(w.lower() for w in string_list(_config(), "personalWords"))


@lru_cache(maxsize=1)
def _qualifiers() -> frozenset[str]:
    return frozenset(w.lower() for w in string_list(_config(), "qualifierWords"))


@lru_cache(maxsize=1)
def _aliases() -> Mapping[str, str]:
    raw = section(_config(), "aliases")
    return {str(k).lower(): str(v).lower() for k, v in raw.items()}


_rate_limiter = RateLimiter(
    label="Two Truths and a Fib",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class TwoTruthsFibRateLimitError(StudioRateLimitError):
    """User exceeded the short-window Two Truths and a Fib quota."""


class TwoTruthsFibGenerationError(StudioGenerationError):
    """Model output could not be turned into verified puzzle sets."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise TwoTruthsFibRateLimitError(str(exc)) from exc


def _custom_subject(req: TwoTruthsFibRequest) -> str:
    return re.sub(r"\s+", " ", req.custom_subject).strip()


def _scope(req: TwoTruthsFibRequest, user_id: str, seed: int) -> VarietyScope:
    """One memory per subject (a typed subject is its own): that is what risks repeating."""
    subject = _custom_subject(req) if req.subject == "custom" else req.subject
    return VarietyScope(game=GAME, user_id=user_id, bucket=bucket_key(subject or "mixed"), seed=seed)


@dataclass(frozen=True)
class Budgets:
    statement: int
    title: int
    fact: int


def budgets_for(req: TwoTruthsFibRequest) -> Budgets:
    limits = _limits()
    return Budgets(
        statement=min(int_value(limits, "maxStatementChars"), req.max_statement_chars),
        title=min(int_value(limits, "maxTitleChars"), req.max_title_chars),
        fact=min(int_value(limits, "maxFactChars"), req.max_fact_chars),
    )


# ---------------------------------------------------------------- text keys


def is_unsafe(text: str) -> bool:
    return bool(
        _MEDICAL_RE.search(text)
        or _FINANCE_RE.search(text)
        or _blocked_re().search(text)
        or _brand_re().search(text)
    )


def is_unverifiable(text: str) -> bool:
    """Worded so it is partly true, true only for now, or true only roughly."""
    if _time_re().search(text) or _absolute_re().search(text) or _hedge_re().search(text):
        return True
    if _NUMERIC_HEDGE_RE.search(text) or _CONTRACTED_NOT_RE.search(text):
        return True
    latest = int_value(_limits(), "latestYear")
    return any(int(year) > latest for year in _YEAR_RE.findall(text))


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
    """The words that carry a statement's meaning, qualifiers dropped and synonyms folded."""
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


def statements_repeat(first: str, second: str) -> bool:
    """True when a reader would call the two statements the same fact.

    Most of their meaning shared ("Telephones existed before television" /
    "Telephones were invented earlier than television"), or one wholly inside
    the other once it carries at least four words of substance -- a compact
    avoid label is a statement's content words, cut to the label cap.
    """
    a, b = content_tokens(first), content_tokens(second)
    if not a or not b:
        return first.strip().lower() == second.strip().lower()
    if _jaccard(a, b) >= 0.6:
        return True
    return min(len(a), len(b)) >= 4 and (a <= b or b <= a)


def titles_repeat(first: str, second: str) -> bool:
    a, b = content_tokens(first), content_tokens(second)
    return bool(a) and a == b


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


def set_labels(item: TwoTruthsFibItem) -> list[str]:
    """What a printed set is remembered by: its title and its three statements."""
    return [item.title, *(avoid_label(s) for s in (*item.truths, item.fib))]


# ---------------------------------------------------------------- gates


def _clean(raw: Any) -> str:
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    return text.strip(_EDGE_TRIM_CHARS)


def _sentence(raw: Any, *, low: int, high: int, max_words: int) -> str | None:
    """One plain, standalone declarative sentence, or None."""
    text = _clean(raw)
    for pattern in (_NUMBER_RE, _LABEL_RE):
        text = pattern.sub("", text).strip()
    text = text.strip(_EDGE_TRIM_CHARS).rstrip(" .").strip()
    if not text or "?" in text or "!" in text or '"' in text or "“" in text or "”" in text:
        return None
    if not _ALLOWED_RE.match(text) or _INNER_SENTENCE_RE.search(text):
        return None
    if not text[0].isupper():
        return None
    letters = [ch for ch in text if ch.isalpha()]
    if not letters or sum(ch.isupper() for ch in letters) > len(letters) * 0.4:
        return None
    tokens = _raw_tokens(text)
    if not tokens or tokens[0] in _leading_pronouns():
        return None
    # A fact about the reader ("You ...", "Our ...") is not a fact at all.
    if any(token in _personal_words() for token in tokens):
        return None
    if len(text.split()) > max_words:
        return None
    sentence = f"{text}."
    if not low <= len(sentence) <= high:
        return None
    if is_unsafe(sentence) or is_unverifiable(sentence):
        return None
    return sentence


def normalize_statement(raw: Any, *, budget: int) -> str | None:
    limits = _limits()
    return _sentence(
        raw,
        low=int_value(limits, "minStatementChars"),
        high=budget,
        max_words=int_value(limits, "maxStatementWords"),
    )


def normalize_fact(raw: Any, *, budget: int) -> str | None:
    limits = _limits()
    return _sentence(
        raw,
        low=int_value(limits, "minFactChars"),
        high=budget,
        max_words=int_value(limits, "maxFactWords"),
    )


def _title_case(text: str) -> str:
    words = text.split(" ")
    out = []
    for index, word in enumerate(words):
        lower = word.lower()
        if index > 0 and lower in _TITLE_SMALL_WORDS:
            out.append(lower)
        elif word.isupper() and len(word) > 1:
            out.append(word[0] + word[1:].lower())
        else:
            out.append(word[0].upper() + word[1:])
    return " ".join(out)


def normalize_title(raw: Any, *, budget: int) -> str | None:
    """A short Title Case heading ("Early Telephones"), or None."""
    text = _clean(raw).rstrip(" .:;,!?").strip()
    if not text or not _TITLE_ALLOWED_RE.match(text):
        return None
    limits = _limits()
    if not int_value(limits, "minTitleChars") <= len(text) <= budget:
        return None
    if len(text.split()) > int_value(limits, "maxTitleWords"):
        return None
    if is_unsafe(text):
        return None
    return _title_case(text)


def _lengths_balanced(statements: Sequence[str]) -> bool:
    """The fib must not give itself away by being far shorter or longer."""
    lengths = [len(s) for s in statements]
    ratio = int_value(_limits(), "maxLengthRatioPercent") / 100
    return max(lengths) <= min(lengths) * ratio


def _example_title() -> str:
    return str(section(_config(), "example").get("title", ""))


def normalize_set(raw: Any, *, budgets: Budgets) -> TwoTruthsFibItem | None:
    """One complete, well-formed set -- or None. Never a repaired one.

    Well-formed is not true: this is every check that can be made without
    knowing the facts. The blind check decides the rest.
    """
    if not isinstance(raw, dict):
        return None
    title = normalize_title(raw.get("title"), budget=budgets.title)
    if title is None or titles_repeat(title, _example_title()):
        return None
    raw_truths = raw.get("truths")
    if not isinstance(raw_truths, list) or len(raw_truths) != STATEMENTS_PER_SET - 1:
        return None
    truths = [normalize_statement(value, budget=budgets.statement) for value in raw_truths]
    fib = normalize_statement(raw.get("fib"), budget=budgets.statement)
    fact = normalize_fact(raw.get("fact"), budget=budgets.fact)
    if fib is None or fact is None or any(t is None for t in truths):
        return None
    statements = [*truths, fib]
    # Three different facts: a fib that restates a truth with one detail
    # changed contradicts it, and the reader spots it without knowing anything.
    for i, first in enumerate(statements):
        for second in statements[i + 1 :]:
            if statements_repeat(first, second):  # type: ignore[arg-type]
                return None
    if not _lengths_balanced(statements):  # type: ignore[arg-type]
        return None
    # The correction has to be about the fib, and must not just repeat a truth.
    if not content_tokens(fact) & content_tokens(fib):
        return None
    if any(statements_repeat(fact, truth) for truth in truths):  # type: ignore[arg-type]
        return None
    # Never verified here, whatever the input claims: only the checker marks a set.
    return TwoTruthsFibItem(title=title, truths=truths, fib=fib, fact=fact)  # type: ignore[arg-type]


def _set_repeats(item: TwoTruthsFibItem, other: TwoTruthsFibItem) -> bool:
    if titles_repeat(item.title, other.title):
        return True
    ours = [*item.truths, item.fib]
    theirs = [*other.truths, other.fib]
    return any(statements_repeat(a, b) for a in ours for b in theirs)


def _repeats_label(item: TwoTruthsFibItem, labels: Sequence[str]) -> bool:
    statements = [*item.truths, item.fib]
    for label in labels:
        if titles_repeat(item.title, label):
            return True
        if any(statements_repeat(statement, label) for statement in statements):
            return True
    return False


def filter_sets(
    raw_items: Iterable[Any],
    *,
    budgets: Budgets,
    cap: int,
    avoid: Iterable[str] = (),
) -> list[TwoTruthsFibItem]:
    """Keep the well-formed sets a page can print without repeating the book."""
    avoided = [label for label in (str(a or "").strip() for a in avoid) if label]
    kept: list[TwoTruthsFibItem] = []
    for raw in raw_items:
        item = normalize_set(raw, budgets=budgets)
        if item is None:
            continue
        if any(_set_repeats(item, other) for other in kept):
            continue
        if _repeats_label(item, avoided):
            continue
        kept.append(item)
        if len(kept) >= cap:
            break
    return kept


# ---------------------------------------------------------------- the writer


def _parse_payload(raw: str) -> list[Any]:
    data = parse_json_object(raw)
    items = data.get("items", data.get("sets"))
    if not isinstance(items, list) or not items:
        raise ValueError("invalid JSON: missing items")
    return items


def _subject_pools(req: TwoTruthsFibRequest) -> list[list[str]]:
    subjects = section(_config(), "subjects")
    if req.subject == "mixed":
        return [list(string_list(pool, "domains")) for pool in subjects.values()]
    if req.subject in subjects:
        return [list(string_list(section(subjects, req.subject), "domains"))]
    return []


def _briefs(req: TwoTruthsFibRequest, want: int, seed: int) -> list[str]:
    """One distinct brief per set: a subject domain (unless typed) and an angle.

    Mixed draws each set from a different subject pool in turn, so one page
    ranges across work, inventions, food and travel instead of running four
    sets on the kitchen. Domains and angles are shuffled by seed independently,
    so the same domain meets a different angle on the next page.
    """
    rng = random.Random(seed)
    angles = list(string_list(_config(), "angles"))
    rng.shuffle(angles)
    pools = _subject_pools(req)
    for pool in pools:
        rng.shuffle(pool)
    rng.shuffle(pools)

    lines: list[str] = []
    for index in range(want):
        parts = []
        if pools:
            pool = pools[index % len(pools)]
            parts.append(f"subject: {pool[(index // len(pools)) % len(pool)]}")
        parts.append(f"angle: {angles[index % len(angles)]}")
        lines.append(f"{index + 1}. " + "; ".join(parts))
    return lines


def _subject_line(req: TwoTruthsFibRequest) -> str:
    subjects = section(_config(), "subjects")
    if req.subject == "custom" and _custom_subject(req):
        return f"Every set is about {_custom_subject(req)}, each from a different corner of it."
    if req.subject in subjects:
        label = section(subjects, req.subject).get("label", req.subject)
        return f"Every set is about {label}, each on the subject its brief names."
    return f"Each set follows its own brief's subject, so the page ranges across {_config()['mixedLabel']}."


def _build_prompt(req: TwoTruthsFibRequest, *, seed: int | None = None) -> str:
    limits = _limits()
    want = min(int_value(limits, "maxWrite"), req.count + 4)
    prompt_seed = req.seed if seed is None else seed
    language = locale_line(section(_config(), "locale"), req.locale)
    budgets = budgets_for(req)
    level = str(section(_config(), "levels").get(req.level, ""))
    briefs = "\n".join(_briefs(req, want, prompt_seed))
    example = section(_config(), "example")
    example_title = example["title"]
    example_truths = _json_list(example["truths"])
    example_fib = example["fib"]
    example_fact = example["fact"]
    latest = int_value(limits, "latestYear")

    return f"""Create "Two Truths and a Fib" puzzles for a large-print retirement
activity book, read by retirees and older adults who enjoy a light factual
challenge. Each puzzle is a short title and three statements on ONE topic: two
are true and one is a fib. The reader circles the fib. The answer page names
the fib and prints your one-sentence correction.

{_subject_line(req)}
{level}

Write exactly {want} puzzles, one per brief, in this order:
{briefs}

For each puzzle:
- "title": 1 to {int_value(limits, "maxTitleWords")} words, at most {budgets.title} characters, Title Case, naming the shared topic.
- "truths": exactly TWO statements that are completely true, exactly as worded.
- "fib": exactly ONE statement that is false, yet believable at first glance.
- "fact": one sentence that corrects the fib with the real fact (at most {budgets.fact} characters).

Every statement:
- One plain declarative sentence ending with a full stop, at most {budgets.statement}
  characters, of similar length to the other two.
- About the same topic as the other two, but a DIFFERENT fact: never the same
  fact twice with one detail changed.
- Stands alone: never starts with "It", "They", "This" or "Also", and never
  leans on another statement. Never addresses the reader ("you", "we").
- A settled, well-documented fact that any good reference book confirms and
  that will not change: a date, a place, a material, a name origin, how
  something worked. Nothing after {latest}. Nothing that holds only "today".
- Exact, not approximate: no "about", "around", "nearly", "over 100".
- No absolutes or superlatives ("never", "always", "only", "every", "the
  largest", "the oldest", "the most popular"), no opinions ("the best",
  "delicious"), no hedges ("reportedly", "legend says", "some say").
- Vary the shapes within a puzzle: one might give a date, one a place of
  origin, one a practical detail.

The fib:
- Plausible and clearly false: change a well-known detail by a believable
  amount (a nearby decade, a neighbouring country, a similar material).
- Never absurd, never a trick of wording, never partly true, never a matter of
  opinion or definition, never something experts still argue about.
- The two truths must be facts you are completely sure of. If you are not
  certain a statement is true, do not use it as a truth.

Retirees are capable, curious readers. Keep the tone friendly and intelligent.
Never write about: health, illness, disability, death, war, crime, money
worries, politics, religion, alcohol, tobacco, gambling, or anything unkind
about age. No brand names or trademarks, no celebrities, entertainers,
athletes, royals or politicians, no living people, no quotations, lyrics or
film lines. A historical inventor may be named when the fact is about their
invention. Write every sentence in your own words -- never copy wording from
trivia books, quiz sites or games.
{language}

Return JSON only:
{{ "items": [ {{ "brief": 1, "title": "{example_title}",
  "truths": {example_truths},
  "fib": "{example_fib}",
  "fact": "{example_fact}" }} ] }}
(That example shows the shape only. Never write about its topic.)
"""


def _json_list(values: Iterable[str]) -> str:
    return "[" + ", ".join(f'"{value}"' for value in values) + "]"


async def _call_writer(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        temperature=0.9,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=TwoTruthsFibModelOutput,
        label="two_truths_fib",
    )


# ---------------------------------------------------------------- the checker


@dataclass(frozen=True)
class CheckPlan:
    """How the candidates were shown to the checker, so its reply maps back.

    ``orders[i]`` lists, for set ``i``, which statement sits in each shown
    position: 0 and 1 are the truths, 2 is the fib. ``fact_order`` lists which
    set's correction sits at each shown fact position.
    """

    prompt: str
    orders: tuple[tuple[int, ...], ...]
    fact_order: tuple[int, ...]


def build_check_plan(candidates: Sequence[TwoTruthsFibItem], seed: int) -> CheckPlan:
    """A prompt that never says which statement is the fib.

    Statements are shuffled within each set, and the corrections are listed
    separately, shuffled across sets, so the checker judges every claim on its
    own merits rather than confirming the writer's intent.
    """
    rng = random.Random(seed ^ 0x5EED)
    orders: list[tuple[int, ...]] = []
    blocks: list[str] = []
    for index, item in enumerate(candidates):
        statements = [*item.truths, item.fib]
        order = list(range(STATEMENTS_PER_SET))
        rng.shuffle(order)
        orders.append(tuple(order))
        lines = "\n".join(f"   {chr(65 + pos)}. {statements[k]}" for pos, k in enumerate(order))
        blocks.append(f"Set {index + 1} -- {item.title}\n{lines}")

    fact_order = list(range(len(candidates)))
    rng.shuffle(fact_order)
    facts = "\n".join(
        f"Fact {pos + 1}. {candidates[k].fact}" for pos, k in enumerate(fact_order)
    )
    sets_text = "\n\n".join(blocks)

    prompt = f"""You are a strict fact-checker for a published puzzle book. A wrong
answer key means refunds, so when in doubt, say "unsure".

Judge every statement on its own, exactly as worded, against well-established
reference knowledge (encyclopedias, standard histories, official records).
Do not assume any particular number of statements is true or false.

For each statement answer:
- "true"   -- accurate as worded, in every detail (names, dates, numbers,
              places, materials), and not a matter of debate.
- "false"  -- clearly contradicted by well-established knowledge.
- "unsure" -- you are not certain; it is only partly true; it depends on the
              country or on a definition; experts disagree; it is vague; it is
              a popular myth you cannot confirm; or it could change over time.

Then for each set:
- "coherent": true if all three statements are about the same topic.
- "plausible": true if, when exactly one statement is false, that statement
  would sound believable to an average adult at first glance (not absurd, not
  a trick of wording). False if no statement, or more than one, is false.
- "suitable": true only if the set is free of brand names, celebrities, living
  people, politics, religion, health, death, war, alcohol, gambling and
  anything unkind, and is fit for a friendly retirement activity book.

SETS
{sets_text}

STANDALONE FACTS (judge each alone, the same way)
{facts}

Return JSON only, one entry per set and per fact, verdicts in the order the
statements are listed (A, B, C):
{{ "sets": [ {{ "index": 1, "verdicts": ["true", "false", "true"],
  "coherent": true, "plausible": true, "suitable": true }} ],
  "facts": [ {{ "index": 1, "verdict": "true" }} ] }}
"""
    return CheckPlan(prompt=prompt, orders=tuple(orders), fact_order=tuple(fact_order))


def _verdict(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    return value if value in ("true", "false") else "unsure"


def apply_check(
    candidates: Sequence[TwoTruthsFibItem],
    plan: CheckPlan,
    raw_check: Mapping[str, Any],
) -> list[TwoTruthsFibItem]:
    """The candidates the checker independently confirmed, marked verified.

    A set passes only when every shown statement maps back to the verdict its
    role demands (truth -> "true", fib -> "false"), the correction reads
    "true", and the set is coherent, plausibly fibbed and suitable. A missing,
    duplicated or malformed entry fails the set it belongs to.
    """
    sets_by_index: dict[int, Mapping[str, Any]] = {}
    for entry in raw_check.get("sets") or []:
        if not isinstance(entry, Mapping):
            continue
        try:
            index = int(entry.get("index"))
        except (TypeError, ValueError):
            continue
        sets_by_index.setdefault(index, entry)

    facts_by_index: dict[int, str] = {}
    for entry in raw_check.get("facts") or []:
        if not isinstance(entry, Mapping):
            continue
        try:
            index = int(entry.get("index"))
        except (TypeError, ValueError):
            continue
        facts_by_index.setdefault(index, _verdict(entry.get("verdict")))

    fact_verdicts = {
        set_index: facts_by_index.get(pos + 1, "unsure")
        for pos, set_index in enumerate(plan.fact_order)
    }

    fib_role = STATEMENTS_PER_SET - 1
    kept: list[TwoTruthsFibItem] = []
    for index, item in enumerate(candidates):
        entry = sets_by_index.get(index + 1)
        if entry is None:
            continue
        verdicts = entry.get("verdicts")
        if not isinstance(verdicts, list) or len(verdicts) != STATEMENTS_PER_SET:
            continue
        expected = ["false" if role == fib_role else "true" for role in plan.orders[index]]
        if [_verdict(v) for v in verdicts] != expected:
            continue
        if not all(entry.get(flag) is True for flag in ("coherent", "plausible", "suitable")):
            continue
        if fact_verdicts.get(index) != "true":
            continue
        kept.append(item.model_copy(update={"verified": True}))
    return kept


async def _call_checker(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        # Deterministic judging, with room to reason: this call is what makes
        # the answer key trustworthy, so it gets the thinking the writer skips.
        temperature=0.0,
        max_output_tokens=int_value(_limits(), "checkMaxOutputTokens"),
        response_schema=TwoTruthsFibCheckOutput,
        thinking_level="low",
        model=settings.STUDIO_FACT_CHECK_MODEL or None,
        label="two_truths_fib_check",
    )


async def verify_sets(
    candidates: Sequence[TwoTruthsFibItem], seed: int
) -> list[TwoTruthsFibItem]:
    """Run the blind check. Raises when the check itself could not run."""
    if not candidates:
        return []
    plan = build_check_plan(candidates, seed)
    raw = await _call_checker(plan.prompt)
    return apply_check(candidates, plan, parse_json_object(raw))


# ---------------------------------------------------------------- the run


def _min_sets(cap: int) -> int:
    """Below this the page may not fill, so another round is worth its cost.

    Every round is two paid calls, and the client asks for spares on top of
    its fullest page; half of that is enough for the common page.
    """
    return max(1, (cap + 1) // 2)


async def generate_two_truths_fib(
    req: TwoTruthsFibRequest, user_id: str
) -> TwoTruthsFibResponse:
    _check_rate_limit(user_id)

    budgets = budgets_for(req)
    cap = min(int_value(_limits(), "poolSize"), req.count)
    attempts = int_value(_limits(), "maxAttempts")
    last_error = FINAL_ERROR
    started = time.perf_counter()
    kept: list[TwoTruthsFibItem] = []
    written = checked = 0
    # What this seller printed before: the client's list (spans workers and
    # restarts) plus this worker's own memory. A set that repeats either is
    # dropped here, not just discouraged in the prompt.
    printed = [*req.avoid, *recent(_scope(req, user_id, req.seed), MEMORY_FILTER_LIMIT)]

    for attempt in range(attempts):
        seed = req.seed + attempt * 97
        scope = _scope(req, user_id, seed)
        avoid = [*req.avoid, *(label for item in kept for label in set_labels(item))]
        prompt = with_variety(_build_prompt(req, seed=seed), scope, client_avoid=avoid)
        try:
            raw = await _call_writer(prompt)
            items_raw = _parse_payload(raw)
        except Exception as exc:
            logger.warning(
                "studio_two_truths_fib_write_failed attempt=%s error=%s", attempt + 1, exc
            )
            last_error = "The AI did not return valid puzzles. Please try again."
            continue

        written += len(items_raw)
        candidates = [
            item
            for item in filter_sets(
                items_raw,
                budgets=budgets,
                cap=int_value(_limits(), "maxWrite"),
                avoid=printed,
            )
            if not any(_set_repeats(item, other) for other in kept)
        ]
        checked += len(candidates)
        try:
            confirmed = await verify_sets(candidates, seed)
        except Exception as exc:
            logger.warning(
                "studio_two_truths_fib_check_failed attempt=%s error=%s", attempt + 1, exc
            )
            last_error = CHECK_ERROR
            continue

        for item in confirmed:
            if len(kept) >= cap:
                break
            if not any(_set_repeats(item, other) for other in kept):
                kept.append(item)
        if len(kept) >= _min_sets(cap):
            break
        last_error = FINAL_ERROR

    if not kept:
        raise TwoTruthsFibGenerationError(last_error)

    remember(
        _scope(req, user_id, req.seed),
        (label for item in kept for label in set_labels(item)),
    )
    logger.info(
        "studio_two_truths_fib_generated model=%s check_model=%s latency_ms=%s "
        "written=%s checked=%s verified=%s subject=%s level=%s",
        settings.STUDIO_GEMINI_MODEL,
        settings.STUDIO_FACT_CHECK_MODEL or settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        written,
        checked,
        len(kept),
        req.subject,
        req.level,
    )
    return TwoTruthsFibResponse(items=kept)


def build_prompt_for_tests(req: TwoTruthsFibRequest, *, seed: int | None = None) -> str:
    return _build_prompt(req, seed=seed)


def parse_payload_for_tests(raw: str) -> list[Any]:
    return _parse_payload(raw)
