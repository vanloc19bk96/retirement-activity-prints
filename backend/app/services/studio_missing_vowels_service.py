"""Generate retirement-themed missing-vowels answers, each with its clue, via Gemini.

AI-only: no bundled word bank. A packaged list would make every seller's book
draw on the same few hundred words, which is the fastest way to two KDP titles
that look copied from each other.

The clue is not decoration. Blanked vowels have more than one fair reading —
B_LL is BALL, BELL and BULL — and the solution page prints only one of them, so
a sheet without clues can be wrong about its own answers. The browser rejects
the patterns a second *common* word could fill, using the word list that ships
in its bundle; the clue is what covers everything that list has never heard of,
and it is also what makes the puzzle solvable by the reader this book is sold
to.

Answers come back complete, with every vowel. The page removes them: a model
asked for "G_RD_N_NG" returns blanks in places no rule agrees with, and the
sheet then cannot say what its own answer is.
"""

from __future__ import annotations

import logging
import re
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_missing_vowels import (
    MissingVowelsClue,
    MissingVowelsModelOutput,
    MissingVowelsRequest,
    MissingVowelsResponse,
)
from app.services.studio_gemini import (
    RateLimiter,
    StudioGenerationError,
    StudioRateLimitError,
    call_gemini_json,
    parse_string_items,
)
from app.services.prompt_data import (
    int_value,
    load_config,
    locale_line,
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

GAME = "missing-vowels"
_VOWELS = frozenset("AEIOU")


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


@lru_cache(maxsize=1)
def _angles() -> tuple[str, ...]:
    return string_list(_config(), "varietyAngles")


_rate_limiter = RateLimiter(
    label="missing-vowels",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class MissingVowelsRateLimitError(StudioRateLimitError):
    """User exceeded the short-window missing-vowels generation quota."""


class MissingVowelsGenerationError(StudioGenerationError):
    """Model output could not be parsed into usable answers and clues."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise MissingVowelsRateLimitError(str(exc)) from exc


def _scope(req: MissingVowelsRequest, user_id: str) -> VarietyScope:
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.theme, f"{req.min_letters}-{req.max_letters}"),
        seed=req.seed,
    )


def _letter_token(text: str) -> str:
    return re.sub(r"[^A-Z]", "", text.upper())


def _mask_vowels(answer: str) -> str:
    """How the page will print this answer — used to reject a duplicate row.

    Two answers that blank to the same thing are the same puzzle to a reader,
    and the key can only be right about one of them.
    """
    chars: list[str] = []
    for ch in answer.upper():
        if ch == " ":
            chars.append(" ")
        elif ch in _VOWELS:
            chars.append("_")
        elif "A" <= ch <= "Z":
            chars.append(ch)
    return re.sub(r" +", " ", "".join(chars)).strip()


def _is_playable(token: str) -> bool:
    """Enough blanks to be a puzzle, enough consonants to be recognisable."""
    vowels = sum(1 for ch in token if ch in _VOWELS)
    consonants = len(token) - vowels
    if vowels < int_value(_limits(), "minVowels"):
        return False
    return consonants >= int_value(_limits(), "minConsonants")


def _clue_echoes_answer(answer: str, clue: str, stem_letters: int) -> bool:
    """A clue that hands over its own answer.

    Not only the answer itself: asked to define GARDENING a model writes "where
    a gardener spends the morning" as often as not, and every consonant of the
    answer is already printed on the page — a solver who reads the stem has been
    given the row rather than asked it. Comparing the opening letters catches
    the whole family without rejecting the honest near-misses a shorter stem
    would.
    """
    upper = clue.upper()
    tokens = [t for t in re.split(r"[^A-Z]+", upper) if t]
    for word in answer.split(" "):
        if len(word) < stem_letters:
            if word in tokens:
                return True
            continue
        stem = word[:stem_letters]
        if any(token.startswith(stem) for token in tokens):
            return True
    return False


def _build_prompt(req: MissingVowelsRequest) -> str:
    angle = rotate(_angles(), req.seed)
    language_line = locale_line(section(_config(), "locale"), req.locale)
    stem = int_value(_limits(), "clueStemLetters")
    min_vowels = int_value(_limits(), "minVowels")
    words_line = (
        "- One word only — no phrases, hyphens or abbreviations."
        if req.max_words == 1
        else f"- One word, or a phrase of at most {req.max_words} words."
    )
    return f"""Write {req.count} English words or short phrases clearly about: {req.theme.strip()}.
Give each one short clue.
Focus angle for variety: {angle}.
Each answer is printed in a large-print retirement activity book with its
vowels replaced by blank writing lines; the clue is what tells the solver which
word to write back in.
Seed for variety: {req.seed}.

Answer rules:
- Write every answer COMPLETE, with all of its vowels. The page removes them.
  Never return an already-blanked form like "G_RD_N_NG".
- {req.min_letters}-{req.max_letters} letters, not counting spaces. Count before writing.
{words_line}
- A-Z only. No digits, accents, apostrophes or hyphens.
- At least {min_vowels} vowels (A E I O U — Y is not a vowel) and at least two
  consonants, so the row has something to solve and something to recognise.
- Familiar vocabulary for adults and seniors, clearly on the theme.
- No proper nouns, brands, celebrities, titles, abbreviations or slang.
- No offensive, medical-crisis or depressing retirement concepts.
- No duplicates, and no two answers that differ only by their vowels
  (skip pairs like BAKING/BIKING, CHAIR/CHOIR, CALENDAR/COLANDER).
- Prefer answers whose consonant skeleton spells only ONE common English word,
  so restoring the vowels can only produce the answer you wrote.

Clue rules:
- At most {req.max_clue_chars} characters, counted including spaces. This is a
  hard limit: the clue is set under the answer in a fixed column and a longer
  one is dropped.
- A plain definition or description, not wordplay, riddles or cryptic hints.
- Never contains the answer, and never a word sharing its first {stem} letters.
- Exactly one answer fits the clue — a solver who knows it must reach that word.
- No trailing full stop, no quotation marks around the clue.

{language_line}

Return JSON with "items": an array of {req.count} objects, each with an
uppercase "answer" and its "clue", e.g.
{{ "answer": "SUNSET", "clue": "The sky at the end of the day" }}
"""


def _normalize_items(
    raw_items: list[Any],
    *,
    min_len: int,
    max_len: int,
    max_words: int,
    want: int,
    max_clue_chars: int,
) -> list[MissingVowelsClue]:
    min_clue = int_value(_limits(), "minClueChars")
    stem_letters = int_value(_limits(), "clueStemLetters")
    out: list[MissingVowelsClue] = []
    seen_answers: set[str] = set()
    seen_masks: set[str] = set()

    for entry in raw_items:
        if not isinstance(entry, dict):
            continue
        raw_answer = str(entry.get("answer") or entry.get("word") or "")
        answer = re.sub(r"\s+", " ", re.sub(r"[^A-Z\s]", " ", raw_answer.upper())).strip()
        clue = " ".join(str(entry.get("clue", "")).split()).rstrip(".…").strip()
        if not answer:
            continue
        words = answer.split(" ")
        if len(words) > max_words:
            continue
        token = _letter_token(answer)
        if len(token) < min_len or len(token) > max_len:
            continue
        if not _is_playable(token):
            continue
        if answer in seen_answers:
            continue
        mask = _mask_vowels(answer)
        if mask in seen_masks:
            continue
        if not clue or len(clue) < min_clue:
            continue
        # The caller sized a printed column for this; a longer clue is a layout
        # bug waiting to happen, not a slightly imperfect clue.
        if len(clue) > max_clue_chars:
            continue
        if _clue_echoes_answer(answer, clue, stem_letters):
            continue
        seen_answers.add(answer)
        seen_masks.add(mask)
        out.append(MissingVowelsClue(answer=answer, clue=clue[0].upper() + clue[1:]))
        if len(out) >= want:
            break
    return out


async def _call_gemini(prompt: str) -> str:
    return await call_gemini_json(
        prompt=prompt,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=MissingVowelsModelOutput,
        label="missing_vowels",
    )


async def generate_missing_vowels(
    req: MissingVowelsRequest, user_id: str
) -> MissingVowelsResponse:
    _check_rate_limit(user_id)
    scope = _scope(req, user_id)
    prompt = with_variety(_build_prompt(req), scope, client_avoid=req.avoid)
    started = time.perf_counter()

    try:
        raw = await _call_gemini(prompt)
        items_raw = parse_string_items(raw)
    except MissingVowelsGenerationError:
        raise
    except Exception as exc:
        logger.warning(
            "studio_missing_vowels_generation_failed error=%s model=%s",
            exc,
            settings.STUDIO_GEMINI_MODEL,
            exc_info=True,
        )
        raise MissingVowelsGenerationError(
            "Model did not return valid missing-vowels JSON"
        ) from exc

    items = _normalize_items(
        items_raw,
        min_len=req.min_letters,
        max_len=req.max_letters,
        max_words=req.max_words,
        want=req.count,
        max_clue_chars=req.max_clue_chars,
    )
    # The browser filters again — vowel-pattern collisions it can see and the
    # service cannot — so return a pool, not a page. Half the request is the
    # floor below which a retry is cheaper than laying out what came back.
    if len(items) < max(4, req.count // 2):
        logger.warning(
            "studio_missing_vowels_too_few_items got=%s want=%s",
            len(items),
            req.count,
        )
        raise MissingVowelsGenerationError("model returned too few valid items")

    remember(scope, [item.answer for item in items])

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "studio_missing_vowels_generated model=%s latency_ms=%s item_count=%s theme=%s",
        settings.STUDIO_GEMINI_MODEL,
        elapsed_ms,
        len(items),
        req.theme[:40],
    )
    return MissingVowelsResponse(items=items)


def build_prompt_for_tests(req: MissingVowelsRequest) -> str:
    return _build_prompt(req)


def parse_mv_json_for_tests(raw: str) -> list[Any]:
    return parse_string_items(raw)


def normalize_items_for_tests(
    raw_items: list[Any],
    *,
    min_len: int,
    max_len: int,
    want: int,
    max_words: int = 2,
    max_clue_chars: int = 42,
) -> list[MissingVowelsClue]:
    return _normalize_items(
        raw_items,
        min_len=min_len,
        max_len=max_len,
        max_words=max_words,
        want=want,
        max_clue_chars=max_clue_chars,
    )


def mask_vowels_for_tests(answer: str) -> str:
    return _mask_vowels(answer)
