"""Generate What Kind of Retiree Are You? quizzes via Gemini.

A question is one relatable retirement moment and four answers, one for each
retirement style -- The Explorer, The Tinkerer, The Social Butterfly and The
Professional Napper. The page deals the answers to letters A-D; the reader
circles one, and a scoring grid adds up which style they picked most.

Everything here is printed and sold on KDP, so a question only survives whole:

* **Four usable answers.** One per style, each a short phrase that reads on its
  own: no numbering, no second sentence, no question mark, and none that names
  its own style ("explore", "tinker", "napper"). Anything that still needs
  repairing is dropped, not rewritten.
* **A fair question.** The four answers differ in substance, sit within a
  similar length, and none is a put-down ("lazy", "boring"). Every style gets
  exactly one answer per question, so the structure of the quiz can never
  favour one result.
* **A blind style check.** A second call sorts every question's answers into
  styles without being told which is which, and judges whether they are
  equally appealing and suitable. A question survives only when the sort
  matches the writer's labels exactly. The four result write-ups are sorted
  the same way. If the check cannot run, no questions are returned.
* **No repeats.** Questions are compared on content words, against each other,
  against what the client says the book already prints, and against this
  worker's memory. Within one quiz, answers for the same style may not repeat
  each other or lean on the same word more than twice.
* **Nothing sensitive, nothing assumed.** Health, ageing bodies, money worries,
  loneliness, death, politics, religion, alcohol, gambling, brands and
  celebrities are dropped, and so is anything that assumes a spouse,
  grandchildren, wealth, a house or an office career.

Variety is structural. Each requested question gets its own brief -- a topic
and a question shape sampled by seed -- so a reply cannot be ten paraphrases of
"where would you travel?", and two sellers on the same settings get different
books.
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
from app.schemas.studio_retiree_quiz import (
    RetireeQuizCheckOutput,
    RetireeQuizModelOutput,
    RetireeQuizQuestion,
    RetireeQuizRequest,
    RetireeQuizResponse,
    RetireeQuizResults,
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

GAME = "what-kind-of-retiree"
OUTCOMES: tuple[str, ...] = ("explorer", "tinkerer", "social", "napper")
LETTERS: tuple[str, ...] = ("A", "B", "C", "D")
FINAL_ERROR = (
    "Could not write a fair What Kind of Retiree quiz for this theme. "
    "Try again, or pick a broader theme."
)
CHECK_ERROR = "Could not check the quiz questions right now. Please try again."
# Remembered questions a new one is checked against. Bounded, so the check
# stays a few thousand token comparisons however long a seller keeps going.
MEMORY_FILTER_LIMIT = 200
AVOID_LABEL_CHARS = 60
# The prompt's own example. A question on it is the model copying it.
EXAMPLE_QUESTION = "Rain is drumming on the window. How do you spend the afternoon?"

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
_NUMBER_RE = re.compile(r"^\s*(q(uestion)?\s*\d+\s*[.):-]?\s+|\(?\d+[.):]\s+|[-*•]\s+)", re.IGNORECASE)
_ANSWER_LABEL_RE = re.compile(
    r"^\s*(\(?[a-d1-4]\s*[.):]\s+|[-*•]\s+|(explorer|tinkerer|social|napper)\s*[:\-–]\s*)",
    re.IGNORECASE,
)
_QUESTION_ALLOWED_RE = re.compile(r"^[A-Za-z0-9 ,'’\-–().:;!?&]+$")
_ANSWER_ALLOWED_RE = re.compile(r"^[A-Za-z0-9 ,'’\-–&()]+$")
_DESCRIPTION_ALLOWED_RE = re.compile(r"^[A-Za-z0-9 ,'’\-–().:;!&]+$")
_SENTENCE_END_RE = re.compile(r"[.!?]")
_EDGE_TRIM_CHARS = "\"'“”‘’ "
_TOKEN_RE = re.compile(r"[a-z0-9]+")


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


@lru_cache(maxsize=1)
def _unsafe_re() -> re.Pattern[str]:
    terms = [
        *string_list(_config(), "blockedTerms"),
        *string_list(_config(), "brandTerms"),
        *string_list(_config(), "assumptionTerms"),
        *string_list(_config(), "putDownTerms"),
    ]
    return word_pattern(terms)


@lru_cache(maxsize=1)
def _reveal_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "revealTerms"))


@lru_cache(maxsize=1)
def _description_banned_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "descriptionBannedTerms"))


@lru_cache(maxsize=1)
def _qualifiers() -> frozenset[str]:
    return frozenset(word.lower() for word in string_list(_config(), "qualifierWords"))


_rate_limiter = RateLimiter(
    label="What Kind of Retiree",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class RetireeQuizRateLimitError(StudioRateLimitError):
    """User exceeded the short-window quiz quota."""


class RetireeQuizGenerationError(StudioGenerationError):
    """Model output could not be turned into a usable quiz."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise RetireeQuizRateLimitError(str(exc)) from exc


