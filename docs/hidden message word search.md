# Spec: Hidden Message Word Search (`hidden-message-word-search`)

Retirement Activity Prints, Studio category: **Word Play**. First new template.
Implementation details not stated here (file layout, helper names, search heuristics, styling) are Cursor's call. Reuse the existing Word Search generator, layout and answer-key code wherever possible.

## 1. What the page is

A word search where, after every listed word is found, the leftover letters (read left to right, top to bottom) spell an original retirement saying. The reader writes the saying on the writing lines under the grid (one line per letter).

- Pages: 1 puzzle page + 1 solution page (automatic, like other games)
- AI content: yes (words + saying written fresh per page)

## 2. Config schema

```ts
type HiddenMessageWordSearchConfig = {
  theme: string;            // e.g. "Life after work", "Retiring nurse", free text
  tone: 'funny' | 'heartfelt' | 'classy' | 'sassy';
  difficulty: 'easy' | 'medium' | 'hard';
  printStyle: 'large-print' | 'standard'; // default large-print for KDP retirement books
  customMessage?: string;   // optional; if set, AI writes only the words
  // common fields: pageTitle toggle + text, showInstructions
};
```

Difficulty presets (Cursor may tune the numbers). **Large print is the default** (smaller grids, fewer words, bigger letters for Amazon KDP):

| | Large print grid | Large print words | Standard grid | Standard words | Directions |
|---|---|---|---|---|---|
| easy | 10×10 | ~12 | 12×12 | ~18 | right, down |
| medium | 12×12 | ~14 | 13×13 | ~22 | + diagonal down |
| hard | 13×13 | ~16 | 15×15 | ~28 | all 8 |

## 3. AI contract

One call, wrapped in the shared `with_variety(...)`; `remember(...)` the message and the words after success.

Prompt asks for JSON only:

```json
{ "message": "EVERY DAY IS SATURDAY NOW", "words": ["PENSION", "HAMMOCK", "..."] }
```

Rules given to the model:
- `message`: original saying (not a quote from a real person, no song lyrics), 15 to 35 letters excluding spaces, matches theme and tone.
- `words`: a **pool of 40** single words or short phrases on the theme, 3 to 11 letters each, no brand names.

Server-side validation (reject and retry, max 3 attempts, then return a clear error):
- Normalize: uppercase, strip everything except A-Z for the grid (keep the original text with spaces for display).
- Drop words that are palindromes, duplicates, or contained inside another pool word.
- Need at least `listedWords + 8` valid words after filtering.

## 4. Generation algorithm

Goal: **empty cells after placement == message letter count (L)**, exactly.

1. Seeded RNG (same seed + same AI output = same page).
2. Place words from the pool using the existing placer, preferring placements that overlap existing letters (dense grid).
3. Stop adding words when `emptyCells - L` reaches 0. Adjust by adding a short word from the pool or removing the last placed word until equal. Cursor chooses the search strategy; put a bounded retry budget on it with a fresh seed per retry.
4. If no exact fit after the budget: move to the next grid size (for example 12 to 13), then ask the AI for a new pool as last resort.
5. Write the message letters into the empty cells in reading order.
6. Verify (see tests). Any failure counts as a failed attempt.

The listed words are only the words actually placed.

## 5. Layout

- Title (default "Hidden Message Word Search" or "Game N" per existing rule), instruction line when enabled:
  "Find every word in the list. The letters left over, read from left to right, reveal a secret retirement saying."
- Grid centered, **large print by default** (KDP senior-readable: grid letters ≥16 px floor, word bank ≥14), same cell styling as Word Search.
- Word list below the grid, alphabetical, in columns, display text with spaces.
- Message area at the bottom: one writing line per letter (room to handwrite), visible gaps between words, wraps across lines at word boundaries.

## 6. Answer key

Solution page: every word marked (same style as Word Search key), message cells shaded, and the full message printed under the grid.

## 7. Test contract

- Leftover cell count equals message letter count.
- Leftover letters in reading order equal the normalized message.
- Every listed word appears in the grid **exactly once** in any allowed direction (the message letters must not create a second copy).
- Only the difficulty's allowed directions are used.
- Same seed and same AI payload produce an identical grid.
- Invalid AI JSON, too-short pools and too-long messages trigger a retry, then a clear user-facing error.
- `customMessage` skips message generation and passes the same checks.

## 8. Edge cases

- Message longer than the grid can hold: grow the grid once, else ask for a shorter message.
- Words with spaces ("NO MORE ALARMS"): grid uses letters only, list shows the spaces.
- Punctuation in the message (apostrophes, commas) is shown in the answer text but never in the grid or the boxes.
- AI returns words related to health claims, finance advice or brands: filter them out in validation.