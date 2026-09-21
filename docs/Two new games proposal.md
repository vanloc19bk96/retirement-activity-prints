# Two new Studio games — proposal

**Status:** proposed, not built
**Scope:** two new Studio templates, both non-card, both reusing machinery that
already ships in this repo. Find the Pair is fully procedural. Word Fit-In is
procedural in its mixed and numbers modes; its **themed** mode was later changed
to fetch a word list written per page (see "Themed banks" below), which is the
one place in either template an LLM is reached.
**Candidates:** `word-fit` (Word Fit-In) · `find-the-pair` (Find the Pair)

---

## 1. How these two were chosen

The roster is 56 templates. Counting by category:

| Category | Now | Note |
|---|---:|---|
| Memory | 15 | saturated |
| Logic | 14 | saturated — eight of them are grid-deduction puzzles |
| Word | 8 | **one whole best-selling genre missing** |
| Focus | 6 | thin, and it is the category the brand name leans on |
| Spatial | 6 | thin, but every cheap idea here needs new artwork |
| Reminiscence | 5 | thin, but every idea here is AI-written → §5.4 disclosure |
| Trackers | 2 | not a puzzle |

Four filters were applied to every candidate:

1. **Simple to play** — one instruction line, no worked example needed.
   This ruled out Skyscrapers, Slitherlink, Masyu, Binairo and Suguru: all fine
   puzzles, all needing a paragraph of rules, and all landing in the category
   that is already saturated.
2. **Answer key provable by solver**, not by hope (Card spec §5.6). This ruled
   out Odd One Out and Rebus, where a second reading of the puzzle can be
   defended and the printed key is then simply wrong.
3. **No new artwork and no LLM call.** This ruled out Spot the Difference,
   Jigsaw-piece and picture-based ideas. As proposed it kept both templates free
   of the KDP AI-content disclosure (Card spec §5.4); Word Fit-In's themed mode
   has since traded that away deliberately — see "Themed banks".
4. **Clears the 2⁴⁸ entropy floor** (Card spec §4.5) measurably, on one figure
   per page, with no config gymnastics.

Two candidates survived all four. They are unrelated to each other — one word,
one visual — so they do not compete for the same page in a book.

---

## 2. `word-fit` — **Word Fit-In**

`category: word · pages: 1 · producesAnswerKey: true · aiContent: false`

### Play

An empty interlocking grid, and a list of words beside it grouped by length.
Every word goes in exactly one slot. There are no clues — the puzzle is worked
out from word length and from the letters where slots cross. One word is
printed into the grid to start you off.

> *Fit every word into the grid. Each word is used once. One has been filled in
> to start you off.*

That is the whole instruction. This is the genre sold on KDP as **Fill-In,
Fill-It-In, Kriss-Kross or Word Fit** — it sits beside word search and sudoku
as a large-print staple, and it is the single largest genre gap in the roster.

### Why crossword does not already cover it

Crossword tests *vocabulary and general knowledge* — you must know that the
answer to the clue is TOUCAN. Word Fit-In tests **visual-spatial matching and
working memory**: the words are all in front of you, and the work is holding
candidate placements in mind while testing them against the crossings. It stays
solvable for a reader whose word-finding has declined, which is exactly the
audience this app sells to, and it is why fill-ins do well in the senior
large-print segment.

It is also the cheapest word puzzle to make defensible: no clue is written, so
no clue can be wrong, ambiguous, or need fact-checking before publishing.

### Modes

- **A · Themed fit-in** *(default)* — words drawn from one built-in theme.
- **B · Mixed fit-in** — words drawn across all themes; slightly harder,
  because theme knowledge no longer narrows the candidates.
- **C · Number fit-in** — the same grid and the same solver, filled with
  numbers instead of words. Zero vocabulary, so it works in any language
  edition and for readers who dislike word puzzles. Nearly free once A is
  built, and separately sellable as *Number Fill-In*.

### Config

| Field | Values | Default |
|---|---|---|
| `mode` | Themed / Mixed / Numbers | Themed |
| `theme` | the ten built-in themes, or a custom word list | Animals |
| `wordCount` | 10 / 14 / 18 | 14 |
| `gridSize` | derived from `wordCount` via `maxGridForPlaceCount()` | — |
| `starters` | 0 / 1 word / 2 words | 1 word |
| `listGrouping` | by length / alphabetical | by length |

`starters: 0` is offered, but the generator raises it automatically when
uniqueness cannot be reached otherwise, and the field help says so.

### Generation

1. Draw `wordCount` words from the theme pool with the seeded RNG.
2. `buildCrossword(pairs, maxSize, rng, placeCount)` — already in
   [construct.ts](frontend/src/utils/studio/crossword/construct.ts) — returns a
   connected interlocking grid plus placed entries. Pass `clue: ''`; a fit-in
   never reads it.