def _scope(req: RetireeQuizRequest, user_id: str, seed: int) -> VarietyScope:
    """One memory per theme (or one for mixed): that is what risks repeating."""
    bucket = bucket_key("mixed" if req.mixed_topics else req.theme)
    return VarietyScope(game=GAME, user_id=user_id, bucket=bucket, seed=seed)


@dataclass(frozen=True)
class Budgets:
    question: int
    answer: int
    description: int


def budgets_for(req: RetireeQuizRequest) -> Budgets:
    limits = _limits()
    return Budgets(
        question=min(int_value(limits, "maxQuestionChars"), req.max_question_chars),
        answer=min(int_value(limits, "maxAnswerChars"), req.max_answer_chars),
        description=min(int_value(limits, "maxDescriptionChars"), req.max_description_chars),
    )


# ---------------------------------------------------------------- text keys


def is_unsafe(text: str) -> bool:
    return bool(
        _MEDICAL_RE.search(text)
        or _FINANCE_RE.search(text)
        or _STEREOTYPE_RE.search(text)
        or _unsafe_re().search(text)
    )


def _stem(token: str) -> str:
    """Fold plurals and common endings so GARDEN and GARDENING compare equal."""
    if len(token) > 4 and token.endswith("ies"):
        return token[:-3] + "y"
    if len(token) > 4 and token.endswith(("ches", "shes", "sses", "xes", "zes")):
        return token[:-2]
    if len(token) > 5 and token.endswith("ing"):
        return token[:-3]
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def _raw_tokens(text: str) -> list[str]:
    folded = text.lower().replace("’", "'").replace("'s ", " ").replace("'", "")
    return _TOKEN_RE.findall(folded)


def content_tokens(text: str) -> frozenset[str]:
    """The words that carry a text's meaning, qualifiers dropped and endings folded."""
    return frozenset(_stem(word) for word in _raw_tokens(text) if word not in _qualifiers())


def _jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    union = a | b
    return len(a & b) / len(union) if union else 1.0


def texts_match(first: str, second: str) -> bool:
    """True when a reader would call the two texts the same thing said twice.

    Half their meaning shared, or one wholly inside the other once it carries
    three words of substance.
    """
    a, b = content_tokens(first), content_tokens(second)
    if not a or not b:
        return first.strip().lower() == second.strip().lower()
    if _jaccard(a, b) >= 0.5:
        return True
    return min(len(a), len(b)) >= 3 and (a <= b or b <= a)


def avoid_label(question: str) -> str:
    """Compact label for avoid lists: content words only, inside the 60-char cap."""
    out = ""
    for word in (w for w in _raw_tokens(question) if w not in _qualifiers()):
        candidate = f"{out} {word}".strip()
        if len(candidate) > AVOID_LABEL_CHARS:
            break
        out = candidate
    return out or question[:AVOID_LABEL_CHARS]


# ---------------------------------------------------------------- gates


def _clean(raw: Any) -> str:
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    return text.strip(_EDGE_TRIM_CHARS)


def _mostly_lowercase(text: str) -> bool:
    letters = [ch for ch in text if ch.isalpha()]
    return bool(letters) and sum(ch.isupper() for ch in letters) <= len(letters) * 0.4


