# Retirement Cryptogram — Production Spec

## 1. Goal

Create an AI-only `Retirement Cryptogram` for Retirement Activity Prints.

Each puzzle:

* Uses an original retirement-related saying.
* Uses monoalphabetic substitution cipher.
* No letter maps to itself.
* Same plaintext letter always maps to same cipher letter within one puzzle.
* Automatic monochrome answer key.
* Large-print friendly.
* No bundled sayings.
* No custom sayings mode.
* No fallback generic content.

Reuse the current cipher, layout, drawing, answer-key, seeded RNG, and Studio template architecture.

---

## 2. Config

```ts
interface RetirementCryptogramConfig {
  category: string
  themeMode: 'preset' | 'custom'
  presetTheme?: string
  customTheme?: string

  length: 'short' | 'medium' | 'long'
  puzzleCount: 1 | 2 | 3 | 4 | 5 | 6

  printStyle: 'large-print' | 'standard'

  pageTitle?: string
  showInstructions: boolean
  seed: number
}
```

Defaults:

```text
length = medium
puzzleCount = 2
printStyle = large-print
```

For Large Print, do not default to 4 or more. Auto-limit by leftover page space at the 14 pt floor (hard cap 6).

---

## 3. Retirement Categories

### Retirement Life

* Life After Work
* Retirement Freedom
* New Chapter
* Free Time
* Relax & Unwind
* Retirement Celebration

### Travel & Adventure

* Travel Dreams
* Road Trips
* Dream Destinations
* Vacation Time
* New Adventures

### Hobbies & Leisure

* New Hobbies
* Gardening
* Reading
* Creative Time
* Cooking
* Outdoor Hobbies

### Career & Farewell

* Career Memories
* Office Goodbye
* Retirement Party
* Lessons From Work
* Life Beyond Work

### Friends & Family

* Good Friends
* Family Time
* Celebrations
* Quality Time

### Nostalgia

* Memory Lane
* School Days
* Classic Pastimes
* Then & Now
* Decade Memories

Themes are AI prompt presets only. No predefined saying banks.

---

## 4. AI Content

AI generates original sayings only.

Request more candidates than needed:

```text
need 1 → generate 5
need 2 → generate 8
need 3 → generate 10
need 4 → generate 12
need 5 → generate 14
need 6 → generate 16
```

Return:

```json
{
  "items": [
    "FREE TIME IS BEST SPENT DOING WHAT YOU LOVE"
  ]
}
```

AI rules:

* Original wording only.
* Retirement-related.
* Positive, warm, adult-friendly.
* Natural English.
* No attribution.
* No famous quotes.
* No song lyrics.
* No movie/book/TV quotes.
* No slogans.
* No celebrity/public figure quotes.
* No brands or franchises.
* No political content.
* No medical claims.
* No offensive/adult content.

---

## 5. Saying Validation

Normalize:

```text
UPPERCASE
remove non A-Z
collapse spaces
trim
```

Allowed:

```regex
^[A-Z]+(?: [A-Z]+)*$
```

Length after removing spaces:

```text
Short:   18–32 letters
Medium:  30–52 letters
Long:    46–68 letters
```

Recommended:

```text
min words: 4
max words: 12
max single word: 12 letters
```

Reject:

* duplicate sayings
* famous/common quote detected
* weak retirement relevance
* awkward grammar
* too short/long
* repetitive wording
* risky proper nouns

---

## 6. AI Retry

Maximum 3 attempts.

Flow:

```text
AI generate
→ validate
→ enough sayings?
   yes → continue
   no  → retry with rejected/recent sayings in avoid list
```

If still insufficient:

> Unable to create enough high-quality retirement sayings. Try again or choose a broader theme.

No local fallback.

---

## 7. Cipher

Reuse current `buildCipher()`.

Requirements:

```text
26 letters
26 unique mapped letters
bijection
no fixed points
```

Each puzzle gets its own cipher using:

```ts
deriveSeed(ctx.seed, `cipher:${index}`)
```

Do not share one cipher between multiple puzzles on the same page.

---

