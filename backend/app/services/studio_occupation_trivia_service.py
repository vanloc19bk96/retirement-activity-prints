"""Generate Occupation Trivia Pack questions via Gemini.

A pack is about ten multiple-choice questions on one occupation -- a teacher's
chalk and grade book, a trucker's fifth wheel and CB channels, a postal
worker's sorting case -- each with one right answer, three believable wrong
ones, and a short note for the answer page:

    What was the flat wooden frame of pigeonholes a carrier sorted letters
    into called?
    (right) A sorting case  (wrong) A mail crate / A letter rack / A route box
    Note: Carriers "cased" their route's mail into a sorting case before
    heading out.

The answer key is the product, and this is printed and sold on KDP, so nothing
reaches the page on the writer's word alone:

* **Shape first.** A question is one plain question ending in a single
  question mark; each choice a short phrase; the note one standalone sentence.
  The right answer is its own field, never an index, so no reordering can
  point the key at a wrong choice. Four choices must be distinct, of similar
  length, and never "all of the above". A question that gives its own answer
  away, addresses the reader, leans on "today" or "currently", hedges, or
  talks down to a retiree ("do you still remember...") is dropped, not
  repaired.
* **A blind check that answers the question.** A second call sees every
  question with its four choices shuffled and must pick the right one itself,
  without being told which it is. It then rates the question: a settled fact,
  about this occupation rather than work in general, clearly worded with its
  country or era named when the answer depends on one, fairly pitched (no
  exam, calculation or current rule), wrong choices believable yet clearly
  wrong, and suitable. It flags a question that asks the same fact as an
  earlier one, and judges every answer-page note on its own, shuffled apart
  from its question. A question survives only when the pick is the writer's
  answer, every rating is true and its note is true. If the check cannot run,
  nothing is returned.
* **One fact once.** Questions are compared on the fact they test: the same
  answer, the same topic, or most of the same content words (qualifiers
  dropped, endings and synonyms folded -- "blackboard" is "chalkboard"). Checked
  within the reply, against what the client says the book already prints, and
  against this worker's memory for the seller and occupation.
* **Occupation care.** Each occupation carries its own rules and blocked words
  on top of the shared ones: no medical advice in a Nurse pack, no weapons or
  tactics in a Police or Military pack, no current regulations for Truckers or
  tax law for Accountants.

Variety is structural. Each requested question gets its own brief -- one of
the occupation's topic areas and a question shape, sampled by seed -- so a
pack ranges across the job's tools, terms, routines and history instead of
ten questions about chalk.
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
from app.schemas.studio_occupation_trivia import (
    OccupationTriviaCheckOutput,
    OccupationTriviaModelOutput,
    OccupationTriviaQuestion,
    OccupationTriviaRequest,
    OccupationTriviaResponse,
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

GAME = "occupation-trivia"
FINAL_ERROR = "Could not write trivia questions good enough to print. Please try again."
CHECK_ERROR = "Could not fact-check these trivia questions. Please try again."
# Remembered labels a new question is checked against. Bounded, so the check
# stays a few thousand token comparisons however long a seller keeps going.
MEMORY_FILTER_LIMIT = 200
AVOID_LABEL_CHARS = 60
DISTRACTORS = 3
CHOICES = DISTRACTORS + 1
# Share of content words two questions may have in common before they are one question.
QUESTION_REPEAT_JACCARD = 0.6

_MEDICAL_RE = re.compile(
    r"\bprevent\s+dementia\b|\breverse\s+aging\b|\bcures?\s+for\b|\banti[\s-]?aging\b|\bmemory\s+loss\b",
    re.IGNORECASE,
)
_FINANCE_RE = re.compile(
    r"\bguaranteed\s+(return|income|profit)|\binvest\s+now\b|\bget[\s-]?rich\b|"
    r"\bcrypto|\bbitcoin\b|\bday[\s-]?trad|\bpenny\s+stock",
    re.IGNORECASE,
)
# An approximate number cannot be marked right or wrong.
_NUMERIC_HEDGE_RE = re.compile(
    r"\b(about|around|nearly|almost|roughly|approximately|up\s+to|more\s+than|less\s+than|fewer\s+than)\s+\$?£?\d",
    re.IGNORECASE,
)
_YEAR_RE = re.compile(r"\b(1[0-9]{3}|20[0-9]{2})s?\b")
_QUESTION_ALLOWED_RE = re.compile(r"^[A-Za-z0-9 ,'’\-–().:;&%£$/\"“”?]+$")
_CHOICE_ALLOWED_RE = re.compile(r"^[A-Za-z0-9 ,'’\-–().&%£$/\"“”]+$")
_SENTENCE_ALLOWED_RE = re.compile(r"^[A-Za-z0-9 ,'’\-–().:;&%£$/\"“”]+$")
_TOPIC_ALLOWED_RE = re.compile(r"^[A-Za-z0-9 '’\-]+$")
# A second sentence ("... in 1901. It was ...") inside one note.
_INNER_SENTENCE_RE = re.compile(r"[.;:!?]\s+[A-Z]")
# Abbreviations whose full stop does not end a sentence ("the U.S. Army").
_ABBREVIATION_RE = re.compile(
    r"\b(?:U\.S|U\.K|Mr|Mrs|Ms|Dr|St|No|Jr|Sr|Lt|Sgt|Cpl|Pvt|Col|Gen|Capt|Maj|Adm|a\.m|p\.m|e\.g|i\.e)\.",
    re.IGNORECASE,
)
_NUMBER_RE = re.compile(r"^\s*(\(?(\d{1,2}|[A-Da-d])[.):]\s+|[-*•]\s+)")
# A colon, never a hyphen: "A-frame" is a choice, not "A -" and "frame".
_LABEL_RE = re.compile(
    r"^\s*(question|answer|correct answer|choice|option|note|fact|explanation|topic)\s*:\s*",
    re.IGNORECASE,
)
_EDGE_TRIM_CHARS = "'‘’ "
_TOKEN_RE = re.compile(r"[a-z0-9]+")


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


@lru_cache(maxsize=1)
def _blocked_re() -> re.Pattern[str]:
    return word_pattern(
        [*string_list(_config(), "blockedTerms"), *string_list(_config(), "framingTerms")]
    )


@lru_cache(maxsize=1)
def _brand_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "brandTerms"))


@lru_cache(maxsize=1)
def _time_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "timeTerms"))


@lru_cache(maxsize=1)
def _hedge_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "hedgeTerms"))


@lru_cache(maxsize=1)
def _absolute_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "absoluteTerms"))


@lru_cache(maxsize=1)
def _bad_choice_re() -> re.Pattern[str]:
    return word_pattern(string_list(_config(), "badChoiceTerms"))


@lru_cache(maxsize=None)
def _occupation_re(occupation: str) -> re.Pattern[str]:
    return word_pattern(string_list(_profile(occupation), "blockedTerms"))


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


def _profile(occupation: str) -> Mapping[str, Any]:
    return section(section(_config(), "occupations"), occupation)


_rate_limiter = RateLimiter(
    label="Occupation Trivia Pack",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class OccupationTriviaRateLimitError(StudioRateLimitError):
    """User exceeded the short-window Occupation Trivia Pack quota."""


class OccupationTriviaGenerationError(StudioGenerationError):
    """Model output could not be turned into verified trivia questions."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise OccupationTriviaRateLimitError(str(exc)) from exc