def normalize_question(raw: Any, *, budget: int) -> str | None:
    """One or two short sentences ending in a single question mark -- or None."""
    text = _NUMBER_RE.sub("", _clean(raw)).strip(_EDGE_TRIM_CHARS)
    if not text or not text.endswith("?") or text.count("?") != 1:
        return None
    if not _QUESTION_ALLOWED_RE.match(text) or not text[0].isupper():
        return None
    # At most one sentence before the question itself.
    if len(_SENTENCE_END_RE.findall(text[:-1])) > 1:
        return None
    if not _mostly_lowercase(text):
        return None
    if len(text.split()) > int_value(_limits(), "maxQuestionWords"):
        return None
    if not int_value(_limits(), "minQuestionChars") <= len(text) <= budget:
        return None
    if is_unsafe(text) or _reveal_re().search(text):
        return None
    if texts_match(text, EXAMPLE_QUESTION):
        return None
    return text


def normalize_answer(raw: Any, *, budget: int) -> str | None:
    """One short phrase, sentence case, no label or end mark -- or None."""
    text = _ANSWER_LABEL_RE.sub("", _clean(raw)).strip()
    text = text.rstrip(" .!;:").strip(_EDGE_TRIM_CHARS)
    if not text or not _ANSWER_ALLOWED_RE.match(text) or not _mostly_lowercase(text):
        return None
    words = text.split()
    if not int_value(_limits(), "minAnswerWords") <= len(words) <= int_value(
        _limits(), "maxAnswerWords"
    ):
        return None
    if not int_value(_limits(), "minAnswerChars") <= len(text) <= budget:
        return None
    if is_unsafe(text) or _reveal_re().search(text):
        return None
    return text[0].upper() + text[1:]


def normalize_description(raw: Any, *, budget: int) -> str | None:
    """One to three warm sentences for a result -- or None."""
    text = _clean(raw)
    if not text or not _DESCRIPTION_ALLOWED_RE.match(text) or not text[0].isupper():
        return None
    if text[-1] not in ".!":
        return None
    if len(_SENTENCE_END_RE.findall(text)) > 3 or not _mostly_lowercase(text):
        return None
    if len(text.split()) > int_value(_limits(), "maxDescriptionWords"):
        return None
    if not int_value(_limits(), "minDescriptionChars") <= len(text) <= budget:
        return None
    if is_unsafe(text) or _description_banned_re().search(text):
        return None
    return text


def answers_problem(answers: Sequence[str]) -> str | None:
    """Why four valid answers are not one fair question, or None."""
    for i in range(len(answers)):
        for j in range(i + 1, len(answers)):
            if texts_match(answers[i], answers[j]):
                return "answers too alike"
    lengths = [len(answer) for answer in answers]
    if max(lengths) * 100 > min(lengths) * int_value(_limits(), "maxAnswerLengthRatioPercent"):
        return "answers unbalanced"
    return None


def normalize_item(raw: Any, *, budgets: Budgets) -> RetireeQuizQuestion | None:
    """One complete, fair question -- or None. Never a repaired one."""
    if not isinstance(raw, dict):
        return None
    question = normalize_question(raw.get("question"), budget=budgets.question)
    if question is None:
        return None
    answers: dict[str, str] = {}
    for style in OUTCOMES:
        answer = normalize_answer(raw.get(style), budget=budgets.answer)
        if answer is None:
            return None
        answers[style] = answer
    if answers_problem(list(answers.values())):
        return None
    topic = _clean(raw.get("topic"))[:60]
    return RetireeQuizQuestion(question=question, topic=topic, **answers)


def _question_repeats(item: RetireeQuizQuestion, other: RetireeQuizQuestion) -> bool:
    if texts_match(item.question, other.question):
        return True
    if item.topic and item.topic.casefold() == other.topic.casefold():
        return True
    return any(texts_match(getattr(item, s), getattr(other, s)) for s in OUTCOMES)


