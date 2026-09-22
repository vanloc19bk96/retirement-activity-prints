# Spec: Word Search (`word-search`), Retirement edition

Studio category `word`. Carry-over from Memory Activity Prints: keep the existing engine (placement, shapes, layout, answer key).
Follows `Studio Template Conventions`. This spec only lists what changes so it matches Hidden Message Word Search. Anything not stated is Cursor's call.

## 1. Rules

Classic word search: find and circle every word in the list. Filler letters are random.

## 2. Config (template fields)

Shared fields from conventions (`theme`, `tone`, `difficulty`, `printStyle`, `seed`, title fields, `fontFamily`). Default title `Word Search`. Plus:

| Field | Type | Default | Rule |
|---|---|---|---|
| `shape` | existing puzzle-mix shapes | square | Keep existing behaviour |
| `customWords` | string[] optional | empty | If set, skip AI; same filters apply |

Remove any old Memory-only fields that do not exist in conventions.

## 3. Presets

Same grid sizes as Hidden Message so both look consistent in one book:

| Difficulty | Large-print grid | Large-print words | Standard grid | Standard words | Directions |
|---|---:|---:|---:|---:|---|
| Easy | 10x10 | 12 | 12x12 | 18 | E, S |
| Medium | 12x12 | 14 | 13x13 | 22 | E, S, SE, SW |
| Hard | 13x13 | 16 | 15x15 | 28 | all 8 |

Minimum pool after filtering: `words + 6`.

## 4. API + AI payload

Reuse the existing word-search route and service; add `tone`, `printStyle`, `avoid`, `locale` to the request per conventions.

```ts
type WordSearchResponse = { words: string[] } // pool of 30 retirement words/phrases
```

Prompt: words fit theme and tone, familiar vocabulary, 3 to 11 letters after normalization, conventions content rules.

## 5. Normalization

`WordEntry { display, token }` as in Hidden Message. Drop too short/long (`> min(11, gridSize)`), illegal chars, duplicates, palindromes, nested tokens, unsafe copy.

## 6. Algorithm

Existing placer. Changes only:
- Seeded RNG per conventions (seed + attempt index); bounded attempts; `null` -> `prefetch` retries with seed +97.
- Place up to the preset word count; list only placed words.
- Fill empty cells with random A-Z, then verify every listed word appears exactly once (reverse direction on the same cells counts once). If filler creates a duplicate, re-roll those filler cells (bounded), else fail the attempt.
- Final error: `Could not build a word search. Try a broader theme or a different tone.`

## 7. Data structure

Existing `WordSearchPuzzle`, add `displays: string[]` for the word bank.

## 8. Puzzle render

Header + instruction `Find and circle every word in the list.`, square grid centered (or shape), word bank alphabetical in columns using `displays`. Font minimums per conventions.

## 9. Solution render

Existing answer key: capsule around each placement, bank and instructions dropped, monochrome answer ink.

## 10. Tests

Conventions test contract, plus: each listed word exactly once; only allowed directions; multi-word entries placed without spaces and shown with spaces; `customWords` skips AI and passes filters; grid sizes match the Hidden Message presets.

## 11. Edge cases

- Shape leaves too few cells: place as many as fit (minimum: easy preset count for the print style), else fall back to square.
- Pool too small after filtering: retry per conventions.