def _scope(req: OccupationTriviaRequest, user_id: str, seed: int) -> VarietyScope:
    """One memory per occupation, across levels: a fact printed on a Gentle pack must not return on a Classic one."""
    return VarietyScope(game=GAME, user_id=user_id, bucket=bucket_key(req.occupation), seed=seed)


@dataclass(frozen=True)
class Budgets:
    question: int
    choice: int
    explanation: int


def budgets_for(req: OccupationTriviaRequest) -> Budgets:
    limits = _limits()
    return Budgets(
        question=min(int_value(limits, "maxQuestionChars"), req.max_question_chars),
        choice=min(int_value(limits, "maxChoiceChars"), req.max_choice_chars),
        explanation=min(int_value(limits, "maxExplanationChars"), req.max_explanation_chars),
    )


# ---------------------------------------------------------------- text keys


def is_unsafe(text: str, occupation: str) -> bool:
    return bool(
        _MEDICAL_RE.search(text)
        or _FINANCE_RE.search(text)
        or _blocked_re().search(text)
        or _brand_re().search(text)
        or _occupation_re(occupation).search(text)
    )


def is_unverifiable(text: str) -> bool:
    """Worded so it is true only for now, only roughly, or only by hearsay."""
    if _time_re().search(text) or _hedge_re().search(text) or _NUMERIC_HEDGE_RE.search(text):
        return True
    latest = int_value(_limits(), "latestYear")
    return any(int(year) > latest for year in _YEAR_RE.findall(text))