def _overuses_words(item: RetireeQuizQuestion, usage: Mapping[str, Counter[str]]) -> bool:
    """True when adding this question leans on one word too often for a style.

    Four answers for the same style all about napping, or all "with friends",
    make the quiz read as one question asked ten times.
    """
    cap = int_value(_limits(), "maxSharedWordUses")
    return any(
        usage[style][token] >= cap for style in OUTCOMES for token in content_tokens(getattr(item, style))
    )


def filter_questions(
    raw_items: Iterable[Any],
    *,
    budgets: Budgets,
    cap: int,
    avoid: Iterable[str] = (),
) -> list[RetireeQuizQuestion]:
    """Keep the questions one quiz can print without repeating itself or the book."""
    avoided = [label for label in (str(a or "").strip() for a in avoid) if label]
    kept: list[RetireeQuizQuestion] = []
    usage: dict[str, Counter[str]] = {style: Counter() for style in OUTCOMES}

    for raw in raw_items:
        item = raw if isinstance(raw, RetireeQuizQuestion) else normalize_item(raw, budgets=budgets)
        if item is None:
            continue
        if any(texts_match(item.question, label) for label in avoided):
            continue
        if any(_question_repeats(item, other) for other in kept):
            continue
        if _overuses_words(item, usage):
            continue
        kept.append(item)
        for style in OUTCOMES:
            usage[style].update(content_tokens(getattr(item, style)))
        if len(kept) >= cap:
            break
    return kept


def normalize_results(raw: Any, *, budget: int) -> RetireeQuizResults:
    """Every write-up that passes its gate; the rest left empty."""
    data = raw if isinstance(raw, Mapping) else {}
    values = {
        style: normalize_description(data.get(style), budget=budget) or "" for style in OUTCOMES
    }
    return RetireeQuizResults(**values)


# ---------------------------------------------------------------- prompt


def _parse_payload(raw: str) -> tuple[list[Any], Any]:
    data = parse_json_object(raw)
    items = data.get("items", data.get("questions"))
    if not isinstance(items, list) or not items:
        raise ValueError("invalid JSON: missing items")
    return items, data.get("results")


def _briefs(req: RetireeQuizRequest, want: int, seed: int) -> list[str]:
    """One distinct brief per question: a topic (when mixed) and a shape.

    Topics and shapes are shuffled by seed independently, so the same topic
    meets a different shape on the next quiz and a long run walks through
    hundreds of combinations before it could meet one twice.
    """
    rng = random.Random(seed)
    topics = list(string_list(_config(), "topics"))
    shapes = list(string_list(_config(), "shapes"))
    rng.shuffle(topics)
    rng.shuffle(shapes)
    lines: list[str] = []
    for index in range(want):
        parts = []
        if req.mixed_topics:
            parts.append(f"topic: {topics[index % len(topics)]}")
        parts.append(f"shape: {shapes[index % len(shapes)]}")
        lines.append(f"{index + 1}. " + "; ".join(parts))
    return lines


def _style_lines() -> str:
    outcomes = section(_config(), "outcomes")
    return "\n".join(f"- {style}: {outcomes[style]}" for style in OUTCOMES)


