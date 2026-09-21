# Studio Games Knowledge Base

This document describes every activity/puzzle template ("game") available in the
**Studio** panel of this app (`frontend/src/components/panels/studio/StudioPanel.tsx`).
The app is a design tool for building print-ready, low-content activity books
(the kind sold on KDP): memory training, brain games, puzzles, and reminiscence
worksheets for adult and senior audiences. Each game is a self-contained page
generator that drops a fully laid-out page onto the book's canvas.

Use this document to understand *what each game is, how it plays, and what
options it exposes* — not the implementation. Source of truth in code:
`frontend/src/constants/studio-templates.ts` (registry) and
`frontend/src/utils/studio/<game-key>/generate.ts` (one folder per game).

## How the Studio panel works

- **Single mode** — browse all games as a searchable, category-filtered grid
  of cards. Selecting a card opens a config form, then generates one instance
  of that game and inserts it into the book at the current page.
- **Build a book mode** — generate many pages in one pass, either:
  - *Random mix* — pick a game count and which categories to draw from; the
    app assembles a shuffled/sequential plan across templates automatically.
  - *Choose games* — hand-pick specific games and how many copies of each,
    then order them.
- Every generated game can add an automatic **"Game N"** page title (and a
  matching **"Solution Game N"** title on its answer page), or the page can be
  left untitled.

## Shared concepts across all games

- **Category** — one of 4 buyer-facing groups (tab order below).
- **Page count** — currently `1` (a single puzzle page). Answer keys add a
  separate solution page when the game produces one.
- **Answer key** — when a game "produces an answer key," a solution page is
  appended automatically; this is never a manual toggle.
- **AI-generated content** — some games call an LLM to generate fresh puzzle
  content (words, trivia questions, stories, prompts) so no two printed
  copies repeat; others are fully algorithmic/procedural (seeded RNG only,
  no network call). Marked per game below as **AI content: yes/no**.
- **Freshness (AI games only)** — a model asked for the same theme twice
  answers with the same content, so every AI game runs the shared mechanism in
  `utils/studio/studio-variety.ts` (browser) and
  `services/studio_variety.py` (API). The browser remembers what each
  template + theme printed and sends it as `avoid`; the service merges that
  with its own memory of the same bucket and appends a "do not repeat these"
  block to the prompt, plus a seed-rotated angle so even the first sheet is not
  the model's default answer. New AI game: build the prompt as usual, wrap it
  in `with_variety(...)`, and call `remember(...)` with the labels the page is
  built from.
- **Common config fields** every game shares on top of its own options:
  - *Page title* (toggle) + *Title text* — leave blank to auto-number as
    "Game N" / "Solution Game N".
  - *Show instructions* (toggle) — show/hide the on-page instruction line.
- **Canvas-edit hint** — a few games group their output so the editor shows a
  tip ("ungroup the grid, then add from Components") if the user wants to
  hand-edit individual cells after generation. Marked **Canvas-edit hint** below.

## Category taxonomy

| Category | Tab label | What it covers |
|---|---|---|
| `logic` | Logic | Deduction, number and pattern puzzles with one right answer. |
| `word` | Word | Words and language. |
| `spatial` | Spatial | Visual-spatial reasoning and drawing. |
| `reminiscence` | Reminiscence | Nostalgia trivia and era-based recall. |

---

## Logic (1 game)

### Sudoku (`sudoku`)
The classic number placement puzzle. Fill every row, column and box so each
digit appears once. Sizes 9×9, 6×6, 4×4, each verified to have exactly one
solution.
Pages: 1 · Answer key: yes · AI content: no

---

## Word (8 games)

### Word Search (`word-search`)
A classic word search. Hide AI-written words on any theme, or your own list,
in a letter grid to find and circle. (Supports mixing puzzle shapes — see
recent "puzzle mix" work in this repo.)
Pages: 1 · Answer key: yes (marks every word) · AI content: yes

### Crossword (`crossword`)
A classic crossword. Solve the clues to fill interlocking words. Pick a
theme and let AI write the answers and clues, or supply your own words.
Pages: 1 · Answer key: yes · AI content: yes

### Cryptogram (`cryptogram`)
Crack a coded saying in which every letter stands for a different one, and
no letter ever stands for itself. Pick a theme for AI-written sayings or
bring your own.
Pages: 1 · Answer key: yes · AI content: yes

### Retirement Anagrams (`retirement-anagram`)
Unscramble retirement-themed words — work, hobbies, family, travel. AI writes
a fresh list each page so a long book does not repeat.
Pages: 1 · Answer key: yes · AI content: yes

### Anagram Sheet (`anagram-sheet`)
Unscramble the letters to spell each word. Pick a theme and let AI choose
fresh words, or supply your own list.
Pages: 1 · Answer key: yes · AI content: yes

### Missing Vowels (`missing-vowels`)
Every vowel has been taken out. Put them back to reveal each word. Pick a
theme and AI chooses fresh words.
Pages: 1 · Answer key: yes · AI content: yes

### Word Fit-In (`word-fit`)
A crossword grid with no clues. Every word on the list beside it fits one place
and one place only — worked out from its length and from the letters where
words cross. Sold on KDP as Fill-In or Kriss-Kross. A themed page draws its words from one
of the ten built-in themes, written fresh by AI per page; a mixed page draws
from every theme at once (procedural, with an optional word list of your own);
a numbers mode fills the same grid with digits instead, so the page needs no
reading at all. Every grid is re-solved from its own list before it prints.
Set "entries filled in to start" to 1+ and the generator reveals one more only
when a grid would otherwise have two fillings; set it to 0 and the grid always
prints bare (an ambiguous draw is redrawn, never pinned).
Pages: 1 · Answer key: yes · AI content: no

### Word Ladder (`word-ladder`)
Climb from one word to another by changing a single letter at a time, with
every rung a real word. AI writes the top and bottom words to your theme; the
solver still guarantees exactly one solution, and the given letters adjust with
difficulty.
Pages: 1 · Answer key: yes · AI content: yes

---

## Spatial (1 game)

### Maze (`maze`)
A pencil maze with one entrance, one exit, and exactly one way through.
Difficulty sets how twisty the route is and how long the solution runs.
Pages: 1 · Answer key: yes (traces the path) · AI content: no

---

## Reminiscence (1 game)

### Decade Trivia (`decade-trivia`)
Large-print nostalgia trivia on music, TV, films, products, and everyday
life. Pick a decade or type your own. Questions are AI-written and
fact-checked — spot-check before publishing.
Pages: 1 · Answer key: yes · AI content: yes

---

## Quick-reference index (by key)

| Key | Label | Category | Pages | Answer key | AI content |
|---|---|---|---|---|---|
| sudoku | Sudoku | logic | 1 | yes | no |
| word-search | Word Search | word | 1 | yes | yes |
| crossword | Crossword | word | 1 | yes | yes |
| cryptogram | Cryptogram | word | 1 | yes | yes |
| retirement-anagram | Retirement Anagrams | word | 1 | yes | yes |
| anagram-sheet | Anagram Sheet | word | 1 | yes | yes |
| missing-vowels | Missing Vowels | word | 1 | yes | yes |
| word-fit | Word Fit-In | word | 1 | yes | no |
| word-ladder | Word Ladder | word | 1 | yes | yes |
| maze | Maze | spatial | 1 | yes | no |
| decade-trivia | Decade Trivia | reminiscence | 1 | yes | yes |

**Total: 11 games** (1 logic · 8 word · 1 spatial · 1 reminiscence).
