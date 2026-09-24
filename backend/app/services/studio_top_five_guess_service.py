"""Generate Top Five Guess question sets via Gemini.

A set is one light retirement question ("Name something you will never miss
about the office") and the five answers most people would give, ranked from
most to least likely. The reader writes five guesses and scores points for
every guess that made the list.

Everything here is printed and sold on KDP, so a set only survives if the whole
of it is honest:

* **Exactly five answers, in the model's order.** Only the first five answers
  are read. If any of them fails a gate the set is dropped -- promoting the
  sixth answer into fifth place would print a ranking nobody wrote.
* **Five different answers.** MEETINGS, LONG MEETINGS and TOO MANY MEETINGS are
  one answer to a reader, and a set that spends three slots on it has two
  answers the reader can never score. Answers are compared on their content
  words after qualifiers are dropped.
* **No fake polling.** The ranking is the set's intended answer order, not a
  survey result, so anything that reads as poll data (percentages, "we asked
  100 people") never reaches the page.
* **Nothing sensitive.** Health, death, politics, religion, alcohol, gambling
  and anything that talks down to an older reader are dropped, not reworded.

Points are never asked of the model. The page scores rank 1-5 as 5-4-3-2-1.
"""

from __future__ import annotations

import logging
import re
import time
from functools import lru_cache
from typing import Any, Iterable, Mapping

from app.core.config import settings
from app.schemas.studio_top_five_guess import (
    TopFiveGuessItem,
    TopFiveGuessModelOutput,
    TopFiveGuessRequest,
    TopFiveGuessResponse,
)
from app.services.prompt_data import (
    int_value,
    load_config,
    locale_line,
    rotate,
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
    remember,
    with_variety,
)

logger = logging.getLogger(__name__)

GAME = "top-five-guess"
FINAL_ERROR = (
    "Could not write clear Top Five questions for this theme. "
    "Try again, or pick a broader theme."
)

