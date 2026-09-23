"""Generate Retirement Phrase Finder sayings, each with its clue, via Gemini.

A Phrase Finder puzzle is a saying printed as one blank per letter, with a
small share of the letters already filled in. That makes the *shape* of a
phrase matter as much as its sense, and in two ways the other saying games do
not care about.

The first is width: a row is read by counting its blanks, so a word is never
broken across rows and no word may outrun the narrowest column any KDP trim
prints. The second is where the given letters can go. The page will not fill in
more than half of any one word, so a phrase made only of short words has
nowhere meaty to put one — every given letter lands where a solver would have
guessed anyway. ``minLongWords`` asks the writer for a couple of longer words
to carry them.

It asks rather than enforces, and that distinction is deliberate: "THE BEST
PART OF THE DAY IS THE ONE YOU DID NOT PLAN" has no word over four letters and
is one of the better phrases this game prints. Rejecting it to satisfy a
heuristic would cost more content than the heuristic is worth, and the browser
runs the real gate — which measures where the letters can actually go rather
than guessing from word lengths.

The clue is what makes the page solvable at all, and it is why this service
returns objects rather than strings. A cryptogram can be reasoned out from its
own cipher and a missing-vowels row from its consonants, but these sayings are
written fresh for a theme rather than quoted from anywhere a solver could know
— so blanks, word lengths and a third of the letters do not single out one
wording, and several plain English sentences fit the same row. The answer page
prints one of them. The clue is what makes that one the answer, and a saying
that arrives without a usable clue is dropped here rather than printed as a
puzzle with no way in.

Unlike the other saying games this one keeps punctuation, because an
apostrophe or a hyphen is part of the shape a solver reads. The set is small
and fixed, and it mirrors ``PHRASE_FINDER_MARKS`` in
``frontend/src/utils/studio/phrase-finder/phrase.ts``.

Phrases must be public-domain style: traditional sayings or plain original
lines. Attributed quotations are refused at prompt level because the output is
printed and sold on KDP.
"""

from __future__ import annotations

import logging
import re
import time
from functools import lru_cache
from typing import Any, Mapping

