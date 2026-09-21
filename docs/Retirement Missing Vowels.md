# Retirement Missing Vowels — Production Spec

## 1. Goal

Create `Retirement Missing Vowels` for Retirement Activity Prints.

Player restores the missing vowels in retirement-themed words or short phrases.

Example:

```text
G_RD_N_NG      → GARDENING
R__D TR_P      → ROAD TRIP
FR__ T_M_      → FREE TIME
```

Requirements:

* AI-only content.
* Retirement-specific themes.
* Large-print, B&W, print-first.
* Automatic answer key.
* No bundled generic word bank.
* No custom word-list mode.
* No special logic in `StudioPanel`.

---

## 2. Config

```ts
interface RetirementMissingVowelsConfig {
  category: string

  themeMode: 'preset' | 'custom'
  presetTheme?: string
  customTheme?: string

  difficulty:
    | 'relaxed'
    | 'classic'
    | 'challenge'

  itemCount: number
  printStyle: 'large-print' | 'standard'

  pageTitle?: string
  showInstructions: boolean
  seed: number
}
```

Defaults:

```text
difficulty = classic
itemCount = 12
printStyle = large-print
```

Recommended range:

```text
8–18 items
```

---

# 3. Retirement Themes

Use the same retirement taxonomy as Word Search/Crossword.

### Retirement Life

* Life After Work
* Retirement Freedom
* Free Time
* New Chapter
* Relax & Unwind

### Travel & Adventure

* Road Trips
* Travel Dreams
* Vacation Time
* Dream Destinations
* Outdoor Adventures

### Hobbies & Leisure

* Gardening
* New Hobbies
* Photography
* Cooking
* Reading
* Arts & Crafts

### Career & Farewell

* Career Memories
* Retirement Party
* Office Goodbye
* Work Friends

### Nostalgia

* Memory Lane
* Classic Pastimes
* School Days
* Then & Now

### Friends & Family

* Family Time
* Good Friends
* Celebrations

### Home & Leisure

* Garden Days
* Cozy Home
* Creative Time
* Home Projects

Themes are AI prompts only, not predefined word lists.

---

# 4. AI Generation

AI generates approximately:

```text
requested itemCount × 2
```

candidates.

Return:

```json
{
  "items": [
    {"answer": "Gardening"},
    {"answer": "Road Trip"},
    {"answer": "Free Time"}
  ]
}
```

Allow:

```text
1 word
or
short 2-word phrase
```

Content must be:

* clearly related to selected theme
* common adult vocabulary
* natural English
* retirement-appropriate
* easy to recognize once vowels are restored

Avoid:

* brands
* celebrities
* fictional characters
* copyrighted titles
* political names
* medical claims
* offensive/adult terms
* obscure vocabulary

---

# 5. Normalization

Store:

```ts
interface MissingVowelItem {
  display: string
  token: string
  masked: string
}
```

Example:

```text
display = "Road Trip"
token   = "ROAD TRIP"
masked  = "R__D TR_P"
```

Mask only:

```text
A E I O U
```

Do not treat `Y` as a vowel.

Preserve spaces between words.

---

# 6. Content Validation

Reject candidate if:

* no vowel exists
* answer is too short
* answer is too long
* duplicate answer
* near-duplicate answer
* malformed phrase
* unrelated to theme
* unsafe/IP-risky
* masking produces an unusable result

Recommended normalized letters:

```text
Relaxed:   4–8
Classic:   5–10
Challenge: 6–14
```

---

# 7. Important Ambiguity Check

Do not allow two answers on the same page to produce the same masked form.

Example:

```text
masked(A) === masked(B)
```

→ reject one candidate.

Also avoid excessive related variants:

```text
GARDEN
GARDENER
GARDENING
```

on the same page.

---

# 8. Difficulty

## Relaxed

```text
8–10 items
mostly single words
4–8 letters
familiar vocabulary
```

Examples:

```text
CR__S_     → CRUISE
G_RD_N     → GARDEN
R_L_X      → RELAX
```

## Classic — default

```text
10–14 items
single words + short phrases
5–10 letters
```

## Challenge

