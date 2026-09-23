"""Generate one page of Riddle Scramble content via Gemini.

A Riddle Scramble page is a chain: unscramble each word, read the one marked
letter out of each, and those letters in row order spell the answer to a pun
riddle printed at the foot of the page. The chain is what makes the page fun
and it is also what makes it fragile — if the marked letters do not spell the
answer exactly, the reader does all the work and gets nothing back.

So the arithmetic is deliberately *not* asked of the model. A language model
told "write five words whose marked letters spell NAPS" will cheerfully return
five words that do not. This service writes only the two things a model is good
at — light retirement riddles, and themed words with short clues — and the
browser (``riddle-scramble/build.ts``) does the matching, chooses which letter
of each word to mark, and rejects any riddle its pool cannot spell.

Both halves come back in one call. A riddle with no pool to spell it is not
half a page, it is no page, and a second paid call to repair that is a second
chance to fail.
"""

from __future__ import annotations

import logging
import re
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_riddle_scramble import (
    RiddleScrambleModelOutput,
    RiddleScrambleRequest,
    RiddleScrambleResponse,
    RiddleScrambleRiddle,
    RiddleScrambleWord,
)
from app.services.studio_gemini import (
    RateLimiter,
    StudioGenerationError,
    StudioRateLimitError,
    call_gemini_json,
    parse_json_object,
)
from app.services.prompt_data import (
    int_value,
    load_config,
    locale_line,
    require,
    rotate,
    section,
    string_list,
)
from app.services.studio_variety import (
    VarietyScope,
    bucket_key,
    remember,
    with_variety,
)

logger = logging.getLogger(__name__)

GAME = "riddle-scramble"


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


@lru_cache(maxsize=1)
def _angles() -> tuple[str, ...]:
    return string_list(_config(), "varietyAngles")


@lru_cache(maxsize=1)
def _word_re() -> re.Pattern[str]:
    low = int_value(_limits(), "minWordLetters")
    high = int_value(_limits(), "maxWordLetters")
    return re.compile(rf"^[A-Z]{{{low},{high}}}$")


@lru_cache(maxsize=1)
def _awkward_letters() -> frozenset[str]:
    """Letters that make a riddle answer unspellable from ordinary words.

    An answer holding a J, Q, X or Z needs a themed word carrying that letter
    for the row it lands on, and everyday retirement vocabulary has almost
    none. The browser would reject such a riddle anyway; dropping it here means
    the model is not paid twice for the same unusable idea.
    """
    return frozenset(str(require(_limits(), "awkwardAnswerLetters")).upper())