def _build_prompt(req: RetireeQuizRequest, *, seed: int | None = None) -> str:
    want = min(int_value(_limits(), "maxWrite"), req.count)
    prompt_seed = req.seed if seed is None else seed
    budgets = budgets_for(req)
    language = locale_line(section(_config(), "locale"), req.locale)
    theme = str(_config()["mixedTheme"]) if req.mixed_topics else req.theme.strip()
    theme_rule = (
        "Each question follows its own brief's topic, so the quiz ranges across retirement life."
        if req.mixed_topics
        else f"Every question is about {theme}, each from a different corner of it; "
        "name that corner in \"topic\"."
    )
    max_q_words = int_value(_limits(), "maxQuestionWords")
    max_a_words = int_value(_limits(), "maxAnswerWords")
    briefs = "\n".join(_briefs(req, want, prompt_seed))

    return f"""Write questions for "What Kind of Retiree Are You?", a lighthearted
quiz in a large-print retirement activity book. Readers circle one answer per
question, then count which retirement style they picked most. It is just for
fun -- not a psychological test.

The four retirement styles (every question gives exactly one answer to each):
{_style_lines()}

Theme: {theme}
{theme_rule}

Write exactly {want} questions, one per brief, in this order:
{briefs}

Each question:
- One relatable retirement moment, preference, habit or choice, asked in a
  friendly, conversational way. It may set the scene in one short sentence,
  then ask; it ends with a single question mark.
- At most {max_q_words} words and {budgets.question} characters. Plain words,
  no specialist knowledge.
- Vary the wording: do not open every question the same way, and never ask
  the same preference twice in different words.

The four answers ("explorer", "tinkerer", "social", "napper"):
- Each clearly belongs to its own style and could not be mistaken for another
  style's answer.
- All four equally appealing and fun in their own way -- none the obvious
  "right" answer, none more adventurous, clever, productive or admirable
  than the rest. The napper answer is cosy and content, never lazy or dull.
- Short, punchy phrases a reader can circle at a glance:
  {int_value(_limits(), "minAnswerWords")} to {max_a_words} words and at most {budgets.answer} characters
  each, all four about the same length. No full stop, no question mark, no
  numbering or labels.
- Never name a style or use its giveaway word (explore, tinker, social,
  butterfly, napper), and use "nap" at most once in the whole quiz.
- Specific and vivid, and different from the answers to other questions: do
  not reuse the same activity or key word for one style across the quiz.

Suitable for every retiree:
- Do not assume a spouse or partner, grandchildren, money to spare, owning a
  house, a past office job, or strenuous physical ability. Keep activities
  open to many abilities and backgrounds.
- Never mention health, illness, ageing bodies, memory, loneliness, money
  worries, death, disability, politics, religion, alcohol or gambling.
- No jokes about being old, slow or forgetful. Retirees are capable and busy.
- No brand names, celebrities, characters, films, songs, quotations or famous
  sayings. Original wording only.

Then write "results": one short write-up for each style, 1 to 2 warm, witty
sentences (at most {budgets.description} characters each), spoken to the reader as
"you". Celebrate that way of enjoying retirement; every style is a great one.
Do not name any style, and make no claims about psychology or science.
{language}

Return JSON only:
{{ "items": [ {{ "brief": 1, "topic": "a rainy afternoon at home",
  "question": "{EXAMPLE_QUESTION}",
  "explorer": "Find a museum you've never visited",
  "tinkerer": "Fix that squeaky cupboard door",
  "social": "Invite a friend round for tea",
  "napper": "A blanket and a good book" }} ],
  "results": {{ "explorer": "...", "tinkerer": "...", "social": "...",
  "napper": "..." }} }}
"""


async def _call_writer(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        temperature=0.95,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=RetireeQuizModelOutput,
        label="retiree_quiz",
    )


# ---------------------------------------------------------------- the checker


@dataclass(frozen=True)
class CheckPlan:
    """How the candidates were shown to the checker, so its reply maps back.

    ``orders[i]`` lists, for question ``i``, which style sits at each shown
    letter. ``result_order`` lists which style's write-up sits at each shown
    position (only styles that had a write-up are shown).
    """

    prompt: str
    orders: tuple[tuple[str, ...], ...]
    result_order: tuple[str, ...]