def _stem(token: str) -> str:
    """Fold plurals and regular verb endings. Deliberately crude: only ever compared with another stem."""
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
    """The words that carry a question's meaning: qualifiers dropped, endings and synonyms folded."""
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


def _folded(text: str) -> str:
    return " ".join(_raw_tokens(text))


def answers_match(first: str, second: str) -> bool:
    """True when two answers name the same thing: "The chalk" / "Chalk"."""
    a, b = content_tokens(first), content_tokens(second)
    if not a or not b:
        return _folded(first) == _folded(second)
    return a == b


def topics_repeat(first: str, second: str) -> bool:
    """True when one topic names the other: "chalk" / "blackboard chalk"."""
    a, b = content_tokens(first), content_tokens(second)
    if not a or not b:
        return _folded(first) == _folded(second)
    return a <= b or b <= a


def questions_repeat(item: OccupationTriviaQuestion, other: OccupationTriviaQuestion) -> bool:
    """True when two questions test the same fact, however they are worded.

    The same answer is the strongest sign ("What did teachers write on the
    blackboard with?" / "Which item did teachers use on a chalkboard?" both
    answer Chalk); the same topic or most of the same content words catch the
    rest.
    """
    if answers_match(item.answer, other.answer) or topics_repeat(item.topic, other.topic):
        return True
    return _jaccard(content_tokens(item.question), content_tokens(other.question)) >= QUESTION_REPEAT_JACCARD


def question_label(occupation: str, item: OccupationTriviaQuestion) -> str:
    """What a printed question is remembered by: "teacher: blackboard chalk = chalk".

    The occupation keeps a nurse's "clipboard" from ruling out a trucker's, and
    the topic and answer are the fact itself, so the label outlives rewording.
    """
    topic = _folded(item.topic)[:28].strip()
    answer = _folded(item.answer)[:20].strip()
    return f"{occupation}: {topic} = {answer}"[:AVOID_LABEL_CHARS].strip()


def label_repeats(item: OccupationTriviaQuestion, label: str, occupation: str) -> bool:
    """True when ``label`` -- a printed question's label -- names this question's fact."""
    text = str(label or "").strip()
    head, sep, rest = text.partition(": ")
    if sep:
        if head.strip().lower() != occupation:
            return False
        text = rest
    topic, sep, answer = text.partition(" = ")
    if sep and answer.strip() and answers_match(item.answer, answer):
        return True
    return bool(topic.strip()) and topics_repeat(item.topic, topic)


# ---------------------------------------------------------------- gates


def _clean(raw: Any) -> str:
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    return text.strip(_EDGE_TRIM_CHARS)


def _strip_labels(raw: Any) -> str:
    text = _clean(raw)
    for pattern in (_NUMBER_RE, _LABEL_RE):
        text = pattern.sub("", text).strip()
    return text.strip(_EDGE_TRIM_CHARS)


def _mostly_caps(text: str) -> bool:
    letters = [ch for ch in text if ch.isalpha()]
    return not letters or sum(ch.isupper() for ch in letters) > len(letters) * 0.4


def _balanced_quotes(text: str) -> bool:
    return text.count('"') % 2 == 0 and text.count("“") == text.count("”")


def _personal(text: str) -> bool:
    """Addresses the reader ("you", "we") -- trivia states a fact, it does not test the reader."""
    return any(token in _personal_words() for token in _raw_tokens(text))


def normalize_question(raw: Any, *, budget: int, occupation: str) -> str | None:
    """One plain question ending in a single question mark -- or None."""
    text = _strip_labels(raw)
    if not text or not text.endswith("?") or text.count("?") != 1:
        return None
    if not _QUESTION_ALLOWED_RE.match(text) or not _balanced_quotes(text):
        return None
    if not text[0].isupper() or _mostly_caps(text):
        return None
    limits = _limits()
    if len(text.split()) > int_value(limits, "maxQuestionWords"):
        return None
    if not int_value(limits, "minQuestionChars") <= len(text) <= budget:
        return None
    if _personal(text) or _absolute_re().search(text):
        return None
    if is_unsafe(text, occupation) or is_unverifiable(text):
        return None
    return text


