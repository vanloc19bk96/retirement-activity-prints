# Studio Games Knowledge Base

This document describes every activity/puzzle template ("game") available in the
**Studio** panel of this app (`frontend/src/components/panels/studio/StudioPanel.tsx`).
The app is a design tool for building print-ready, low-content activity books
(the kind sold on KDP): memory training, brain games, and puzzles for adult and
senior audiences. Each game is a self-contained page generator that drops a
fully laid-out page onto the book's canvas.

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

- **Category** — one of 3 buyer-facing groups (tab order below).
- **Page count** — currently `1` (a single puzzle page). Answer keys add a
  separate solution page when the game produces one.
- **Answer key** — when a game "produces an answer key," a solution page is
  appended automatically; this is never a manual toggle.
- **AI-generated content** — some games call an LLM to generate fresh puzzle
  content (words, stories, prompts) so no two printed copies repeat; others
  are fully algorithmic/procedural (seeded RNG only, no network call). Marked
  per game below as **AI content: yes/no**.
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

---

## Logic (1 game)

### Sudoku (`sudoku`)
Classic number Sudoku for a large-print retirement book. Fill every row, column
and box so each digit appears once. Sizes 9×9 and 6×6 (2×3 boxes). Difficulty is
Relaxed / Classic / Challenge based on logical techniques, not clue count — every
puzzle has exactly one solution and needs no guessing. Large print is the default
(one 9×9 per page); two puzzles fit on a page for 6×6 or standard-print 9×9.
Pages: 1 · Answer key: yes · AI content: no

---

## Word (9 games)

### Word Search (`word-search`)
A classic word search. Hide AI-written words on any theme, or your own list,
in a letter grid to find and circle. (Supports mixing puzzle shapes — see
recent "puzzle mix" work in this repo.)
Pages: 1 · Answer key: yes (marks every word) · AI content: yes

### Hidden Message Word Search (`hidden-message-word-search`)
A large-print word search whose leftover letters, read left to right and top to bottom,
spell an original retirement saying. Find every listed word, then write the
saying on the writing lines under the grid (one line per letter). Pick a theme
and tone, or type your own saying and let AI write only the words. Print style
defaults to large print (smaller grid / fewer words) for Amazon KDP readability.
Pages: 1 · Answer key: yes (marks every word, shades leftover cells, prints the saying) · AI content: yes

### Trivia Clue Word Search (`trivia-clue-word-search`)
A large-print word search driven by trivia. Every answer has a numbered clue
printed under the grid with its letter count — work the answer out, then find
it hidden in the letters. Answers are always single words, so the printed count
matches the cells exactly. Pick a theme and a level; the grid size, clue count,
clue column and every type size are fitted to the page in Settings, and the
level's help line reports what came out. Needs a 5.5 x 8.5 interior or larger.
Pages: 1 · Answer key: yes (circles every answer, lists them under the same numbers) · AI content: yes

### A to Z Word Search (`a-to-z-word-search`)
Alphabet soup. Twenty-six words are hidden in one grid — one beginning with A,
one with B, and so on to Z — and the page prints *only* the letters. There is no
word bank: the alphabet under the grid is the clue list, and the solver's job is
to find a word for every letter. Words come from a curated everyday-life lexicon
(no theme picker — no single subject has a recognisable word for all twenty-six
letters, and reaching for one is how a page ends up asking for XERISCAPE), drawn
fresh per puzzle, so a long book does not repeat. Pick a level: Gentle (4–6
letters, across and down), Classic (4–7, plus diagonals) or Challenging (4–9,
all eight headings and some backwards). Grid size, cell pitch, type sizes and how
many columns the letters and answers run in are not settings — the page derives
them from the trim in Settings and the level's help line reports what came out
(a 6 x 9 holds a 16 x 16 grid, an 8.5 x 11 an 18 x 18 at 17 pt). Needs a 6 x 9
interior or larger; below that the form says so instead of printing a squint. The
solution page is the same grid with every word circled, plus the A-to-Z list with
each letter's word beside it — the only page of the pair that prints the words at
all.
Pages: 1 · Answer key: yes (circles every word, lists all twenty-six by letter) · AI content: no

### Crossword (`crossword`)
A classic crossword. Solve the clues to fill interlocking words. Pick a
theme and let AI write the answers and clues, or supply your own words.
Pages: 1 · Answer key: yes · AI content: yes

