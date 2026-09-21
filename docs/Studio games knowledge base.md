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

- **Category** — one of 5 buyer-facing groups (tab order below).
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
- **Fixed title games (trackers)** — logs/trackers default their page title to
  a fixed label (e.g. "Puzzle Log") instead of auto-numbering "Game N".

## Category taxonomy

| Category | Tab label | What it covers |
|---|---|---|
| `logic` | Logic | Deduction, number and pattern puzzles with one right answer. |
| `word` | Word | Words and language. |
| `spatial` | Spatial | Visual-spatial reasoning and drawing. |
| `reminiscence` | Reminiscence | Life story, nostalgia and open-ended writing. |
| `tracker` | Trackers | Logs and planners the reader fills in over time. |

---

## Logic (14 games)

### Sudoku (`sudoku`)
The classic number placement puzzle. Fill every row, column and box so each
digit appears once. Sizes 9×9, 6×6, 4×4, each verified to have exactly one
solution.
Pages: 1 · Answer key: yes · AI content: no

### Cross Sums (`kakuro`)
A number crossword puzzle. Fill each run with digits that
add up to its clue, never repeating a digit inside a run. One solution,
reachable by logic.
Pages: 1 · Answer key: yes · AI content: no

### Math Cage (`kenken`)
A math grid puzzle, also called Calcudoku. Fill rows and columns 1–N with no
repeats so each bold cage hits its target using +, −, ×, ÷.
Pages: 1 · Answer key: yes · AI content: no

### Futoshiki (`futoshiki`)
Fill the grid 1–N with no repeats in any row or column, while every
greater-than sign between cells stays true. One solution, reachable by logic
alone.
Pages: 1 · Answer key: yes · AI content: no

### Nonogram (`nonogram`)
A grid logic puzzle, also called Picross. Use the number clues beside each
row and column to work out which squares are filled. Solvable by logic
alone, no guessing.
Pages: 1 · Answer key: yes · AI content: no

### Hitori (`hitori`)
A Japanese elimination puzzle. Shade cells until no number repeats in any row
or column, keeping shaded cells apart and unshaded cells connected.
Pages: 1 · Answer key: yes · AI content: no

### Shikaku (`shikaku`)
A Japanese dividing puzzle, also sold as Rectangles. Cut the grid into
rectangles so each one holds a single number equal to its area. Exactly one
solution.
Pages: 1 · Answer key: yes · AI content: no

### Number Snake (`number-snake`)
Fill the grid 1–N so consecutive numbers always touch, tracing one
continuous path. Diagonal moves (Hidato) or straight moves only (Numbrix).
Pages: 1 · Answer key: yes · AI content: no

### Magic Square (`magic-square`)
Fill in the missing numbers so every row, column and diagonal adds up to the
same total. Grids 3×3 to 7×7, with number banks going beyond the usual 1–n².
Pages: 1 · Answer key: yes · AI content: no

### Pattern Continuation (`pattern-continuation`)
Work out the rule behind each row of numbers or letters, then fill in the
missing term. Rules cover adding, multiplying, squares, Fibonacci,
alternating series, and more.
Pages: 1 · Answer key: yes · AI content: no

### Matrix Reasoning (`matrix-reasoning`)
The classic non-verbal reasoning puzzle, also printed as "Find the Missing
Piece." Figures in a 3×3 grid follow hidden rules across rows and columns;
the reader picks the piece that fits the blank square.
Pages: 1 · Answer key: yes · AI content: no

### Mental Math Ladder (`mental-math-ladder`)
Hold a running total in your head down a ladder of steps, then write only
the final answer. Whole numbers throughout, never negative.
Pages: 1 · Answer key: yes · AI content: no

### Card Sums (`card-sums`)
Mental arithmetic on playing cards. Three puzzle types: add up each row,
circle the cards that make a target total, or follow a plus-and-minus ladder
to its final figure. Court cards can count as 11/12/13 or as 10 each; values
are explained in the instructions when the toggle is on.
Pages: 1 · Answer key: yes · AI content: no · Tag: `card`