def normalize_choice(raw: Any, *, budget: int, occupation: str) -> str | None:
    """One short answer choice, with no closing full stop -- or None."""
    text = _strip_labels(raw)
    if text.endswith(".") and not text.endswith(".."):
        text = text[:-1].rstrip()
    if not text or not _CHOICE_ALLOWED_RE.match(text) or not _balanced_quotes(text):
        return None
    if not (text[0].isupper() or text[0].isdigit() or text[0] in "\"“$£"):
        return None
    letters = [ch for ch in text if ch.isalpha()]
    # Short acronyms ("CPA", "ZIP code") are fine; a shouted phrase is not.
    if len(letters) > 6 and _mostly_caps(text):
        return None
    limits = _limits()
    if len(text.split()) > int_value(limits, "maxChoiceWords"):
        return None
    if not int_value(limits, "minChoiceChars") <= len(text) <= budget:
        return None
    if _personal(text) or _bad_choice_re().search(text):
        return None
    if is_unsafe(text, occupation) or is_unverifiable(text):
        return None
    return text


def normalize_explanation(raw: Any, *, budget: int, occupation: str) -> str | None:
    """One standalone sentence for the answer page, ending in a full stop -- or None."""
    text = _strip_labels(raw).rstrip(" .").strip()
    if not text or "?" in text or "!" in text:
        return None
    if not _SENTENCE_ALLOWED_RE.match(text):
        return None
    if _INNER_SENTENCE_RE.search(_ABBREVIATION_RE.sub("abbr", text)):
        return None
    if not _balanced_quotes(text) or not text[0].isupper() or _mostly_caps(text):
        return None
    limits = _limits()
    if len(text.split()) > int_value(limits, "maxExplanationWords"):
        return None
    sentence = f"{text}."
    if not int_value(limits, "minExplanationChars") <= len(sentence) <= budget:
        return None
    if _personal(sentence) or is_unsafe(sentence, occupation) or is_unverifiable(sentence):
        return None
    return sentence


def normalize_topic(raw: Any) -> str | None:
    """A short noun phrase naming the fact under test ("blackboard chalk") -- or None."""
    text = _clean(raw).strip(" .:;,").lower()
    if not text or not _TOPIC_ALLOWED_RE.match(text):
        return None
    if not 1 <= len(text.split()) <= 6 or len(text) > 48:
        return None
    return text if content_tokens(text) else None


def _choices_balanced(choices: Sequence[str]) -> bool:
    """The right answer must not give itself away by being far longer or shorter."""
    limits = _limits()
    lengths = [len(choice) for choice in choices]
    shortest, longest = min(lengths), max(lengths)
    ratio = int_value(limits, "choiceLengthRatioPercent") / 100
    return longest <= max(shortest * ratio, shortest + int_value(limits, "choiceLengthSlackChars"))


def _choices_distinct(choices: Sequence[str]) -> bool:
    """Four different choices: never the same words, never one inside another ("Chalk" / "Coloured chalk")."""
    for i, first in enumerate(choices):
        a = content_tokens(first)
        for second in choices[i + 1 :]:
            b = content_tokens(second)
            if _folded(first) == _folded(second):
                return False
            if a and b and (a <= b or b <= a):
                return False
    return True