3. **Slot-assignment uniqueness solver (new, and the only real work).**
   Strip the letters back out, keeping only the slot skeleton and the word
   list. Backtrack over slots × words of matching length, honouring crossing
   letters, aborting at the second solution. Same shape as the sudoku counting
   solver.
4. If the count is > 1, reveal a starter word — the one whose slot most
   constrains its crossings — and re-run. Repeat up to 3 starters. If still
   ambiguous, redraw the word set. This loop is what stops the printed answer
   key from being merely *one of* several correct answers.
5. Canonical hash over the grid skeleton plus the sorted word list, reduced
   over the 8-element geometric symmetry group.

### Entropy

Ten built-in themes at **800 words each**, verified in
`frontend/src/data/studio/crossword/*.json`:

```
word set          C(800,14)                          ≈ 2^96
theme choice      10                                 ≈ 2^3.3
grid interlock    (measure; buildCrossword ordering)  ≥ 2^10
starter choice    ~14                                ≈ 2^3.8
                                                     ---------
per page                                             ≫ 2^48   ✓
```

The word-set term alone clears the floor by nearly fifty bits, and it comes
free from word data already in the repo. Still measure it with a
`wordFitPageEntropyBits()` function, per the entropy-report convention.

### Reuse vs. new code

| Reused as-is | New |
|---|---|
| `crossword/construct.ts` — grid builder | slot-assignment counting solver |
| `crossword/validate.ts` — connectivity, numbering | word-list panel, grouped by length |
| `crossword/draw.ts` — grid and numbering render | starter-reveal loop |
| `crossword/words.ts` + the ten theme JSONs | instruction pool (≥ 10 variants) |

**Effort: 2 days.** One for grid plus panel layout and print proofing, one for
the solver and the starter loop.

### Risks

- **Duplicate word lengths.** A grid whose slots are mostly 5 letters, filled
  from a list that is mostly 5-letter words, is where ambiguity lives. Bias the
  draw toward a spread of lengths and reject sets where any one length exceeds
  ~35% of the list. Cheap to enforce, and it is the difference between a
  1-starter puzzle and a 3-starter one.
- **The word-list panel eats the page.** Eighteen words at 16pt beside a 19×19
  grid will not fit a 6×9 trim. Gate `wordCount: 18` on trim size in
  `validateConfig`, the way `next-card` gates `figuresPerPage`.

---

## 3. `find-the-pair` — **Find the Pair**

`category: focus · pages: 1 · producesAnswerKey: true · aiContent: false`

### Play

A field of small figures. Every figure is different except **two, which are
exactly alike**. Find them and circle both.

> *Two of these are exactly the same. Circle them.*

No target is given, and that is what separates it from everything already in
the Focus tab.

### Why it belongs here

The existing Focus games all hand the reader the target: `symbol-hunt` says
"find every ★", `counting-streams` says "count the ✦", `change-detection` gives
you the before-grid to compare against. Find the Pair gives nothing. To solve
it the reader must **hold one figure's full description in working memory while
scanning the rest**, and keep a moving record of what has been ruled out. That
is a working-memory-under-scan task rather than a cancellation task — the one
genuinely missing attention drill, and it sits on the memory side of the brand.

It is also a staple page in senior and dementia-friendly activity books, where
it is one of the few puzzles that stays enjoyable when word-finding has
declined.

### Modes

- **A · One pair** *(default)* — exactly one duplicated figure in the field.
- **B · Several pairs** — 2–4 pairs hidden in a larger field; circle them all.
- **C · Match them up** — every figure has exactly one twin; join each pair with
  a line. Slower, calmer, and the mode that suits the gentlest tier.

### Difficulty — the part that makes it a real puzzle

Random figures make mode A trivial: the eye finds the repeat in seconds. The
difficulty lever is the **attribute distance of the field from the twin**.

Reuse the figure model already built for `matrix-reasoning`
([types.ts](frontend/src/utils/studio/matrix-reasoning/types.ts)):

```ts
Figure { shape: 7 kinds · count: 1|2|3 · fill: 3 · size: 3 · mark: 4 }
// 7 × 3 × 3 × 3 × 4 = 756 distinct figures, all already renderable
```

Distance-1 neighbours of any figure (differing in exactly one attribute):
`6 + 2 + 2 + 2 + 3 = 15`. Distance-2 neighbours: ~90.

| Tier | Field | Distractors drawn from |
|---|---|---|
| Warm-up | 16 | distance ≥ 3 from the twin |
| Easy | 24 | mixed, mostly distance 2–3 |
| Medium | 30 | distance ≤ 2 |
| Hard | 36 | distance ≤ 2, with ≥ 8 at distance 1 |

At Hard the reader is comparing figures that differ only in the inner mark or
by one size step, which is precisely the working-memory load the game exists to
create. Enforce that no *other* figure repeats — exactly one pair, no accidents.

### Config

| Field | Values | Default |
|---|---|---|
| `tier` | Warm-up / Easy / Medium / Hard | Easy |
| `mode` | One pair / Several pairs / Match them up | One pair |
| `pairCount` | 1–4 (mode B only) | 2 |
| `attributes[]` | which of shape / count / fill / size / mark may vary | all |
| `figureSize` | S / M / L | M |