### Next Card (`next-card`)
Each row of playing cards follows a hidden rule — the rank climbs, the suit
cycles, the colour alternates. Work out the rule and supply the card that
comes next (draw it, write rank+suit, or circle one of three choices). Every
sequence is checked so the printed answer is the only fair one.
Pages: 1 · Answer key: yes · AI content: no · Tag: `card`

---

## Word (9 games)

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

### Anagram Sheet (`anagram-sheet`)
Unscramble the letters to spell each word. Pick a theme and let AI choose
fresh words, or supply your own list.
Pages: 1 · Answer key: yes · AI content: yes

### Missing Vowels (`missing-vowels`)
Every vowel has been taken out. Put them back to reveal each word. Pick a
theme and AI chooses fresh words.
Pages: 1 · Answer key: yes · AI content: yes

### Category Fluency (`category-fluency`)
Write as many things from a category as you can before time runs out.
Categories are fresh every time; the answer key lists sample answers for
self-checking.
Pages: 1 · Answer key: yes (sample answers) · AI content: yes

### First Letter Recall (`first-letter-recall`)
Write as many words as you can that start with a given letter before time
runs out. The answer key lists sample words for self-checking.
Pages: 1 · Answer key: yes (sample answers) · AI content: yes

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

## Spatial (6 games)

### Maze (`maze`)
A pencil maze with one entrance, one exit, and exactly one way through.
Difficulty sets how twisty the route is and how long the solution runs.
Pages: 1 · Answer key: yes (traces the path) · AI content: no

### Follow the Route (`follow-the-route`)
Start on the dot and follow a list of moves across the grid — up 2,
right 3, down 1 — then shade the square you land on, or write its coordinate.
An advanced mode prints both markers (dot start, square end) and asks the reader
to write a route that connects them. Difficulty sets the grid, the number of
moves and how far each one goes; moves can be shown as arrows or words,
and Expert can add diagonals. Every route stays inside the grid.
Pages: 1 · Answer key: yes · AI content: no

### Mirror Draw (`mirror-draw`)
Complete the picture by drawing its mirror image across the line of
symmetry. Grid squares make every mark easy to count and place.
Pages: 1 · Answer key: yes (finished picture) · AI content: no

### Paper Folding (`paper-folding`)
Follow a sheet as it's folded and punched, then picture it opened out and
pick the matching hole pattern. A visual-reasoning classic.
Pages: 1 · Answer key: yes · AI content: no

### Shape Rotation Match (`shape-rotation-match`)
Decide whether each pair of blocks is the same shape turned around or a
mirror image. Solid black-and-white silhouettes.
Pages: 1 · Answer key: yes · AI content: no

### Grid Copy (`grid-copy`)
Copy a shaded pattern from the model grid into the empty grid beside it.
Grid size and shaded-cell count set the difficulty; the model stays on the
page as its own answer key.
Pages: 1 · Answer key: no (model doubles as key) · AI content: no

---

## Reminiscence (5 games)

### Decade Trivia (`decade-trivia`)
Large-print nostalgia trivia on music, TV, films, products, and everyday
life. Pick a decade or type your own. Questions are AI-written and
fact-checked — spot-check before publishing.
Pages: 1 · Answer key: yes · AI content: yes

### Title Complete (`title-complete`)
Fill in the missing words of famous song, film, and TV titles from memory.
Pick a category and era, or type your own. Titles only (never lyrics), so
the book stays independent of any artist or studio.
Pages: 1 · Answer key: yes · AI content: yes

### Family Names (`family-names`)
A large-print keepsake table to write family members’ labels, first names,
last names, and ages. Choose how many blank rows fit the page.
Pages: 1 · Answer key: no (fill-in roster) · AI content: no