def normalize_item(raw: Any, *, budgets: Budgets, occupation: str) -> OccupationTriviaQuestion | None:
    """One complete, well-formed question -- or None. Never a repaired one.

    Well-formed is not right: this is every check that can be made without
    knowing the facts. The blind check decides the rest.
    """
    if not isinstance(raw, dict):
        return None
    topic = normalize_topic(raw.get("topic"))
    question = normalize_question(raw.get("question"), budget=budgets.question, occupation=occupation)
    answer = normalize_choice(raw.get("answer"), budget=budgets.choice, occupation=occupation)
    explanation = normalize_explanation(
        raw.get("explanation"), budget=budgets.explanation, occupation=occupation
    )
    if topic is None or question is None or answer is None or explanation is None:
        return None
    raw_distractors = raw.get("distractors")
    if not isinstance(raw_distractors, list) or len(raw_distractors) != DISTRACTORS:
        return None
    distractors = [
        normalize_choice(value, budget=budgets.choice, occupation=occupation) for value in raw_distractors
    ]
    if any(d is None for d in distractors):
        return None
    choices = [answer, *distractors]
    if not _choices_distinct(choices) or not _choices_balanced(choices):  # type: ignore[arg-type]
        return None
    # A question that already holds its answer ("Which chalk ...?" -> "Chalk") asks nothing.
    answer_tokens = content_tokens(answer)
    if answer_tokens and answer_tokens <= content_tokens(question):
        return None
    # The note has to be about this question, not a stray fact.
    if not content_tokens(explanation) & (answer_tokens | content_tokens(question)):
        return None
    # Never verified here, whatever the input claims: only the checker marks a question.
    return OccupationTriviaQuestion(
        topic=topic,
        question=question,
        answer=answer,
        distractors=distractors,  # type: ignore[arg-type]
        explanation=explanation,
    )


def filter_items(
    raw_items: Iterable[Any],
    *,
    budgets: Budgets,
    occupation: str,
    cap: int,
    avoid: Iterable[str] = (),
    kept: Sequence[OccupationTriviaQuestion] = (),
) -> list[OccupationTriviaQuestion]:
    """Keep the well-formed questions a pack can print without repeating a fact.

    ``kept`` is what the pack already holds; ``avoid`` holds labels of questions
    already printed.
    """
    avoided = [label for label in (str(a or "").strip() for a in avoid) if label]
    out: list[OccupationTriviaQuestion] = []
    for raw in raw_items:
        item = normalize_item(raw, budgets=budgets, occupation=occupation)
        if item is None:
            continue
        if any(questions_repeat(item, other) for other in (*kept, *out)):
            continue
        if any(label_repeats(item, label, occupation) for label in avoided):
            continue
        out.append(item)
        if len(out) >= cap:
            break
    return out


# ---------------------------------------------------------------- the writer


def _parse_payload(raw: str) -> list[Any]:
    data = parse_json_object(raw)
    items = data.get("items", data.get("questions"))
    if not isinstance(items, list) or not items:
        raise ValueError("invalid JSON: missing items")
    return items


def _level(level: str) -> Mapping[str, Any]:
    return section(section(_config(), "levels"), level)


def _briefs(occupation: str, want: int, seed: int) -> list[str]:
    """One distinct brief per question: a topic area of the job and a question shape.

    Areas and shapes are shuffled by seed independently, so an area meets a
    different shape on the next pack, and no area repeats within a reply until
    every other one has been used.
    """
    rng = random.Random(seed)
    areas = list(string_list(_profile(occupation), "areas"))
    shapes = list(string_list(_config(), "shapes"))
    rng.shuffle(areas)
    rng.shuffle(shapes)
    return [
        f"{index + 1}. area: {areas[index % len(areas)]}; shape: {shapes[index % len(shapes)]}"
        for index in range(want)
    ]


def _json_list(values: Iterable[str]) -> str:
    return "[" + ", ".join(f'"{value}"' for value in values) + "]"