_MEDICAL_RE = re.compile(
    r"\bprevent\s+dementia\b|\breverse\s+aging\b|\bcure\s+memory\s+loss\b|"
    r"\btreat\s+alzheimer|\bcure\s+alzheimer|\banti[\s-]?aging\b|\bmemory\s+loss\b",
    re.IGNORECASE,
)
_BRAND_RE = re.compile(
    r"\bnintendo\b|\bdisney\b|\bmarvel\b|\bstarbucks\b|\bmcdonald|"
    r"\bcoca[\s-]?cola\b|\bharry\s+potter\b|\btaylor\s+swift\b|\bstar\s+wars\b|"
    r"\bnetflix\b|\bfacebook\b|\bamazon\b|\biphone\b|\bwalmart\b",
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
# Numbers that read as poll results or scores the model invented.
_POLL_NUMBER_RE = re.compile(r"%|\b\d+\s*(people|points?|pts|votes?)\b", re.IGNORECASE)
_LEADING_RANK_RE = re.compile(r"^\s*(#?\d+[.):-]?|[-*•])\s+")
_EDGE_TRIM_CHARS = "\"'“”‘’ "
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
def _qualifiers() -> frozenset[str]:
    return frozenset(word.lower() for word in string_list(_config(), "qualifierWords"))


_rate_limiter = RateLimiter(
    label="Top Five Guess",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class TopFiveGuessRateLimitError(StudioRateLimitError):
    """User exceeded the short-window Top Five Guess quota."""


class TopFiveGuessGenerationError(StudioGenerationError):
    """Model output could not be turned into usable question sets."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise TopFiveGuessRateLimitError(str(exc)) from exc


def _scope(req: TopFiveGuessRequest, user_id: str, seed: int) -> VarietyScope:
    """The same theme is what risks repeating an earlier page's question."""
    return VarietyScope(game=GAME, user_id=user_id, bucket=bucket_key(req.theme), seed=seed)


def _question_budget(req: TopFiveGuessRequest) -> int:
    return min(int_value(_limits(), "maxQuestionChars"), req.max_question_chars)


def _answer_budget(req: TopFiveGuessRequest) -> int:
    return min(int_value(_limits(), "maxAnswerChars"), req.max_answer_chars)


def is_unsafe(text: str) -> bool:
    return bool(
        _MEDICAL_RE.search(text)
        or _BRAND_RE.search(text)
        or _FINANCE_RE.search(text)
        or _STEREOTYPE_RE.search(text)
        or _blocked_re().search(text)
        or _POLL_NUMBER_RE.search(text)
    )


def _stem(token: str) -> str:
    """Fold plurals so MEETING and MEETINGS compare equal. Deliberately crude."""
    if len(token) > 4 and token.endswith("ies"):
        return token[:-3] + "y"
    if len(token) > 4 and token.endswith(("ches", "shes", "sses", "xes", "zes")):
        return token[:-2]
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def _content_words(text: str) -> list[str]:
    """Meaning-carrying words in reading order, qualifiers and plurals folded."""
    words = _TOKEN_RE.findall(text.lower().replace("'s", ""))
    return [_stem(word) for word in words if word not in _qualifiers()]


def content_tokens(text: str) -> frozenset[str]:
    """The words that carry an answer's meaning, qualifiers and plurals folded."""
    return frozenset(_content_words(text))


def answers_overlap(first: str, second: str) -> bool:
    """True when a reader would count the two answers as the same answer.

    Three shapes of the same guess twice: one answer inside the other (ALARMS /
    EARLY ALARM CLOCK), the same head noun (RUSH HOUR TRAFFIC / ROAD TRAFFIC),
    or half their meaning shared. Erring towards "same" only ever costs a set;
    erring the other way prints a slot the reader cannot score.
    """
    words_a, words_b = _content_words(first), _content_words(second)
    if not words_a or not words_b:
        return first.strip().lower() == second.strip().lower()
    a, b = frozenset(words_a), frozenset(words_b)
    if a <= b or b <= a or words_a[-1] == words_b[-1]:
        return True
    return len(a & b) / len(a | b) >= 0.5


def _clean(raw: Any) -> str:
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    return text.strip(_EDGE_TRIM_CHARS)


def normalize_question(raw: Any, *, budget: int) -> str | None:
    """One sentence-case question that ends in ? or ., or None."""
    text = _clean(raw)
    if not text:
        return None
    text = text[0].upper() + text[1:]
    if text[-1] not in ".?":
        text = f"{text.rstrip('!,;:')}?"
    words = len(text.split())
    if len(text) < int_value(_limits(), "minQuestionChars") or len(text) > budget:
        return None
    if words > int_value(_limits(), "maxQuestionWords"):
        return None
    if is_unsafe(text):
        return None
    return text


def normalize_answer(raw: Any, *, budget: int) -> str | None:
    """A short sentence-case answer with no rank, points or stop, or None."""
    text = _LEADING_RANK_RE.sub("", _clean(raw)).rstrip(".!?,;:").strip()
    if not text:
        return None
    text = text[0].upper() + text[1:]
    if len(text) < int_value(_limits(), "minAnswerChars") or len(text) > budget:
        return None
    if len(text.split()) > int_value(_limits(), "maxAnswerWords"):
        return None
    if not re.search(r"[A-Za-z]", text) or is_unsafe(text):
        return None
    return text


def _answer_echoes_question(answer: str, question: str) -> bool:
    """An answer made only of the question's own words hands itself over."""
    tokens = content_tokens(answer)
    return bool(tokens) and tokens <= content_tokens(question)


def normalize_set(raw: Any, *, question_budget: int, answer_budget: int) -> TopFiveGuessItem | None:
    """One complete, honest set -- or None. Never a repaired one."""
    if not isinstance(raw, dict):
        return None
    question = normalize_question(raw.get("question", raw.get("prompt")), budget=question_budget)
    if question is None:
        return None
    raw_answers = raw.get("answers")
    need = int_value(_limits(), "answersPerSet")
    if not isinstance(raw_answers, list) or len(raw_answers) < need:
        return None

    answers: list[str] = []
    for value in raw_answers[:need]:
        if isinstance(value, dict):
            value = value.get("answer", value.get("text"))
        answer = normalize_answer(value, budget=answer_budget)
        if answer is None or _answer_echoes_question(answer, question):
            return None
        if any(answers_overlap(answer, kept) for kept in answers):
            return None
        answers.append(answer)
    return TopFiveGuessItem(question=question, answers=answers)


def _question_key(question: str) -> frozenset[str]:
    return content_tokens(question)


def _near_duplicate_question(a: frozenset[str], b: frozenset[str]) -> bool:
    if not a or not b:
        return a == b
    return len(a & b) / len(a | b) >= 0.6


def _shared_answers(first: TopFiveGuessItem, second: TopFiveGuessItem) -> int:
    return sum(
        1 for answer in first.answers if any(answers_overlap(answer, o) for o in second.answers)
    )


def filter_sets(
    raw_items: Iterable[Any],
    *,
    question_budget: int,
    answer_budget: int,
    cap: int,
    avoid: Iterable[str] = (),
) -> list[TopFiveGuessItem]:
    """Keep the sets a page can print, answer and score without apology."""
    avoided = [_question_key(label) for label in avoid]
    shared_limit = int_value(_limits(), "sharedAnswersPerQuestionPair")
    kept: list[TopFiveGuessItem] = []
    keys: list[frozenset[str]] = []

    for raw in raw_items:
        item = normalize_set(raw, question_budget=question_budget, answer_budget=answer_budget)
        if item is None:
            continue
        key = _question_key(item.question)
        if any(_near_duplicate_question(key, other) for other in keys + avoided):
            continue
        # Two questions a reader answers with the same list are one puzzle twice.
        if any(_shared_answers(item, other) > shared_limit for other in kept):
            continue
        kept.append(item)
        keys.append(key)
        if len(kept) >= cap:
            break
    return kept


def _parse_payload(raw: str) -> list[Any]:
    data = parse_json_object(raw)
    items = data.get("items", data.get("questions"))
    if not isinstance(items, list) or not items:
        raise ValueError("invalid JSON: missing items")
    return items


def _build_prompt(req: TopFiveGuessRequest, *, seed: int | None = None) -> str:
    want = min(int_value(_limits(), "poolSize"), req.count)
    prompt_seed = req.seed if seed is None else seed
    angle = rotate(string_list(_config(), "varietyAngles"), prompt_seed)
    language = locale_line(section(_config(), "locale"), req.locale)
    question_budget = _question_budget(req)
    answer_budget = _answer_budget(req)
    max_words = int_value(_limits(), "maxAnswerWords")

    return f"""Create "Top Five" guessing puzzles for a large-print retirement
activity book. Each puzzle is one light question. The reader writes the five
answers they think most people would give, then scores points for every guess
that matches one of your five answers.

Theme: {req.theme.strip()}
Angle: {angle}

Write {want} puzzles.

The question:
- One clear sentence, at most {question_budget} characters.
- Starts with "Name something...", "Name a...", or a similarly open prompt that
  has many everyday answers, never a single right one.
- Warm, relatable and upbeat about retirement and later life.

The five answers:
- Exactly five, ordered from the answer most people would give first to the
  fifth most likely. Every one should feel obvious once it is read.
- Each 1 to {max_words} words and at most {answer_budget} characters.
- Five genuinely different ideas. Never variations of one answer: "Meetings",
  "Long meetings" and "Too many meetings" are ONE answer.
- No answer that just repeats the question's own words.
- Plain words only: no numbering, no points, no percentages, no explanations.

Never:
- Claim or imply survey or poll results. There are no percentages, no
  "we asked 100 people"; the order is simply the intended answer order.
- Health, illness, death, ageing bodies, memory loss, money advice, politics,
  religion, alcohol, gambling, or anything that pokes fun at older people.
- Brand names, celebrities, TV shows, films, songs or book titles.
{language}

Return JSON only:
{{ "items": [ {{ "question": "Name something you will never miss about the office.",
  "answers": ["The morning commute", "Meetings", "Alarm clocks", "Deadlines", "Office politics"] }} ] }}
"""


async def _call_gemini(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        temperature=0.8,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=TopFiveGuessModelOutput,
        label="top_five_guess",
    )


def _min_sets(cap: int) -> int:
    """Below this the page may not fill, so the attempt is worth repeating.

    The client over-asks: ``count`` covers the fullest page any trim holds plus
    spares for its own layout gates. Half of that is enough for the common page,
    and every extra round trip is a paid call against a per-minute quota.
    """
    return max(1, (cap + 1) // 2)


async def generate_top_five_guess(
    req: TopFiveGuessRequest, user_id: str
) -> TopFiveGuessResponse:
    _check_rate_limit(user_id)

    question_budget = _question_budget(req)
    answer_budget = _answer_budget(req)
    cap = min(int_value(_limits(), "poolSize"), req.count)
    attempts = int_value(_limits(), "maxAttempts")
    last_error = FINAL_ERROR
    started = time.perf_counter()
    kept: list[TopFiveGuessItem] = []

    for attempt in range(attempts):
        seed = req.seed + attempt * 97
        scope = _scope(req, user_id, seed)
        # Sets already kept go into the avoid list, so a retry writes new ones.
        avoid = [*req.avoid, *(item.question for item in kept)]
        prompt = with_variety(_build_prompt(req, seed=seed), scope, client_avoid=avoid)
        try:
            raw = await _call_gemini(prompt)
            items_raw = _parse_payload(raw)
        except Exception as exc:
            logger.warning(
                "studio_top_five_guess_attempt_failed attempt=%s error=%s", attempt + 1, exc
            )
            last_error = "The AI did not return valid Top Five questions. Please try again."
            continue

        fresh = filter_sets(
            [*({"question": i.question, "answers": i.answers} for i in kept), *items_raw],
            question_budget=question_budget,
            answer_budget=answer_budget,
            cap=cap,
            avoid=req.avoid,
        )
        kept = fresh
        if len(kept) >= _min_sets(cap):
            break
        last_error = (
            "Could not get enough clear Top Five questions. Try again, or pick a broader theme."
        )

    if not kept:
        raise TopFiveGuessGenerationError(last_error)

    remember(_scope(req, user_id, req.seed), (item.question for item in kept))
    logger.info(
        "studio_top_five_guess_generated model=%s latency_ms=%s sets=%s theme=%s",
        settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        len(kept),
        req.theme[:40],
    )
    return TopFiveGuessResponse(items=kept)


def build_prompt_for_tests(req: TopFiveGuessRequest) -> str:
    return _build_prompt(req)


def parse_payload_for_tests(raw: str) -> list[Any]:
    return _parse_payload(raw)