def build_check_plan(
    candidates: Sequence[RetireeQuizQuestion], results: RetireeQuizResults, seed: int
) -> CheckPlan:
    """A prompt that never says which answer belongs to which style.

    Answers are shuffled within each question and write-ups across styles, so
    the checker sorts every answer on its own wording rather than confirming
    the writer's labels.
    """
    rng = random.Random(seed ^ 0x5EED)
    orders: list[tuple[str, ...]] = []
    blocks: list[str] = []
    for index, item in enumerate(candidates):
        order = list(OUTCOMES)
        rng.shuffle(order)
        orders.append(tuple(order))
        lines = "\n".join(f"   {LETTERS[pos]}. {getattr(item, style)}" for pos, style in enumerate(order))
        blocks.append(f"Question {index + 1}. {item.question}\n{lines}")

    result_order = [style for style in OUTCOMES if getattr(results, style)]
    rng.shuffle(result_order)
    write_ups = "\n".join(
        f"Write-up {pos + 1}. {getattr(results, style)}" for pos, style in enumerate(result_order)
    ) or "(none)"
    questions_text = "\n\n".join(blocks)

    prompt = f"""You are an editor checking a lighthearted retirement quiz before it is
printed in a book. Readers pick one answer per question and count which
retirement style they chose most, so every answer must clearly belong to
exactly one style.

The four styles:
{_style_lines()}

For each question, sort its four answers (A-D) into the four styles, using
each style exactly once. Judge only the answer's own wording. Then:
- "clear": true only if every answer plainly fits the style you gave it and
  would not fit another style just as well.
- "balanced": true only if all four answers sound about equally appealing:
  none negative, mocking or a put-down, and none the obvious "right" answer.
- "suitable": true only if the question and answers are friendly and
  respectful for retirees; free of health, ageing, memory, money worries,
  loneliness, death, politics, religion, alcohol, gambling, brands and
  celebrities; and do not assume a spouse, grandchildren, wealth, owning a
  house, an office career or strenuous physical ability.

For each write-up, name the one style it describes, and say whether it is
"suitable": warm, positive, not mocking, and making no claims about
psychology or science.

QUESTIONS
{questions_text}

WRITE-UPS
{write_ups}

Return JSON only, one entry per question and per write-up:
{{ "questions": [ {{ "index": 1, "A": "social", "B": "napper", "C": "explorer",
  "D": "tinkerer", "clear": true, "balanced": true, "suitable": true }} ],
  "results": [ {{ "index": 1, "style": "tinkerer", "suitable": true }} ] }}
"""
    return CheckPlan(prompt=prompt, orders=tuple(orders), result_order=tuple(result_order))