def _build_prompt(req: OccupationTriviaRequest, *, seed: int | None = None) -> str:
    limits = _limits()
    want = min(int_value(limits, "maxWrite"), req.count + 4)
    prompt_seed = req.seed if seed is None else seed
    language = locale_line(section(_config(), "locale"), req.locale)
    budgets = budgets_for(req)
    profile = _profile(req.occupation)
    briefs = "\n".join(_briefs(req.occupation, want, prompt_seed))
    example = section(_config(), "example")
    latest = int_value(limits, "latestYear")

    return f"""Create multiple-choice trivia questions for an "Occupation Trivia Pack" in a
large-print retirement activity book. This pack is for {profile["who"]} -- many
readers did this job for decades and are proud of it. Every question should give
a retired {str(profile["label"]).lower()} a spark of recognition: the tools, terms,
routines, traditions and history of the job as they knew it.

Level -- {_level(req.level)["writer"]}

Write exactly {want} questions, one per brief, in this order:
{briefs}

How to build each question -- in this order:
1. "area": the brief's area, copied.
2. "topic": 2 to 5 words naming the one fact the question tests ("sorting case",
   "night shift handover"). Every question in this reply tests a DIFFERENT fact.
3. "question": one clear question in the brief's shape, ending with a question
   mark, at most {budgets.question} characters.
4. "answer": the one right answer, at most {budgets.choice} characters.
5. "distractors": exactly three wrong answers, each at most {budgets.choice} characters.
6. "explanation": one short sentence for the answer page that states the fact
   and names the answer, at most {budgets.explanation} characters.

The job:
- Knowledge that belongs to THIS job: its tools, equipment, terms, routines,
  traditions, workplaces and history. Never general workplace knowledge with the
  job's name added, and never general knowledge anyone could answer.
- {profile["care"]}

Facts:
- Settled, well-documented facts that any good reference confirms and that will
  not change: history, how things worked, what things were called, where names
  came from. Nothing after {latest}.
- Never current rules, laws, regulations, salaries, prices, tax rules, medical
  guidelines, standards or policies. Nothing that holds only "today".
- If an answer depends on a country, branch, organisation or era, name it in
  the question ("In the U.S. Postal Service, ...", "In the 1950s, ...").
  Otherwise choose facts that hold across English-speaking countries.
- Exact, not approximate; no "about", "reportedly" or "some say". If you are not
  certain the answer is right, choose another fact.

Questions:
- Clear and concise; understandable without specialist training. Difficulty
  comes from interesting knowledge and memory, never from exam, certification,
  legal-compliance or calculation questions.
- Ask it straight: never a negative ("Which is NOT ..."), never "only", "best"
  or "always", and never words from the answer.
- Celebrate the reader's experience: never "Do you remember ...", never address
  the reader ("you", "your"), never a joke at the job's or at older people's
  expense.

Choices:
- One answer is clearly right; the three wrong ones are believable to someone
  outside the job but clearly wrong: same kind of thing, similar length and
  style (all years, all tools, all short phrases). Never absurd, never a joke,
  never nearly the same as the right answer, never partly right.
- No "All of the above", "None of the above" or "Both".

Never: violence, weapons, death, injury, illness as a subject, politics,
religion, alcohol, tobacco, gambling, brand names or trademarks, celebrities,
living people, company slogans, quotations, lyrics or film lines. A person of
the past may be named when the fact is about their work. Write every word
yourself -- never copy from trivia books, quiz sites, exams, training manuals or
games.
{language}

Return JSON only:
{{ "items": [ {{ "brief": 1, "area": "{example["area"]}", "topic": "{example["topic"]}",
  "question": "{example["question"]}",
  "answer": "{example["answer"]}",
  "distractors": {_json_list(example["distractors"])},
  "explanation": "{example["explanation"]}" }} ] }}
(That example is about {example["occupation"]} and shows the shape only. Never write about its fact.)
"""


async def _call_writer(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        temperature=0.9,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=OccupationTriviaModelOutput,
        label="occupation_trivia",
    )


# ---------------------------------------------------------------- the checker


def _letter(position: int) -> str:
    return chr(65 + position)


@dataclass(frozen=True)
class CheckPlan:
    """How the candidates were shown to the checker, so its reply maps back.

    ``orders[i][pos]`` is the choice of candidate ``i`` shown at letter ``pos``:
    0 is the answer, 1-3 the distractors. ``note_order[pos]`` is the candidate
    whose note is shown at note ``pos + 1``.
    """

    prompt: str
    orders: tuple[tuple[int, ...], ...]
    note_order: tuple[int, ...]


