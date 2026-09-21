Retirement Decade Trivia — Production Spec
1. Goal

Create decade-trivia for Retirement Activity Prints.

Category: reminiscence
1 puzzle page + automatic answer key
Audience: Adults / Retirees / Seniors
AI-generated + independently verified facts
Large-print, B&W, print-first
No special logic in StudioPanel

Game formats:

Multiple Choice
Short Answer
Fill in the Blank
Mixed
2. Config
{
  customDecade: boolean,
  decade: '1950s'|'1960s'|'1970s'|'1980s'|'1990s'|'2000s',
  customDecadeText?: string,

  customTopic: boolean,
  topics?: string[],
  customTopicText?: string,

  format:
    | 'multiple-choice'
    | 'short-answer'
    | 'fill-blank'
    | 'mixed',

  difficulty:
    | 'easy'
    | 'standard'
    | 'challenging',

  questionCount: number // 4–8, default 5
}

Custom decade:

Normalize 2010, 2014, the 2010s → 2010s
max 24 chars
final value must match \d{4}s

Preset topics:

music
tv
film
products
food
toys
everyday
events

At least 1 topic required.

3. AI Pipeline

Endpoint:

POST /api/studio/decade-trivia

Request:

{
  "decade": "1960s",
  "topics": ["music", "tv"],
  "format": "mixed",
  "difficulty": "standard",
  "questionCount": 5,
  "seed": 123,
  "avoid": []
}

Pipeline:

AI write extra candidates
→ deterministic validation
→ independent AI verification
→ top-up missing topics
→ compose final questions
→ seeded shuffle
→ remember for variety

Over-request about:

questionCount + 5

Retry/top-up max:

3 rounds

If nothing valid survives verification → generation error.

4. Content Validation

Every question must pass:

confidence ≥ 0.85
no hedged answers (probably, around, maybe, etc.)
year/evidence year inside selected decade
topic belongs to selected topics
no duplicate question
no duplicate answer on same page
no lyrics
no slogans/jingles
no movie/TV dialogue quotes
no copyrighted wording

Brand names are allowed for products, but copyrighted wording is not.

Independent verifier must return:

verdict = correct
decade_ok = true
topic ∈ selected topics

Otherwise drop the item.

5. Difficulty
Easy

Very familiar facts most people from the era would recognize.

Standard

Well-known facts associated with the decade.

Challenging

Less obvious but still widely documented facts.

Do not use obscure or uncertain trivia.

6. Multiple Choice

Requirements:

exactly 4 options
case-insensitive unique options
answer exactly matches one option
options displayed as 2×2
shuffle options using seeded RNG
correct option must not always be A

Answer key:

same options/order
reveal ring around correct letter
7. Short Answer

Requirements:

no options
expected answer about 1–4 words
puzzle shows question + handwriting line

Answer key:

show answer text
remove handwriting line
8. Fill in the Blank

Requirements:

exactly one ___
no answer leaked elsewhere in prompt
blank must replace full word/phrase
no glued numeric blanks

Invalid:

19___
answer = 1961

Backend may repair only when unambiguous; otherwise drop.

Answer key shows completed sentence.

9. Mixed Mode

Split formats as evenly as possible across:

MC
Short Answer
Fill Blank

Topic coverage has priority over perfect format balance.

Extra slots rotate between formats.

MC may be converted to Short Answer if needed.

Do not auto-convert content into Fill Blank.

10. Layout

Default instruction:

How much do you remember about the {decade}?
Take your time. No rush, no score.

Layout:

number questions in left gutter
vertically stack measured question blocks
no overlaps
optically center stack
keep everything inside safe area

Large-print targets:

body ~16 pt
preferred floor ~14 pt
dense 8-question page may approach 12 pt

Prefer:

4–5 questions on smaller trims

If content is too dense:

reduce gaps / font within limits

Never overflow safe area.

11. Answer Key

producesAnswerKey: true

Puzzle and solution must use:

same questions
same order
same option order

Answer behavior:

MC          → reveal correct option ring
Short       → show answer
Fill Blank  → show completed sentence

Use monochrome answer ink.

12. Variety

Use:

studioVarietyKey(
  'decade-trivia',
  decade,
  topicsJoined,
  format,
  difficulty
)

Store recently printed questions and pass them back as avoid.

Avoid repeating the same facts across nearby puzzles/pages.

13. Production Tests

Must test:

✓ at least one topic required
✓ custom decade normalization
✓ custom topic validation

✓ MC has exactly 4 unique options
✓ answer exists in MC options
✓ seeded shuffle deterministic

✓ fill blank contains exactly one valid blank
✓ no answer leak
✓ no glued numeric blank

✓ no duplicate questions/answers
✓ years stay inside decade

✓ verifier keeps only:
    correct
    decade_ok
    selected topic

✓ topic coverage prioritized

✓ 8-question layout fits safe area

✓ puzzle/key use identical items/order
✓ mono answer ink enabled
14. Generation Flow
Config
  ↓
AI writes extra trivia
  ↓
Validate facts / format / decade / safety
  ↓
Independent verification
  ↓
Top up missing topics
  ↓
Compose final page
  ↓
Seeded MC shuffle
  ↓
Draw puzzle
  ↓
Draw answer key
  ↓
Remember questions for variety

Important rule:

A shorter verified page is better than a full page containing questionable trivia.