`attributes[]` is worth exposing: switching `size` off gives a gentler,
cleaner-printing page, and switching `count` off makes every cell a single
shape, which is the most accessible setting of all.

### Generation

1. Pick the twin figure from the 756.
2. Build the distractor pool at the tier's distance band, shuffle, take
   `n − 2` **distinct** figures. Assert no duplicates among them.
3. Place all `n` figures on a grid in seeded random order, constrained so the
   two twins are **not adjacent and not in the same row or column** — an
   adjacent pair is spotted instantly and wastes the page.
4. Answer key: the same field with a ring around each twin. Reuse
   `drawAnswerRing` from `_shared/card-page.ts` — it is not card-specific.
5. Canonical hash over the multiset of figures plus their positions, reduced
   over the 8-element geometric symmetry group.

### Entropy

At Medium (30 cells, distractors within distance 2, pool ≈ 105):

```
twin figure       756                     ≈ 2^9.6
distractor set    C(105,28)               ≈ 2^78
arrangement       30!/2, less the 8-fold
                  symmetry collapse       ≈ 2^104
                                          ---------
per page                                  ≫ 2^48   ✓
```

Even Warm-up — 16 cells from a distance-≥3 pool — clears the floor on the
arrangement term alone. Measure it with `findThePairPageEntropyBits()` and add
the row to the entropy report.

### Reuse vs. new code

| Reused as-is | New |
|---|---|
| `matrix-reasoning/types.ts` — the Figure model | field builder with distance-banded distractors |
| `matrix-reasoning/shapes.ts` + `draw.ts` — figure renderer | twin-placement constraint |
| `_shared/card-page.ts` — `drawAnswerRing` | mode C pairing lines |
| `studio-layout.ts` — grid placement | instruction pool (≥ 10 variants) |

**Effort: 1 day.** Everything hard about drawing a figure is already solved;
this template is a field builder plus a placement constraint.

### Risks

- **Print legibility at 36 cells.** A distance-1 pair differing only in `mark`
  must still be distinguishable at the printed cell size. Set a cell floor the
  way `matrix-reasoning` does with `MIN_MATRIX_CELL`, and proof Hard on paper
  before shipping it. If it does not survive, cap Hard at 30 cells rather than
  shrinking the figures.
- **`size` is a weak attribute on a scanning page.** A "small" and a "medium"
  circle sitting ten cells apart are genuinely hard to compare, in a way that
  feels unfair rather than challenging. Consider defaulting `attributes[]` to
  exclude `size` and letting the user opt in.

---

## 4. Summary

| | `word-fit` | `find-the-pair` |
|---|---|---|
| Label | Word Fit-In | Find the Pair |
| Category | word | focus |
| Pages | 1 | 1 |
| Answer key | yes (solver-proven unique) | yes |
| AI content | themed mode only | **no** |
| Entropy at default | ≫ 2⁴⁸ ✓ | ≫ 2⁴⁸ ✓ |
| New artwork | none | none |
| Effort | 2 days | 1 day |

```
| word-fit       | Word Fit-In    | word  | 1 | yes | no |
| find-the-pair  | Find the Pair  | focus | 1 | yes | no |
```

**Build order:** `find-the-pair` first. It is one day, it touches no shared
module, and it validates the Focus-category page furniture that `word-fit`'s
larger layout will lean on. Then `word-fit`, whose only real risk is the
slot-assignment solver.

**Sales-page hooks:** *"Fill-In puzzles — the large-print genre readers ask for
by name, with no clues to fact-check."* Find the Pair extends the *"no AI
disclosure needed on these pages"* claim the Card pack already makes; so do Word
Fit-In's mixed and numbers modes. Its themed mode does not — do not let that
claim be printed against the template as a whole.

---

## Themed banks — later change

The ten bundled themes carry 800 words each, which clears the §4.5 entropy floor
on its own: twelve drawn from eight hundred never repeats a *grid*. What it does
not do is keep the *words* fresh. A sixty-page book draws 720 entries from that
one pool, so the reader meets the same OTTER and BADGER several times over long
before any grid repeats.

The themed mode therefore asks the model for a bank written for that page, reusing
the existing `/api/studio/theme-words` endpoint and the `studio_variety` avoid-list
that every other AI template already uses. Consequences, all deliberate:

- **Themed pages carry the §5.4 disclosure.** The form says so in the theme help
  text, so a seller is told before they generate, not after they upload.
- **Mixed, numbers and a seller's own list never call out.** `prefetch` returns
  early for all three, and `procedural-pack.test.ts` pins that down.
- **The bundled themes stay as the fallback.** A rate-limited or failed call
  degrades to the 800-word theme rather than losing the page — which is also what
  keeps the print-QA, uniqueness and reprint gates meaningful, since all three
  call `generate()` with no network at all.