### Life Timeline (`life-timeline`)
A guided keepsake for writing down a life story, stage by stage. Warm,
open-ended prompts with plenty of room to write.
Pages: 1 · Answer key: no (open-ended writing) · AI content: yes

### Memory Journal Prompt (`memory-journal-prompt`)
One open-ended prompt with a full page to answer it. Prompts are generated
fresh, so a long journal never repeats itself. Large print for handwriting.
Pages: 1 · Answer key: no (open-ended writing) · AI content: yes

---

## Trackers (2 games)

### Spaced Repetition Log (`spaced-repetition-log`)
A review tracker built on spaced repetition. Write down what you want to
remember, then tick off each review on a schedule that moves it into
long-term memory.
Pages: 1 · Answer key: no · AI content: no · Fixed default title

### Puzzle Log (`brain-training-tracker`)
A log for the puzzles you finish: the date, the page, whether you completed
it, and room for a note. Large print with plenty of writing space.
Pages: 1 · Answer key: no · AI content: no · Fixed default title (key: `brain-training-tracker`)

---

## Quick-reference index (by key)

| Key | Label | Category | Pages | Answer key | AI content |
|---|---|---|---|---|---|
| sudoku | Sudoku | logic | 1 | yes | no |
| kakuro | Cross Sums | logic | 1 | yes | no |
| kenken | Math Cage | logic | 1 | yes | no |
| futoshiki | Futoshiki | logic | 1 | yes | no |
| nonogram | Nonogram | logic | 1 | yes | no |
| hitori | Hitori | logic | 1 | yes | no |
| shikaku | Shikaku | logic | 1 | yes | no |
| number-snake | Number Snake | logic | 1 | yes | no |
| magic-square | Magic Square | logic | 1 | yes | no |
| pattern-continuation | Pattern Continuation | logic | 1 | yes | no |
| matrix-reasoning | Matrix Reasoning | logic | 1 | yes | no |
| mental-math-ladder | Mental Math Ladder | logic | 1 | yes | no |
| card-sums | Card Sums | logic | 1 | yes | no |
| next-card | Next Card | logic | 1 | yes | no |
| word-search | Word Search | word | 1 | yes | yes |
| crossword | Crossword | word | 1 | yes | yes |
| cryptogram | Cryptogram | word | 1 | yes | yes |
| anagram-sheet | Anagram Sheet | word | 1 | yes | yes |
| missing-vowels | Missing Vowels | word | 1 | yes | yes |
| category-fluency | Category Fluency | word | 1 | yes | yes |
| first-letter-recall | First Letter Recall | word | 1 | yes | yes |
| word-fit | Word Fit-In | word | 1 | yes | no |
| word-ladder | Word Ladder | word | 1 | yes | yes |
| maze | Maze | spatial | 1 | yes | no |
| follow-the-route | Follow the Route | spatial | 1 | yes | no |
| mirror-draw | Mirror Draw | spatial | 1 | yes | no |
| paper-folding | Paper Folding | spatial | 1 | yes | no |
| shape-rotation-match | Shape Rotation Match | spatial | 1 | yes | no |
| grid-copy | Grid Copy | spatial | 1 | – | no |
| decade-trivia | Decade Trivia | reminiscence | 1 | yes | yes |
| title-complete | Title Complete | reminiscence | 1 | yes | yes |
| family-names | Family Names | reminiscence | 1 | – | no |
| life-timeline | Life Timeline | reminiscence | 1 | – | yes |
| memory-journal-prompt | Memory Journal Prompt | reminiscence | 1 | – | yes |
| spaced-repetition-log | Spaced Repetition Log | tracker | 1 | – | no |
| brain-training-tracker | Puzzle Log | tracker | 1 | – | no |

*"Answer key = –" means the game is self-checking (an open-ended prompt,
or a model that doubles as its own key) rather than producing a separate
solution page.*

**Total: 36 games** (14 logic · 9 word · 6 spatial · 5 reminiscence · 2 tracker).