### Codeword (`codeword`)
A crossword grid with **no clues**. Every letter of the grid is replaced by a
number, and the same number always stands for the same letter — crack the code
and the words fall out. Two or three number-to-letter pairs are printed under
the grid to start you off ("3 = A · 12 = E · 18 = T"); the rest of the alphabet
has to be worked out from the words themselves. Under the starter line is a key
strip: one writing box per number, with the starters already filled in, so the
solver builds the code as they go instead of keeping it in a margin. Pick a
theme (shared with the crossword, cryptogram, anagrams and missing vowels, so a
book can run several games on one theme, or rotate a fresh theme per page) and a
level: Gentle (about 10 words, 4–6 letters, three letters given), Classic (about
13, 4–8) or Challenging (about 15, 4–9, only two letters given). There is no
"write my own theme" box — this game has no clues for a model to write, so its
words come from the bundled retirement wordlists and a typed theme would have
nothing to read it.

Words are single plain words only: no phrases, no hyphenates, no place names
(a solver deduces a word from its letter pattern, and nobody deduces SANTORINI)
and no brand names. Grid size, cell pitch, number size and the key strip's
columns are not settings — the page derives them from the trim in Settings and
the level's help line reports what came out (a 6 x 9 holds a 13 x 13 grid with
numbers at 8 pt; an 8.5 x 11 a 15 x 15 at 10 pt). Cells never fall below a third
of an inch, so there is always room to write a capital. Needs a 5.5 x 8.5
interior or larger; below that the form says so instead of printing a squint.
The solution page is the same grid with every letter written in and the key
strip filled out — the finished grid and the whole code on one page.
Pages: 1 · Answer key: yes (completed grid + full number-to-letter key) · AI content: no

### Cryptogram (`cryptogram`)
Crack a coded saying in which every letter stands for a different one, and
no letter ever stands for itself. Pick a theme for AI-written sayings or
bring your own.
Pages: 1 · Answer key: yes · AI content: yes

### Phrase Finder (`phrase-finder`)
A retirement saying printed as one blank per letter, with a small share of the
letters already filled in where they belong, under a short clue that points to
it. A solver reads the clue, then works from the given letters, the word
lengths, the word breaks and the punctuation. The clue is what makes the answer
unique and the puzzle solvable, so it is never optional: these sayings are
written fresh for a theme rather than quoted from anywhere a solver could
already know, so blanks and a third of the letters do not single out one
wording — several plain English sentences fit the same row, and the answer page
prints exactly one of them. A clue runs to at most 48 characters, never reuses a
word of its own saying (or one sharing its first four letters), never appears
over two puzzles on a page, and never sets below 14 pt; a phrase whose clue is
missing, over-long or self-answering is dropped rather than printed. There is no
cipher beyond that: the shape of the phrase is the rest of the puzzle, which is
why the word gap is drawn far wider than a letter blank and why an apostrophe or
a hyphen prints at its own narrower pitch — a reader who counts a gap or a mark
as a blank is solving a different phrase from the one on the page. Pick a theme (shared with
the crossword, cryptogram and anagrams, so a book can run four games on one
theme, or rotate a fresh theme per page) and a level: Gentle (short phrases, up
to 40% of the letters given), Classic, or Challenging (the longest phrases, up
to 24%). Which letters are given is never a setting: the budget is spent one
word at a time, longest word first, so no word is more than half filled in, no
word is left with fewer than two blanks, no two given letters in a word sit side
by side, and a word of six letters or more is never left without a foothold — a
page that gave its budget to THE and OF while leaving the nine-letter word blank
is the failure this game is most likely to print, and the preflight refuses it.
How many phrases a page holds, how big the letters set and where the rows break
are not settings — the page derives them from the trim in Settings and the form
reports what that produced (a 6x9 holds two classic phrases; an 8.5x11 holds
three). Letters never set below 16 pt and blanks never get narrower than a hand
can write in. Every page of one run is pinned to the same pitch and puzzle count
so a book does not mix sizes. Given letters are told apart by being printed at
all, never by colour, so the page survives a black-and-white interior and a
photocopy. The solution page is the same rows with every letter written onto its
own blank, drawn from the same model as the puzzle, so the key cannot disagree
with the page — and it keeps the clues, so a reader checking a row sees what it
answered. AI writes fresh phrases and clues each page so a long book does not
repeat.
Pages: 1 · Answer key: yes · AI content: yes

### Anagrams (`retirement-anagram`)
Unscramble retirement-themed words. Each row prints the shuffled letters, a
short clue underneath, and one writing rule per letter of the answer — the clue
is what makes the answer unique and the puzzle solvable, so it is never
optional. Pick a theme (shared with the crossword and cryptogram, so a book can
run three games on one theme, or rotate a fresh theme per page) and a level:
Gentle (4–6 letters, first letter filled in), Classic (5–8), or Challenging
(6–10, every letter shuffled out of its seat). Word count, letter size, clue
size and whether the words run in one column or two are not settings — the page
derives them from the trim in Settings and the form reports what that produced
(a 6×9 holds about 5 words in one column; an 8.5×11 holds about 12 in two).
Every page of one run is pinned to the same pitch and column count, so a book
does not mix 16pt and 21pt pages. The solution page is the same page with the
words written onto the lines. AI writes fresh words and clues each page so a
long book does not repeat.
Pages: 1 · Answer key: yes · AI content: yes