```text
12–16 items
longer words / phrases
6–14 letters
less obvious but still familiar vocabulary
```

Difficulty should come from word length and phrase complexity, not obscure vocabulary.

---

# 9. Masking Logic

Implement deterministic helper:

```ts
maskVowels(answer: string): string
```

Rules:

```text
A/E/I/O/U → _
consonants remain visible
spaces remain visible
```

Example:

```text
RETIREMENT
→ R_T_R_M_NT

ROAD TRIP
→ R__D TR_P
```

Do not randomly leave some vowels visible.

The game mechanic must remain consistent.

---

# 10. Puzzle Layout

Default:

```text
8.5 × 11"
Portrait
Black & White
No Bleed
Large Print
```

Layout:

```text
MISSING VOWELS
Travel Dreams
Puzzle 12

Add the missing vowels to complete each word or phrase.

1. R__D TR_P       __________________

2. P_SSP_RT        __________________

3. V_C_T__N        __________________
```

Two columns may be used only when readability remains good.

Preferred Large Print:

```text
Title:        24–28 pt
Instruction:  13–15 pt
Puzzle text:  16–20 pt
Answer line:  comfortable handwriting width
```

Do not shrink excessively just to fit more items.

---

# 11. Instruction

Use:

> Add the missing vowels to complete each retirement-themed word or phrase.

If theme is shown:

> Add the missing vowels to complete each word or phrase.

---

# 12. Answer Key

`producesAnswerKey: true`

Puzzle:

```text
R__D TR_P
________________
```

Answer key:

```text
R__D TR_P
ROAD TRIP
```

or simply show the completed answer clearly in the answer column.

Use:

* same item order
* monochrome black answer ink
* no handwriting lines on solution page

---

# 13. Variety

Track recently generated answers by:

```ts
studioVarietyKey(
  'missing-vowels',
  category,
  theme,
  difficulty
)
```

Send recent answers to AI as `avoid`.

Rules:

* no duplicate answer on same page
* no identical page
* avoid high repetition across nearby puzzles
* regenerate if answer-set similarity is too high

---

# 14. AI Retry

Flow:

```text
AI candidates
→ normalize
→ theme/safety validation
→ masking validation
→ ambiguity check
→ enough valid items?
```

If not:

```text
retry AI with rejected + recent answers in avoid
```

Maximum:

```text
3 attempts
```

If still insufficient → generation error.

No bundled fallback.

---

# 15. Book-Level Quality

Before adding page:

```text
✓ all answers unique
✓ all masked strings valid
✓ no duplicate masked patterns
✓ every answer contains vowels
✓ no risky generated proper nouns
✓ theme relevance valid
✓ item count meets minimum
✓ page fits safe area
✓ answer key matches exactly
```

Recommended minimum:

```text
8 items/page
```

---

# 16. AI / KDP Tracking

Because words/phrases are AI-generated:

```ts
projectCompliance.aiGeneratedText = true
```

Store:

```ts
{
  source: 'ai',
  category,
  theme,
  difficulty,
  finalItems,
  seed,
  generatedAt
}
```

Show AI-content disclosure reminder during final export.

---

# 17. Generation Flow

```text
Category / Theme
      ↓
Difficulty
      ↓
AI generates ~2× candidates
      ↓
Normalize
      ↓
Safety + theme filter
      ↓
Remove duplicates
      ↓
maskVowels()
      ↓
Masked-pattern ambiguity check
      ↓
Select final items
      ↓
Draw puzzle
      ↓
Draw answer key
      ↓
Book variety check
      ↓
Export preflight
```

---

# 18. Acceptance Criteria

```text
[ ] AI-only content
[ ] Retirement-specific themes
[ ] No bundled fallback
[ ] No custom word list
[ ] A/E/I/O/U always masked
[ ] Y remains visible
[ ] Spaces preserved
[ ] Every answer contains at least one vowel
[ ] No duplicate answers
[ ] No duplicate masked forms
[ ] Large-print layout
[ ] Minimum 8 valid items
[ ] Answer key exact
[ ] Book-level repetition controlled
[ ] AI usage tracked
[ ] Export preflight passes
```