def build_check_plan(
    candidates: Sequence[OccupationTriviaQuestion],
    seed: int,
    occupation: str,
    level: str = "classic",
) -> CheckPlan:
    """A prompt that never says which choice is right.

    Choices are shuffled per question, so the checker answers the very
    question the reader will; and the answer-page notes are listed apart,
    shuffled across questions, so each is judged as a claim on its own.
    """
    rng = random.Random(seed ^ 0x0CC7A1)
    orders: list[tuple[int, ...]] = []
    blocks: list[str] = []
    for index, item in enumerate(candidates):
        choices = [item.answer, *item.distractors]
        order = list(range(CHOICES))
        rng.shuffle(order)
        orders.append(tuple(order))
        lines = "\n".join(f"   {_letter(pos)}. {choices[k]}" for pos, k in enumerate(order))
        blocks.append(f"Q{index + 1}. {item.question}\n{lines}")

    note_order = list(range(len(candidates)))
    rng.shuffle(note_order)
    notes = "\n".join(
        f"Note {pos + 1}. {candidates[k].explanation}" for pos, k in enumerate(note_order)
    )
    profile = _profile(occupation)
    questions = "\n\n".join(blocks)

    prompt = f"""You are a strict fact-checker and editor for a published, large-print
trivia book for retirees. This pack is for {profile["who"]}. A wrong or
debatable answer key means refunds, so when in doubt, answer false.

Each question below has four lettered choices in random order. The letters
mean nothing: work out every answer yourself from well-established reference
knowledge (encyclopedias, standard histories, official records).

For each question:
- "answer": the letter of the one right choice; "several" if more than one
  choice could reasonably be called right; "none" if no choice is right.
- "certain": true only if the right answer is a settled, well-documented fact --
  not disputed, not a popular myth, not only partly true, and not dependent on a
  country, branch or date the question does not name.
- "on_topic": true only if it tests knowledge that belongs to this job (its
  tools, terms, routines, traditions or history) that someone who did the job
  would recognise -- not general workplace or general knowledge with the job's
  name added.
- "clear": true only if the question has one reading, is not a trick, and names
  the country, branch, organisation or era when the answer depends on one.
- "plausible": true only if every wrong choice is believable to someone outside
  the job yet clearly wrong: none absurd, none a joke, none nearly the same as
  the right answer.
- "fair": true only if {_level(level)["checker"]}; answerable from job
  knowledge and memory; no calculation, exam or certification material, and no
  current law, regulation, salary, price, tax rule, medical guideline or policy.
- "suitable": true only if it is respectful and warm: no stereotype or mockery
  of the job or of older people, no "do you remember" framing, no brands,
  celebrities or living people, no politics, religion or violence, and it keeps
  to this rule: {profile["care"]}
- "duplicate_of": the number of an EARLIER question in this list that tests the
  same fact, however worded; 0 if none.

QUESTIONS
{questions}

Then judge each note below on its own, exactly as worded:
- "true": accurate in every detail and not a matter of debate.
- "false": contradicted by well-established knowledge.
- "unsure": you are not certain, it is only partly true, or it depends on a
  country or date it does not name.

NOTES
{notes}

Return JSON only, one entry per question and per note:
{{ "items": [ {{ "index": 1, "answer": "C", "certain": true, "on_topic": true,
  "clear": true, "plausible": true, "fair": true, "suitable": true,
  "duplicate_of": 0 }} ],
  "notes": [ {{ "index": 1, "verdict": "true" }} ] }}
"""
    return CheckPlan(prompt=prompt, orders=tuple(orders), note_order=tuple(note_order))


def _picked(raw: Any, order: Sequence[int]) -> int | None:
    """The choice the checker picked (0 = the writer's answer), or None."""
    letter = str(raw or "").strip().upper().rstrip(".")
    if len(letter) != 1 or not "A" <= letter <= "Z":
        return None
    position = ord(letter) - 65
    if position >= len(order):
        return None
    return order[position]