_rate_limiter = RateLimiter(
    label="riddle-scramble",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class RiddleScrambleRateLimitError(StudioRateLimitError):
    """User exceeded the short-window riddle-scramble quota."""


class RiddleScrambleGenerationError(StudioGenerationError):
    """Model output could not be parsed into usable riddles and words."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise RiddleScrambleRateLimitError(str(exc)) from exc


def _scope(req: RiddleScrambleRequest, user_id: str) -> VarietyScope:
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.theme, str(req.answer_letters)),
        seed=req.seed,
    )


def _build_prompt(req: RiddleScrambleRequest) -> str:
    angle = rotate(_angles(), req.seed)
    language_line = locale_line(section(_config(), "locale"), req.locale)
    stem = int_value(_limits(), "clueStemLetters")
    min_riddle = int_value(_limits(), "minRiddleChars")
    awkward = ", ".join(sorted(_awkward_letters()))
    return f"""Write content for one page of a large-print retirement activity book
about: {req.theme.strip()}.
Focus angle for variety: {angle}.
Seed for variety: {req.seed}.

The page prints {req.answer_letters} scrambled words. The solver unscrambles
them, reads one marked letter out of each, and those letters spell the answer
to a riddle at the foot of the page. You write the riddles and the words; the
layout program does the letter matching, so the words do not have to spell
anything.

Part 1 - {req.riddle_count} riddles.
- Each riddle is one short question ending in a question mark.
- {min_riddle}-{req.max_riddle_chars} characters, counted including spaces. This is a
  hard limit: a longer riddle does not fit the printed page and is dropped.
- The answer is ONE English word of EXACTLY {req.answer_letters} letters.
  Count the letters before writing.
- Gentle, warm, groan-worthy puns about life after work. The reader is the
  person who retired; the joke is with them, never at them.
- Everyday answer words an adult recognises at once.
- The answer must not contain the letters {awkward}.
- A riddle must never contain its own answer, or a word sharing the answer's
  first {stem} letters.
- No proper nouns, brands, song or film titles, or real people.
- Nothing about illness, money worries, dying, or being past it.
- All {req.riddle_count} riddles must be different ideas with different answers.

Part 2 - {req.word_count} single words about the theme, each with one clue.
- {req.min_letters}-{req.max_letters} letters, A-Z only. Count the letters before writing.
- Single words only - no phrases, hyphens, spaces or plurals of another entry.
- Familiar vocabulary for adults and seniors, clearly about the theme.
- No proper nouns, brands, abbreviations or slang.
- No duplicates, and no two words built from the same set of letters.
- Prefer words whose letters spell only ONE common English word
  (skip lemon/melon, listen/silent, earth/heart, angle/glean, trial/trail).
- Spread the alphabet: between them the words should cover as many different
  letters as possible, because each word has to supply one letter of an answer.
- Clue rules: at most {req.max_clue_chars} characters including spaces, a plain
  definition rather than wordplay, never containing the word or anything
  sharing its first {stem} letters, and no trailing full stop.

{language_line}

Return JSON with two arrays:
{{ "riddles": [ {{ "riddle": "Why is a retired baker never late?", "answer": "DOUGH" }} ],
  "words": [ {{ "word": "GARDEN", "clue": "Where the roses grow" }} ] }}
"""


def _echoes_answer(answer: str, text: str, stem_letters: int) -> bool:
    """True when a riddle or clue hands over its own answer.

    Not only the word itself: asked to clue GARDENING a model writes "where a
    gardener spends the morning" as often as not, and a solver who reads the
    stem has been given the puzzle rather than asked it.
    """
    upper = text.upper()
    if answer in upper:
        return True
    stem = answer[:stem_letters]
    if len(stem) < stem_letters:
        return False
    return any(token.startswith(stem) for token in re.split(r"[^A-Z]+", upper))


def _normalize_riddles(
    raw_riddles: list[Any],
    *,
    answer_letters: int,
    want: int,
    max_riddle_chars: int,
) -> list[RiddleScrambleRiddle]:
    min_riddle = int_value(_limits(), "minRiddleChars")
    stem_letters = int_value(_limits(), "clueStemLetters")
    awkward = _awkward_letters()
    out: list[RiddleScrambleRiddle] = []
    seen_answers: set[str] = set()
    seen_riddles: set[str] = set()

    for entry in raw_riddles:
        if not isinstance(entry, dict):
            continue
        answer = re.sub(r"[^A-Z]", "", str(entry.get("answer", "")).strip().upper())
        riddle = " ".join(str(entry.get("riddle", "")).split()).strip()
        if len(answer) != answer_letters:
            continue
        if any(letter in awkward for letter in answer):
            continue
        if not riddle:
            continue
        # A riddle is a question. A model that drops the mark has written a
        # statement, and a statement with an answer under it reads as a typo.
        if not riddle.endswith("?"):
            riddle = riddle.rstrip(".!") + "?"
        if len(riddle) < min_riddle or len(riddle) > max_riddle_chars:
            continue
        if _echoes_answer(answer, riddle, stem_letters):
            continue
        folded = riddle.casefold()
        if answer in seen_answers or folded in seen_riddles:
            continue
        seen_answers.add(answer)
        seen_riddles.add(folded)
        out.append(
            RiddleScrambleRiddle(riddle=riddle[0].upper() + riddle[1:], answer=answer)
        )
        if len(out) >= want:
            break
    return out


def _normalize_words(
    raw_words: list[Any],
    *,
    min_len: int,
    max_len: int,
    want: int,
    max_clue_chars: int,
) -> list[RiddleScrambleWord]:
    min_clue = int_value(_limits(), "minClueChars")
    stem_letters = int_value(_limits(), "clueStemLetters")
    out: list[RiddleScrambleWord] = []
    seen_words: set[str] = set()
    # Two words built from one letter set print two scrambles a reader cannot
    # tell apart, and the answer page can only be right about one of them.
    seen_letters: set[str] = set()

    for entry in raw_words:
        if not isinstance(entry, dict):
            continue
        word = re.sub(r"[^A-Z]", "", str(entry.get("word", "")).strip().upper())
        clue = " ".join(str(entry.get("clue", "")).split()).rstrip(".").strip()
        if not word or not _word_re().match(word):
            continue
        if len(word) < min_len or len(word) > max_len:
            continue
        if word in seen_words:
            continue
        letters = "".join(sorted(word))
        if letters in seen_letters:
            continue
        if not clue or len(clue) < min_clue:
            continue
        # The caller sized one printed line for this; a longer clue is a layout
        # bug waiting to happen, not a slightly imperfect clue.
        if len(clue) > max_clue_chars:
            continue
        if _echoes_answer(word, clue, stem_letters):
            continue
        seen_words.add(word)
        seen_letters.add(letters)
        out.append(RiddleScrambleWord(word=word, clue=clue[0].upper() + clue[1:]))
        if len(out) >= want:
            break
    return out


def _parse_payload(raw: str) -> tuple[list[Any], list[Any]]:
    data = parse_json_object(raw)
    riddles = data.get("riddles")
    words = data.get("words")
    if not isinstance(riddles, list) or not riddles:
        raise ValueError("missing riddles")
    if not isinstance(words, list) or not words:
        raise ValueError("missing words")
    return riddles, words


async def _call_gemini(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=RiddleScrambleModelOutput,
        label="riddle-scramble",
    )


async def generate_riddle_scramble(
    req: RiddleScrambleRequest, user_id: str
) -> RiddleScrambleResponse:
    _check_rate_limit(user_id)
    scope = _scope(req, user_id)
    prompt = with_variety(_build_prompt(req), scope, client_avoid=req.avoid)
    started = time.perf_counter()

    try:
        raw = await _call_gemini(prompt)
        raw_riddles, raw_words = _parse_payload(raw)
    except RiddleScrambleGenerationError:
        raise
    except Exception as exc:
        logger.warning(
            "studio_riddle_scramble_generation_failed error=%s model=%s",
            exc,
            settings.STUDIO_GEMINI_MODEL,
            exc_info=True,
        )
        raise RiddleScrambleGenerationError(
            "Model did not return valid riddle-scramble JSON"
        ) from exc

    riddles = _normalize_riddles(
        raw_riddles,
        answer_letters=req.answer_letters,
        want=req.riddle_count,
        max_riddle_chars=req.max_riddle_chars,
    )
    words = _normalize_words(
        raw_words,
        min_len=req.min_letters,
        max_len=req.max_letters,
        want=req.word_count,
        max_clue_chars=req.max_clue_chars,
    )

    # The browser filters again — dictionary collisions it can see and the
    # service cannot — and then has to spell one riddle answer out of the pool.
    # More than one riddle is the whole point of this floor: the first one's
    # letters may simply not be in the words, and a spare candidate costs
    # nothing here while a second call costs a page.
    if len(riddles) < int_value(_limits(), "minRiddles"):
        raise RiddleScrambleGenerationError("model returned too few usable riddles")
    if len(words) < max(8, req.word_count // 2):
        raise RiddleScrambleGenerationError("model returned too few valid words")

    remember(
        scope,
        [riddle.answer for riddle in riddles] + [word.word for word in words],
    )

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "studio_riddle_scramble_generated model=%s latency_ms=%s riddles=%s words=%s "
        "answer_letters=%s theme=%s",
        settings.STUDIO_GEMINI_MODEL,
        elapsed_ms,
        len(riddles),
        len(words),
        req.answer_letters,
        req.theme[:40],
    )

    return RiddleScrambleResponse(riddles=riddles, words=words)


def build_prompt_for_tests(req: RiddleScrambleRequest) -> str:
    return _build_prompt(req)


def parse_payload_for_tests(raw: str) -> tuple[list[Any], list[Any]]:
    return _parse_payload(raw)


def normalize_riddles_for_tests(
    raw_riddles: list[Any],
    *,
    answer_letters: int,
    want: int,
    max_riddle_chars: int,
) -> list[RiddleScrambleRiddle]:
    return _normalize_riddles(
        raw_riddles,
        answer_letters=answer_letters,
        want=want,
        max_riddle_chars=max_riddle_chars,
    )


def normalize_words_for_tests(
    raw_words: list[Any],
    *,
    min_len: int,
    max_len: int,
    want: int,
    max_clue_chars: int,
) -> list[RiddleScrambleWord]:
    return _normalize_words(
        raw_words,
        min_len=min_len,
        max_len=max_len,
        want=want,
        max_clue_chars=max_clue_chars,
    )
