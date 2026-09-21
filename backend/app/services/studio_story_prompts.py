"""Prompt text for Story Recall Gemini generation.

Word budgets and wording live in ``app/data/studio/story-recall/prompt.json``.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any, Mapping

from app.schemas.studio_story import StoryRecallRequest
from app.services.prompt_data import load_config, locale_line, section

GAME = "story-recall"


@lru_cache(maxsize=1)
def config() -> Mapping[str, Any]:
    return load_config(GAME)


def word_range(length: str) -> tuple[int, int]:
    lo, hi = section(config(), "wordRanges")[length]
    return int(lo), int(hi)


def word_target(length: str) -> int:
    return int(section(config(), "wordTargets")[length])


def _length_instruction(length: str) -> str:
    lo, hi = word_range(length)
    return str(config()["lengthInstruction"]).format(
        lo=lo,
        hi=hi,
        target=word_target(length),
        paragraphs=section(config(), "paragraphHints")[length],
    )


def _json_shape_block() -> str:
    return """Fill the response schema:
- "title": 2-5 words.
- "passage": the story text.
- "questions": each with "wh" (who, what, where, when, why or howmany),
  "question", and "answer"."""


def build_story_prompt(req: StoryRecallRequest) -> str:
    language_line = locale_line(section(config(), "locale"), req.locale)
    return f"""You write passages for an adult memory-training workbook.

Write ONE self-contained story and comprehension questions.

Constraints:
- Theme: {req.theme}
- {_length_instruction(req.length)}
- Reading level: {req.difficulty}. 'easy' = simple common words, short sentences (length still must be met).
- Contain several concrete, recallable facts (names, places, numbers, times, objects).
- Wholesome and neutral. No violence, romance, politics, brands, or real living people.
- Write {req.question_count} questions that can be answered ONLY from the passage.
- Vary the question types across who / what / where / when / why / how many.
- Every answer must appear in the passage as a word or short phrase, and only one
  span of the passage may answer each question.
- Never ask about something the passage merely implies.
{language_line}

{_json_shape_block()}
"""


def build_expand_prompt(
    req: StoryRecallRequest, draft: dict[str, Any], word_count: int
) -> str:
    lo, hi = word_range(req.length)
    return f"""Your previous draft was ONLY {word_count} words — too short.

Rewrite the SAME story (theme: {req.theme}) so the passage is {lo}-{hi} words
(target ~{word_target(req.length)}). Keep the same facts usable for questions,
but add scenes, sensory detail, and intermediate actions until you hit the range.
Still return {req.question_count} questions answerable only from the new passage.

Previous draft title: {draft.get("title", "")}
Previous passage:
{draft.get("passage", "")}

{_json_shape_block()}
"""