def _verdict(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    return value if value in ("true", "false") else "unsure"


def _duplicate_of(raw: Any) -> int:
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 0


def apply_check(
    candidates: Sequence[OccupationTriviaQuestion],
    plan: CheckPlan,
    raw_check: Mapping[str, Any],
) -> list[OccupationTriviaQuestion]:
    """The candidates the checker independently answered and passed, marked verified.

    A question passes only when the letter the checker picked is the writer's
    answer, every rating is true, its note reads "true", and it does not repeat
    an earlier question. A missing, duplicated or malformed entry fails the
    question it belongs to.
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

    notes_by_index: dict[int, str] = {}
    for entry in raw_check.get("notes") or []:
        if not isinstance(entry, Mapping):
            continue
        try:
            index = int(entry.get("index"))
        except (TypeError, ValueError):
            continue
        notes_by_index.setdefault(index, _verdict(entry.get("verdict")))
    note_verdicts = {
        candidate: notes_by_index.get(pos + 1, "unsure")
        for pos, candidate in enumerate(plan.note_order)
    }

    flags = ("certain", "on_topic", "clear", "plausible", "fair", "suitable")
    kept: list[OccupationTriviaQuestion] = []
    for index, item in enumerate(candidates):
        entry = entries.get(index + 1)
        if entry is None:
            continue
        if _picked(entry.get("answer"), plan.orders[index]) != 0:
            continue
        if not all(entry.get(flag) is True for flag in flags):
            continue
        if 0 < _duplicate_of(entry.get("duplicate_of")) <= index:
            continue
        if note_verdicts.get(index) != "true":
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
        response_schema=OccupationTriviaCheckOutput,
        thinking_level="low",
        model=settings.STUDIO_FACT_CHECK_MODEL or None,
        label="occupation_trivia_check",
    )


async def verify_items(
    candidates: Sequence[OccupationTriviaQuestion],
    seed: int,
    occupation: str,
    level: str = "classic",
) -> list[OccupationTriviaQuestion]:
    """Run the blind check. Raises when the check itself could not run."""
    if not candidates:
        return []
    plan = build_check_plan(candidates, seed, occupation, level)
    raw = await _call_checker(plan.prompt)
    return apply_check(candidates, plan, parse_json_object(raw))


# ---------------------------------------------------------------- the run


def _min_items(cap: int) -> int:
    """Below this the pack may not fill, so another round is worth its cost.

    Every round is two paid calls, and the client asks for a few spares on top
    of its fullest pack; three quarters of that is a full pack.
    """
    return max(1, (cap * 3 + 3) // 4)


async def generate_occupation_trivia(
    req: OccupationTriviaRequest, user_id: str
) -> OccupationTriviaResponse:
    _check_rate_limit(user_id)

    budgets = budgets_for(req)
    cap = min(int_value(_limits(), "poolSize"), req.count)
    attempts = int_value(_limits(), "maxAttempts")
    last_error = FINAL_ERROR
    started = time.perf_counter()
    kept: list[OccupationTriviaQuestion] = []
    written = checked = 0
    # What this seller printed before: the client's list (spans workers and
    # restarts) plus this worker's own memory. A question that repeats either is
    # dropped here, not just discouraged in the prompt.
    printed = [*req.avoid, *recent(_scope(req, user_id, req.seed), MEMORY_FILTER_LIMIT)]

    for attempt in range(attempts):
        seed = req.seed + attempt * 97
        scope = _scope(req, user_id, seed)
        avoid = [*req.avoid, *(question_label(req.occupation, item) for item in kept)]
        prompt = with_variety(_build_prompt(req, seed=seed), scope, client_avoid=avoid)
        try:
            raw = await _call_writer(prompt)
            items_raw = _parse_payload(raw)
        except Exception as exc:
            logger.warning(
                "studio_occupation_trivia_write_failed attempt=%s error=%s", attempt + 1, exc
            )
            last_error = "The AI did not return valid trivia questions. Please try again."
            continue

        written += len(items_raw)
        candidates = filter_items(
            items_raw,
            budgets=budgets,
            occupation=req.occupation,
            cap=int_value(_limits(), "maxWrite"),
            avoid=printed,
            kept=kept,
        )
        checked += len(candidates)
        try:
            confirmed = await verify_items(candidates, seed, req.occupation, req.level)
        except Exception as exc:
            logger.warning(
                "studio_occupation_trivia_check_failed attempt=%s error=%s", attempt + 1, exc
            )
            last_error = CHECK_ERROR
            continue

        for item in confirmed:
            if len(kept) >= cap:
                break
            if not any(questions_repeat(item, other) for other in kept):
                kept.append(item)
        if len(kept) >= _min_items(cap):
            break
        last_error = FINAL_ERROR

    if not kept:
        raise OccupationTriviaGenerationError(last_error)

    remember(
        _scope(req, user_id, req.seed),
        (question_label(req.occupation, item) for item in kept),
    )
    logger.info(
        "studio_occupation_trivia_generated model=%s check_model=%s latency_ms=%s "
        "written=%s checked=%s verified=%s occupation=%s level=%s",
        settings.STUDIO_GEMINI_MODEL,
        settings.STUDIO_FACT_CHECK_MODEL or settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        written,
        checked,
        len(kept),
        req.occupation,
        req.level,
    )
    return OccupationTriviaResponse(occupation=req.occupation, questions=kept)


def build_prompt_for_tests(req: OccupationTriviaRequest, *, seed: int | None = None) -> str:
    return _build_prompt(req, seed=seed)


def parse_payload_for_tests(raw: str) -> list[Any]:
    return _parse_payload(raw)