def _style(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    return value if value in OUTCOMES else ""


def _entries_by_index(raw: Any) -> dict[int, Mapping[str, Any]]:
    out: dict[int, Mapping[str, Any]] = {}
    for entry in raw or []:
        if not isinstance(entry, Mapping):
            continue
        try:
            index = int(entry.get("index"))
        except (TypeError, ValueError):
            continue
        out.setdefault(index, entry)
    return out


def apply_check(
    candidates: Sequence[RetireeQuizQuestion],
    results: RetireeQuizResults,
    plan: CheckPlan,
    raw_check: Mapping[str, Any],
) -> tuple[list[RetireeQuizQuestion], RetireeQuizResults]:
    """The questions and write-ups the checker independently confirmed.

    A question passes only when every shown letter maps back to the style the
    writer gave that answer, and it is clear, balanced and suitable. A missing,
    duplicated or malformed entry fails the question it belongs to. A write-up
    that the checker reads as a different style, or unsuitable, is emptied.
    """
    questions_by_index = _entries_by_index(raw_check.get("questions"))
    kept: list[RetireeQuizQuestion] = []
    for index, item in enumerate(candidates):
        entry = questions_by_index.get(index + 1)
        if entry is None:
            continue
        sorted_styles = tuple(_style(entry.get(letter)) for letter in LETTERS)
        if sorted_styles != plan.orders[index]:
            continue
        if not all(entry.get(flag) is True for flag in ("clear", "balanced", "suitable")):
            continue
        kept.append(item.model_copy(update={"verified": True}))

    results_by_index = _entries_by_index(raw_check.get("results"))
    confirmed = {style: "" for style in OUTCOMES}
    for pos, style in enumerate(plan.result_order):
        entry = results_by_index.get(pos + 1)
        if entry and _style(entry.get("style")) == style and entry.get("suitable") is True:
            confirmed[style] = getattr(results, style)
    return kept, RetireeQuizResults(**confirmed)


async def _call_checker(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        # Deterministic judging: this call is what makes the scoring trustworthy.
        temperature=0.0,
        max_output_tokens=int_value(_limits(), "checkMaxOutputTokens"),
        response_schema=RetireeQuizCheckOutput,
        thinking_level="low",
        label="retiree_quiz_check",
    )


async def verify_quiz(
    candidates: Sequence[RetireeQuizQuestion], results: RetireeQuizResults, seed: int
) -> tuple[list[RetireeQuizQuestion], RetireeQuizResults]:
    """Run the blind check. Raises when the check itself could not run."""
    if not candidates and not any(getattr(results, style) for style in OUTCOMES):
        return [], RetireeQuizResults()
    plan = build_check_plan(candidates, results, seed)
    raw = await _call_checker(plan.prompt)
    return apply_check(candidates, results, plan, parse_json_object(raw))


# ---------------------------------------------------------------- the run


def _merge_results(kept: RetireeQuizResults, fresh: RetireeQuizResults) -> RetireeQuizResults:
    """First confirmed write-up per style wins."""
    return RetireeQuizResults(
        **{style: getattr(kept, style) or getattr(fresh, style) for style in OUTCOMES}
    )


async def generate_retiree_quiz(req: RetireeQuizRequest, user_id: str) -> RetireeQuizResponse:
    _check_rate_limit(user_id)

    budgets = budgets_for(req)
    cap = min(int_value(_limits(), "poolSize"), req.count)
    target = min(cap, int_value(_limits(), "targetQuestions"))
    attempts = int_value(_limits(), "maxAttempts")
    last_error = FINAL_ERROR
    started = time.perf_counter()
    kept: list[RetireeQuizQuestion] = []
    results = RetireeQuizResults()
    written = checked = 0
    # What this seller printed before: the client's list (spans workers and
    # restarts) plus this worker's own memory. A question that repeats either
    # is dropped here, not just discouraged in the prompt.
    printed = [*req.avoid, *recent(_scope(req, user_id, req.seed), MEMORY_FILTER_LIMIT)]

    for attempt in range(attempts):
        seed = req.seed + attempt * 97
        scope = _scope(req, user_id, seed)
        avoid = [*req.avoid, *(avoid_label(item.question) for item in kept)]
        prompt = with_variety(_build_prompt(req, seed=seed), scope, client_avoid=avoid)
        try:
            raw = await _call_writer(prompt)
            items_raw, results_raw = _parse_payload(raw)
        except Exception as exc:
            logger.warning("studio_retiree_quiz_write_failed attempt=%s error=%s", attempt + 1, exc)
            last_error = "The AI did not return a valid quiz. Please try again."
            continue

        written += len(items_raw)
        # Screened against what is already kept, so the checker only spends
        # tokens on questions that could still join this quiz.
        candidates = filter_questions(
            [*kept, *items_raw],
            budgets=budgets,
            cap=int_value(_limits(), "maxWrite") + len(kept),
            avoid=printed,
        )[len(kept):]
        pending = normalize_results(results_raw, budget=budgets.description)
        pending = RetireeQuizResults(
            **{style: "" if getattr(results, style) else getattr(pending, style) for style in OUTCOMES}
        )
        checked += len(candidates)
        try:
            confirmed, confirmed_results = await verify_quiz(candidates, pending, seed)
        except Exception as exc:
            logger.warning("studio_retiree_quiz_check_failed attempt=%s error=%s", attempt + 1, exc)
            last_error = CHECK_ERROR
            continue

        results = _merge_results(results, confirmed_results)
        kept = filter_questions([*kept, *confirmed], budgets=budgets, cap=cap, avoid=())
        if len(kept) >= target:
            break
        last_error = FINAL_ERROR

    if not kept:
        raise RetireeQuizGenerationError(last_error)

    remember(_scope(req, user_id, req.seed), (avoid_label(item.question) for item in kept))
    logger.info(
        "studio_retiree_quiz_generated model=%s latency_ms=%s written=%s checked=%s "
        "verified=%s results=%s mixed=%s",
        settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        written,
        checked,
        len(kept),
        sum(1 for style in OUTCOMES if getattr(results, style)),
        req.mixed_topics,
    )
    return RetireeQuizResponse(questions=kept, results=results)


def build_prompt_for_tests(req: RetireeQuizRequest, *, seed: int | None = None) -> str:
    return _build_prompt(req, seed=seed)


def parse_payload_for_tests(raw: str) -> tuple[list[Any], Any]:
    return _parse_payload(raw)