from app.core.config import settings
from app.schemas.studio_phrase_finder import (
    PhraseFinderItem,
    PhraseFinderModelOutput,
    PhraseFinderRequest,
    PhraseFinderResponse,
)
from app.services.studio_gemini import (
    RateLimiter,
    StudioGenerationError,
    StudioRateLimitError,
    call_gemini_json,
    parse_json_object,
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

GAME = "phrase-finder"


@lru_cache(maxsize=1)
def _config() -> Mapping[str, Any]:
    return load_config(GAME)


@lru_cache(maxsize=1)
def _limits() -> Mapping[str, Any]:
    return section(_config(), "limits")


def _band(length: str) -> Mapping[str, Any]:
    """Mirrors BANDS in frontend/src/utils/studio/phrase-finder/content.ts."""
    return section(section(_config(), "bands"), length)


@lru_cache(maxsize=1)
def _angles() -> tuple[str, ...]:
    """Rotated by seed so two users on the same theme get different prompts."""
    return string_list(_config(), "varietyAngles")


# Uppercase words of letters, with the supported marks inside or closing a
# word — never opening one, never doubled, never adrift against a space.
_ALLOWED_RE = re.compile(
    r"^[A-Z](?:[A-Z]|['-][A-Z]|[,.?!](?= )|[,.?!]$)*(?: [A-Z](?:[A-Z]|['-][A-Z]|[,.?!](?= )|[,.?!]$)*)*$"
)

# Typography a writer reaches for, folded onto the marks the page can set.
_FOLD = {
    "‘": "'",
    "’": "'",
    "ʼ": "'",
    "´": "'",
    "`": "'",
    "–": "-",
    "—": "-",
    "−": "-",
    "…": ".",
    ";": ",",
    ":": ",",
}

_rate_limiter = RateLimiter(
    label="phrase-finder",
    max_per_window=int_value(section(load_config(GAME), "limits"), "rateLimitPerWindow"),
)


class PhraseFinderRateLimitError(StudioRateLimitError):
    """User exceeded the short-window phrase-finder generation quota."""


class PhraseFinderGenerationError(StudioGenerationError):
    """Model output could not be parsed into usable phrases and clues."""


def _check_rate_limit(user_id: str) -> None:
    try:
        _rate_limiter.check(user_id)
    except StudioRateLimitError as exc:
        raise PhraseFinderRateLimitError(str(exc)) from exc


def _scope(req: PhraseFinderRequest, user_id: str) -> VarietyScope:
    """Same theme + phrase length is what risks repeating an earlier phrase."""
    return VarietyScope(
        game=GAME,
        user_id=user_id,
        bucket=bucket_key(req.theme, req.length),
        seed=req.seed,
    )


def _candidate_count(need: int) -> int:
    mapping = section(_config(), "candidateCounts")
    keyed = mapping.get(str(need))
    if keyed is not None:
        return int(keyed)
    return need + int_value(_limits(), "overRequest")


def _build_prompt(req: PhraseFinderRequest) -> str:
    band = _band(req.length)
    angle = rotate(_angles(), req.seed)
    language_line = locale_line(section(_config(), "locale"), req.locale)
    want = _candidate_count(req.item_count)
    max_word = int_value(_limits(), "maxWordLetters")
    long_word = int_value(_limits(), "longWordLetters")
    min_long = int_value(_limits(), "minLongWords")
    max_marks = int_value(_limits(), "maxMarks")
    stem = int_value(_limits(), "clueStemLetters")

    return f"""Write {want} original retirement sayings about: {req.theme.strip()}.
Give each one a short clue.
Each saying is printed as a row of blanks, one blank per letter, with a few
letters filled in for the solver and its clue printed above it. Its shape
matters as much as its sense.
Seed for variety: {req.seed}. Lean towards {angle} where it suits the theme.

Shape (hard constraints — count before writing):
- {int_value(band, "minLetters")}-{int_value(band, "maxLetters")} letters in total, spaces not counted.
- {int_value(band, "minWords")}-{int_value(band, "maxWords")} words.
- No word longer than {max_word} letters.
- At least {min_long} words of {long_word} letters or more. A saying made only of
  short words leaves the puzzle with nowhere to put a given letter.

Writing:
- Original wording only. Retirement-related, positive, warm, adult-friendly.
- Each saying must read as one complete thought, and must not repeat another one.
- Never quote a book, film, song, speech, slogan, or a named person. No attributions.
- No famous quotes, lyrics, brands, franchises, politics, medical claims, or adult content.

Characters:
- Letters A-Z and single spaces only, plus at most {max_marks} punctuation marks
  from this set: apostrophe, hyphen, comma, full stop, question mark,
  exclamation mark.
- A mark never opens a saying or a word, and never stands alone between spaces.
- No digits, quotation marks, brackets, semicolons or colons.

Clue rules (a solver cannot reach the saying without one):
- At most {req.max_clue_chars} characters, counted including spaces. This is a hard
  limit: the clue is set in a column the page has already sized, and a longer
  one is dropped.
- Say what the saying is ABOUT in plain words — the moment, the feeling or the
  situation behind it. Not wordplay, riddles or cryptic hints.
- Point at one saying closely enough that a solver who has filled in half the
  blanks can tell which wording is meant.
- Never reuse a word from the saying, and never a word sharing its first {stem}
  letters. Describe it in different words.
- Sentence case, no trailing full stop, no quotation marks around the clue.
{language_line}

Return JSON with "items": an array of objects, each with the uppercase saying
in "text" and its clue in "clue", e.g.
{{ "text": "THE KETTLE IS ON AND THE CLOCK CAN WAIT", "clue": "No reason to hurry the first drink of the day" }}
"""


def _letter_count(text: str) -> int:
    return sum(1 for ch in text if ch.isalpha())


def _word_letters(word: str) -> int:
    return sum(1 for ch in word if ch.isalpha())


def _normalize(entry: Any) -> str:
    """Uppercase, single-spaced, supported marks only.

    Mirrors ``normalizePhrase`` in the frontend: anything unsupported becomes a
    space so a stray character splits a word instead of silently welding two
    together, marks never open the phrase or stack, and an inner mark with no
    letter after it is dropped rather than printed as a word cut in half.
    """
    text = "".join(_FOLD.get(ch, ch) for ch in str(entry).strip().upper())
    text = re.sub(r"[^A-Z'\-,.?! ]+", " ", text)
    text = re.sub(r"\s+([',.?!-])", r"\1", text)
    text = re.sub(r"([',.?!-])[',.?!-]+", r"\1", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"^[',.?!-]+", "", text)
    text = re.sub(r"([A-Z])['-](?![A-Z])", r"\1", text)
    return re.sub(r"\s+", " ", text).strip()


def _normalize_clue(raw: Any) -> str:
    """One line of sentence-case prose, no trailing stop and no quote marks.

    A full stop over a row of writing rules reads as a stray mark at this size,
    and the clue is never a sentence to begin with.
    """
    text = " ".join(str(raw or "").split()).strip("\"'“”‘’")
    text = text.rstrip(".…").strip()
    if not text:
        return ""
    return text[0].upper() + text[1:]


def _clue_echoes_answer(text: str, clue: str, stem_letters: int, content: int) -> bool:
    """A clue that hands its own saying over.

    Only the content words are protected. A saying is a whole sentence, so THE,
    AND and OF turn up in half the clues ever written and give nothing away
    there — but a clue saying "gardening" over a row whose long word is GARDEN
    has printed the answer twice. Comparing the first few letters catches the
    whole family without rejecting the honest near-misses a longer prefix would.
    """
    tokens = [token for token in re.split(r"[^A-Z]+", clue.upper()) if token]
    for word in text.split(" "):
        letters = re.sub(r"[^A-Z]", "", word)
        if len(letters) < content:
            continue
        stem = letters[:stem_letters]
        if any(token.startswith(stem) for token in tokens):
            return True
    return False


def _normalize_items(
    raw_items: list[Any],
    *,
    length: str,
    want: int,
    max_clue_chars: int,
) -> list[PhraseFinderItem]:
    band = _band(length)
    min_letters = int_value(band, "minLetters")
    max_letters = int_value(band, "maxLetters")
    min_words = int_value(band, "minWords")
    max_words = int_value(band, "maxWords")
    max_word_letters = int_value(_limits(), "maxWordLetters")
    max_marks = int_value(_limits(), "maxMarks")
    min_clue = int_value(_limits(), "minClueChars")
    stem_letters = int_value(_limits(), "clueStemLetters")
    content_letters = int_value(_limits(), "clueContentWordLetters")

    seen: set[str] = set()
    seen_clues: set[str] = set()
    out: list[PhraseFinderItem] = []
    for entry in raw_items:
        if not isinstance(entry, dict):
            continue
        text = _normalize(
            entry.get("text") or entry.get("phrase") or entry.get("saying")
        )
        clue = _normalize_clue(entry.get("clue"))
        if not text or not _ALLOWED_RE.match(text):
            continue
        # Punctuation is not identity: two sayings that differ only in a closing
        # mark are one saying printed twice.
        key = re.sub(r"[^A-Z ]", "", text)
        if key in seen:
            continue
        if sum(1 for ch in text if not ch.isalpha() and ch != " ") > max_marks:
            continue
        words = text.split(" ")
        if len(words) < min_words or len(words) > max_words:
            continue
        if any(_word_letters(word) > max_word_letters for word in words):
            continue
        letters = _letter_count(text)
        if letters < min_letters or letters > max_letters:
            continue
        # A saying with no usable clue is not a harder puzzle, it is an
        # unsolvable one, so it is dropped here rather than sent to a page.
        if len(clue) < min_clue or len(clue) > max_clue_chars:
            continue
        if _clue_echoes_answer(text, clue, stem_letters, content_letters):
            continue
        clue_key = re.sub(r"[^A-Z]", "", clue.upper())
        if clue_key in seen_clues:
            continue
        seen.add(key)
        seen_clues.add(clue_key)
        out.append(PhraseFinderItem(text=text, clue=clue))
        if len(out) >= want:
            break
    return out


async def generate_phrase_finder(
    req: PhraseFinderRequest, user_id: str
) -> PhraseFinderResponse:
    _check_rate_limit(user_id)
    scope = _scope(req, user_id)
    started = time.perf_counter()

    try:
        raw = await _call_gemini(
            with_variety(_build_prompt(req), scope, client_avoid=req.avoid)
        )
        items_raw = parse_string_items(raw)
    except PhraseFinderGenerationError:
        raise
    except Exception as exc:
        logger.warning(
            "studio_phrase_finder_generation_failed error=%s", exc, exc_info=True
        )
        raise PhraseFinderGenerationError(
            "Model did not return valid phrase finder JSON"
        ) from exc

    items = _normalize_items(
        items_raw,
        length=req.length,
        want=_candidate_count(req.item_count),
        max_clue_chars=req.max_clue_chars,
    )
    if len(items) < req.item_count:
        logger.warning(
            "studio_phrase_finder_too_few_items got=%s want=%s length=%s",
            len(items),
            req.item_count,
            req.length,
        )
        raise PhraseFinderGenerationError("model returned too few usable phrases")

    remember(scope, [item.text for item in items])

    logger.info(
        "studio_phrase_finder_generated model=%s latency_ms=%s item_count=%s length=%s theme=%s",
        settings.STUDIO_GEMINI_MODEL,
        int((time.perf_counter() - started) * 1000),
        len(items),
        req.length,
        req.theme[:40],
    )
    return PhraseFinderResponse(items=items)


async def _call_gemini(prompt: str) -> str:
    """Seam for tests; keeps the shared client call in one place."""
    return await call_gemini_json(
        prompt=prompt,
        max_output_tokens=int_value(_limits(), "maxOutputTokens"),
        response_schema=PhraseFinderModelOutput,
        label="phrase-finder",
    )


# Test helpers (pure, no network)
def build_prompt_for_tests(req: PhraseFinderRequest) -> str:
    return _build_prompt(req)


def parse_phrase_finder_json_for_tests(raw: str) -> dict[str, Any]:
    return parse_json_object(raw)


def normalize_items_for_tests(
    raw_items: list[Any],
    *,
    length: str,
    want: int,
    max_clue_chars: int = 52,
) -> list[PhraseFinderItem]:
    return _normalize_items(
        raw_items, length=length, want=want, max_clue_chars=max_clue_chars
    )