### Missing Vowels (`missing-vowels`)
Write the missing vowels back into retirement-themed words and short phrases.
Every letter of the answer gets its own slot: consonants print, each A/E/I/O/U
leaves a writing rule to fill in, and a short clue sits underneath — the clue
is what makes the answer unique and the puzzle solvable, so it is never
optional. Y is printed like any other consonant and is never a blank. Pick a
theme (shared with the crossword, cryptogram and anagrams, so a book can run
four games on one theme, or rotate a fresh theme per page) and a level: Gentle
(5–7 letters, single words), Classic (6–9, words and short phrases), or
Challenging (8–10, the longest single words). Phrases live only in Classic: a
word gap is the widest thing a row holds and a two-column page pays for it in
every column, so the longest level takes single words and earns its second
column instead. How many puzzles a page holds, how big the letters set and
whether they run in one column or two are not settings — the page derives them
from the trim in Settings and the form reports what that produced (a 5×8 holds
about 5 in one column, an 8.5×11 holds 16 in two). Letters never set below 16 pt and blanks never
get narrower than a hand can write in, whatever the trim. Every page of one run
is pinned to the same pitch and column count, so a book does not mix sizes. An
answer only prints if restoring its vowels can spell nothing else in the common
word list, so B_LL and CH__R never reach the page. The solution page is the
same page with the vowels written into their own blanks. AI writes fresh words
and clues each page so a long book does not repeat.
Pages: 1 · Answer key: yes · AI content: yes

### Top Five Guess (`top-five-guess`)
A "guess the most likely answers" puzzle built for retirement books. Each block
prints one light question — "Name something you will never miss about the
office" — above five guess lines, each with a score blank, and a "Total ___ / 15"
tally. The reader writes five guesses, then checks the answer page: the top
answer scores 5 points, the next 4, down to 1 for the fifth. Points are fixed by
rank, never written by the model, so the ranking and the scores cannot disagree
and every page of a book scores alike. The answers are the set's intended answer
order — the page never claims survey or poll results, and it uses its own
neutral look rather than any TV show's board, wording or scoring.

The only setting is the theme (the shared retirement picker, including "write my
own"). Questions per page (one or two), line pitch and type sizes are derived
from the trim in Settings, and the theme's help line reports what came out (a
6 x 9 holds two questions at 14 pt; a 5 x 8 one at 19 pt). Guess lines never fall
below 0.36 in and questions never below 14 pt. Every set is validated in the
API and again in the browser before it reaches the page: exactly five answers,
read in the model's order and never repaired (a bad answer drops the whole set
rather than promoting a sixth); no two answers that are variations of one idea
(MEETINGS / TOO MANY MEETINGS, ROAD TRAFFIC / RUSH HOUR TRAFFIC); no answer that
repeats its question; no sensitive topics (health, death, politics, religion,
alcohol, gambling, age jokes), brands or poll language; no question the seller's
book already printed on that theme, and no two questions on a page that read as
the same puzzle. A set whose question would need more lines than the block
reserved, or whose answer cannot sit on one answer line, is passed over for the
next. The answer page is drawn from the same sets: each question with its five
answers ranked and their points beside them.
Pages: 1 · Answer key: yes (ranked answers with points) · AI content: yes

---

## Spatial (1 game)

### Maze (`maze`)
A pencil maze with one entrance, one exit, and exactly one way through.
Difficulty sets how twisty the route is and how long the solution runs.
Pages: 1 · Answer key: yes (traces the path) · AI content: no

---

## Quick-reference index (by key)

| Key | Label | Category | Pages | Answer key | AI content |
|---|---|---|---|---|---|
| sudoku | Sudoku | logic | 1 | yes | no |
| word-search | Word Search | word | 1 | yes | yes |
| hidden-message-word-search | Hidden Message Word Search | word | 1 | yes | yes |
| trivia-clue-word-search | Trivia Clue Word Search | word | 1 | yes | yes |
| a-to-z-word-search | A to Z Word Search | word | 1 | yes | no |
| crossword | Crossword | word | 1 | yes | yes |
| codeword | Codeword | word | 1 | yes | no |
| cryptogram | Cryptogram | word | 1 | yes | yes |
| phrase-finder | Phrase Finder | word | 1 | yes | yes |
| retirement-anagram | Anagrams | word | 1 | yes | yes |
| missing-vowels | Missing Vowels | word | 1 | yes | yes |
| top-five-guess | Top Five Guess | word | 1 | yes | yes |
| maze | Maze | spatial | 1 | yes | no |

**Total: 11 games** (1 logic · 9 word · 1 spatial).