## 8. Puzzle Display

Each plaintext letter renders:

```text
[hidden answer letter]
────────
[cipher letter]
```

Puzzle page:

* plaintext hidden
* cipher visible
* underline visible

Answer page:

* plaintext visible
* cipher remains visible
* monochrome black

Reuse existing answer harvesting system.

---

## 9. Instructions

Use shorter copy:

> Decode each saying by replacing the coded letters. The same code always represents the same letter, and no letter stands for itself.

Do not mention memory training or cognitive benefits.

---

## 10. Large Print Layout

Default:

```text
8.5 × 11"
Portrait
Black & White
No Bleed
Large Print
```

Recommended minimum slot font:

```text
Large Print: 14 pt
Standard:    11 pt
```

Current implementation can shrink down to 9 pt. Do not allow that in Large Print mode. Current layout already wraps whole words and shrinks to fit; keep word-safe wrapping but increase the minimum font.

If content does not fit:

```text
reduce puzzle count
or
use shorter saying
```

Never split a word or shrink below minimum.

---

## 11. Puzzle Count

Recommended starting point:

```text
Short / medium: 2 puzzles/page (default)
Long: 1–2 puzzles/page
```

Auto-limit according to available space at the print-style minimum font.
Hard cap 6. Do not force 4+ onto a Large Print page when they would drop below 14 pt.

---

## 12. Page Title

Default title:

```text
RETIREMENT CRYPTOGRAM
```

Optional subtitle:

```text
Travel Dreams
Puzzle 12
```

If custom theme:

```text
RETIREMENT CRYPTOGRAM
Retirement by the Sea
```

Avoid generic `Game 12` as main title.

---

## 13. Book-Level Variety

Track recent sayings per:

```text
theme
length
project
```

Send recent sayings to AI as `avoid`.

Rules:

* no exact saying repeated
* no near-duplicate saying
* avoid same opening/structure repeatedly
* no identical cipher/grid page

Generate puzzle fingerprint from:

```text
normalized saying + cipher seed
```

Block duplicates.

---

## 14. AI/IP Safety

If custom theme contains obvious third-party IP, warn/block.

Examples:

```text
Disney Retirement
Taylor Swift Quotes
Star Wars Retirement
```

Prefer generic alternatives.

Never generate attributed quotes.

All AI sayings must be original-style content.

---

## 15. AI Tracking

Every puzzle is AI-generated.

Store:

```ts
{
  source: 'ai',
  category,
  theme,
  length,
  saying,
  seed,
  generatedAt
}
```

Set:

```ts
projectCompliance.aiGeneratedText = true
```

Show KDP AI-disclosure reminder at export.

---

## 16. Preflight

Before export verify:

```text
✓ saying valid
✓ cipher bijection valid
✓ no self-mapping
✓ answer letters match saying
✓ no duplicate sayings
✓ content fits safe area
✓ font >= Large Print minimum
✓ no words split
✓ answer key matches puzzle
✓ no error pages
✓ fonts embedded
✓ page dimensions valid
```

Block export if any hard check fails.

---

## 17. Generation Flow

```text
Category / Theme
      ↓
Length + Puzzle Count
      ↓
AI generates saying candidates
      ↓
Normalize + validate
      ↓
Safety/IP filter
      ↓
Variety check
      ↓
Select sayings
      ↓
Build cipher per saying
      ↓
Layout
      ↓
Large Print fit check
      ↓
Draw puzzle
      ↓
Draw answer key
      ↓
Book duplicate check
      ↓
KDP preflight
```

---

## 18. Acceptance Criteria

```text
[ ] AI-only
[ ] No bundled fallback
[ ] No custom saying mode
[ ] Original retirement sayings only
[ ] No famous/attributed quotes
[ ] No unsafe/IP-risky generated content
[ ] Cipher is bijective
[ ] No letter maps to itself
[ ] Separate cipher per puzzle
[ ] No word breaks
[ ] Large Print minimum font enforced
[ ] Answer key exact
[ ] Duplicate sayings blocked
[ ] AI usage tracked
[ ] Export preflight works
```
