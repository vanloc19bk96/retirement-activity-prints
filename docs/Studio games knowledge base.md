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

## Logic (2 games)

### Sudoku (`sudoku`)
Classic number Sudoku for a large-print retirement book. Fill every row, column
and box so each digit appears once. Sizes 9×9 and 6×6 (2×3 boxes). Difficulty is
Relaxed / Classic / Challenge based on logical techniques, not clue count — every
puzzle has exactly one solution and needs no guessing. Large print is the default
(one 9×9 per page); two puzzles fit on a page for 6×6 or standard-print 9×9.
Pages: 1 · Answer key: yes · AI content: no

### Logic Grid: Farewell Party (`farewell-logic-grid`)
A classic deduction grid set at a retirement party. The reader gets a scene
("The Garden Party"), a two-sentence story, a numbered list of clues and a
staircase grid, and marks X for no and a dot for yes until every person is
matched with one value in each category ("Carol brought the apple pie, retired
in March and is taking up pottery"). The page never relies on colour: blocks
are split by heavy rules, cells by fine ones, and each label sits in its own
ruled slot. Column labels are the only sideways text and read upward from the
grid.

Settings: the level only.
- Gentle: four people, two categories, plain "who did" / "who did not" clues.
- Classic: four people, three categories, a mix of clue types, at most two
  clues that give a match outright.
- Challenging: five people and three categories where the trim allows (four
  on smaller trims), led by either/or, pairs and exact order, at most one
  outright match.
People, categories, clue count, type size, square size and pages are not
settings; the level's help line reports what the trim prints.

Every puzzle is built and proved in the browser (no AI). A seeded scene,
people and hidden answer are drawn, then true clues are offered one at a time
and kept only when they let the reader mark something new, until deduction
alone fills the grid. Every clue the puzzle can do without is then removed,
so none is redundant. The reader model uses one clue at a time against what is
already marked, plus one-per-row and one-per-column; it never guesses and
follows a guess, so no level needs trial and error. An exhaustive count then
has to find exactly one answer, and every clue is re-checked against the stored
answer. A puzzle that fails any check, or whose clues would overrun the page,
is thrown away and rebuilt; it never reaches the book.

Clue kinds: a match ("Robert brought the pasta salad"), a non-match, "neither…
nor", "either… or" (always two values of the same kind, so inclusive and
exclusive readings agree), "of X and Y, one… and the other…", and relative or
exact order ("retired two months before"). A clue names at most two people by
description, and never runs past three lines.

Content: nine party scenes (potluck, garden party, community send-off,
retirement dinner, class sign-up, library tea, last-day lunch, neighborhood
party, reunion), each with five or six categories of its own, drawn from seventeen
category pools (dishes, gifts, months, years of service, former jobs,
departments, party tasks, new hobbies, class days, arrival times, toast order,
garden plants, volunteering, desserts, day trips, reading, teas) and seventy-two
first names, never two with the same initial in one puzzle. Nothing about
health, money, family status, home ownership or physical ability, and no
brands or real people. Grid labels are twelve characters at most.

Layout, decided from the trim: clues and grid share a page when both fit at 15
pt or larger with squares of at least 0.29 in. Otherwise the story and clues
take the first page (up to 18 pt when the clues allow) and the grid the next,
with a note saying so; on the narrowest trims a clue or two may continue above
the grid. Squares are never smaller than 0.25 in and labels never below 12 pt.
When there is room, the grid page adds a blank "Final answers" chart.

The answer page carries the scene name, the answer as a table (a list on very
narrow trims) and the grid with one check per person in every block. It is
drawn from the same puzzle object as the clues, attached to the last puzzle
page, so it can only show the answer the clues lead to.

Uniqueness: each puzzle stamps its scene, categories and a noun-free digest of
its deduction pattern. A new puzzle refuses any pattern already in the book,
avoids a scene-and-category combination the book already prints while another
is open, and takes the least-used scene first.
Pages: 1-2 (plus an answer page) · Answer key: yes (table and checked grid) · AI content: no

---

## Word (27 games)

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

### Would You Rather: Retirement Edition (`would-you-rather`)
A conversation game built for retirement books, couples and retirement parties.
Each question prints "Would you rather…" above two choices from one scenario —
"Spend a spring weekend in a cottage by the sea" OR "Spend a spring weekend at a
farmhouse in the hills" — each in a box of exactly the same size with a square
to tick, separated by a round OR badge, so neither choice looks like the answer.
There is no right answer and no answer page.

Settings: the theme (the shared retirement picker; its default mixes a different
retirement topic into every question on the page), the tone (a mix of
thoughtful and fun, warm and thoughtful, or light and funny) and an optional
"Why?" writing line under each question. Questions per page (at most four, three
with the writing line) and type size are derived from the trim, and the theme's
help line reports what came out (a 6 x 9 holds two to three questions at 17-19
pt; nothing is ever set below 14 pt, and no choice runs past three lines).

AI writes fresh questions for every page. Each question in a request gets its
own brief — a retirement topic and a dilemma shape, sampled by seed — so
variety comes from structure, not paraphrase. Every shape is an axis with two
opposite ends (quiet vs lively, host vs guest, cosy favourite vs something new,
old memories vs new ones…): the topic gives the one situation both choices
share, and each choice sits at one end, so picking one means giving up the
other. The model first names that shared setup and the "X vs Y" trade-off; a
pair it cannot sum up that way (two unrelated activities, or two versions of
the same thing with nothing to weigh) is dropped in the API. Every pair is
validated in the API and again in the browser: both
choices present, verb-led so they complete the lead, one clause with no third
option hidden inside, of similar length, genuinely different (not the same words
twice, not "go" vs "never go"), and free of sensitive topics (health, ageing
bodies, memory, loneliness, money worries, death, politics, religion, alcohol,
gambling, age jokes), brands and celebrities. Repeats are caught on content
words with sides in either order, and one side reused word for word also counts
as a repeat. A new question is checked against every Would You Rather question
already in the book (read back from the pages themselves), what this seller's
browser printed recently for the theme, and the server's recent memory for the
seller; a pair that repeats any of them is dropped, never added. A pair whose
choice would need more lines than its box reserved is passed over for the next.
Pages: 1 · Answer key: no · AI content: yes

### Ever or Never: Retirement Edition (`ever-or-never`)
A party and keepsake game built for retirement books. Each row prints one short,
specific retirement-life statement — "Ever taken a nap before lunch on a
Tuesday?" — with a square to tick beside **Ever** and another beside **Never**,
and a "Total Evers: ____ out of N" tally under the list so friends can compare.
Rows are numbered and ruled so the eye tracks from statement to boxes. On wide
trims (7 x 10, 8.5 x 11) the answers sit to the right of each statement, lined
up down the page like a scorecard; on smaller trims they go on their own line
under it, so a statement is never squeezed into a sliver. There is no right
answer and no answer page.

Settings: the theme (the shared retirement picker; its default mixes a different
retirement topic into every statement on the page), the tone (a mix of warm and
funny, warm and gentle, or light and funny) and an optional story line under
each statement for keepsake books. Statements per page (at most ten, six with
the story line), type size and where the answers sit are derived from the trim,
and the theme's help line reports what came out (a 6 x 9 holds six at 16 pt;
nothing is ever set below 14 pt, and no statement runs past three lines).

AI writes fresh statements for every page. Each statement in a request gets its
own brief — a retirement topic (naps, free weekdays, the old alarm clock, the
garden, grandchildren, travel, clubs…) and an angle (a first time, a small
freedom work never allowed, a harmless rule broken, a happy mix-up…), sampled by
seed — so variety comes from structure, not paraphrase. The model first names
the one concrete moment that either happened or did not; a vague habit ("Ever
enjoyed retirement?") has nothing to tick and is dropped. Every statement is
validated in the API and again in the browser: "Ever" followed by a past
participle, one experience (no "or"), no negation that would turn the boxes
inside out, short enough for the lines its row reserved, and free of sensitive
topics (health, ageing bodies, memory lapses, loneliness, money worries, death,
politics, religion, alcohol, gambling, age jokes), brands and celebrities.
Repeats are caught on content words. A new statement is checked against every
Ever or Never statement already in the book (read back from the pages
themselves), what this seller's browser printed recently for the theme, and the
server's recent memory for the seller; one that repeats any of them is dropped.
Pages: 1 · Answer key: no · AI content: yes

### Retirement Bucket List (`bucket-list`)
A big, browsable keepsake list of things to do in retirement: 50, 75 or 100
numbered ideas — "Take a scenic train journey", "Grow a pot of herbs on a
windowsill", "Write a letter to a teacher who inspired you" — grouped under
theme headings (Travel, Learn Something New, Give Back, Slow Down & Relax,
Everyday Joys...), each with a large box to tick once it is done. The reader
browses for possibilities and ticks them off over months and years. There is
no right answer and no answer page.

Settings: how many ideas (50, 75 or 100; 100 by default) and the mix (a bit of
everything, close to home & low-cost, travel & adventure, creativity &
learning, or friends & community). The mix only weights the list: every list
keeps at least one restful, one close-to-home, one going-places, one creative
and one people theme. Themes, ideas per page, type size, pages and checkbox
size are not settings; the count's help line reports what the trim prints
("100 ideas under about 12 themed headings — about 8 pages in 16 pt large
print" on a 6 x 9).

Page: one column per page — a bold theme heading with a rule under it, then
rows of a checkbox (at least 3/16 in), the idea's number and the idea. Numbers
run 1 to N across every page, never restarting. A heading only starts where it
and two ideas fit, is repeated at the top of the next page as "(continued)"
(or "(cont.)" where the long form will not fit) when it runs over, and never
leaves one idea alone on the next page. Every page keeps the title; only the
first carries the how-to. Type is 16 pt on most trims, 18 pt where a typical
idea still sits on one line (7 x 10, letter), never below 14 pt, and an idea
never runs past two lines (three on the narrowest trims). Where the last page
has room, the list closes with "Your Own Ideas": three to eight write-in lines
with boxes, wide-ruled — never on a page of its own.

Ideas (AI content, `services/studio_bucket_list_service.py`): the service
samples the list's headings from a bank of 27 themes in five groups (calm,
close to home, going places, creative, people), about eight ideas under each,
the focus weighted up. Every idea gets its own brief — one of its theme's
10-12 facets plus a flavour (free, at home, with a friend, a small splurge,
indoors on a rainy day...), shuffled by seed — so a list cannot be twenty ways
of saying "travel". Headings are written in batches of about three that run
concurrently; each batch is told which headings the rest of the list owns.
Headings are printed from the bank, never written by the model. The model
names each idea's underlying experience first ("scenic train journey"), then
writes the idea.

Gates, in the API and again in the browser: one idea starting with a verb
(not "Visiting...", "Finally..."), 2-10 words and at most 52 characters, no
"or"/"then", no second action joined by "and" or a comma, no colon or slash,
not shouting; something concrete must be left once the empty words are gone,
so "Experience more adventure" and "Learn new things" are refused; nothing
about health, ageing bodies, memory, money worries, loneliness, death, time
running out ("before it's too late"), age jokes, politics, religion, alcohol,
gambling, risky stunts (skydiving, bungee...), brands, trademarked events or
celebrities; and nothing that assumes a spouse, children, grandchildren, a
house or a yard.

No repeats in meaning: ideas are compared on content words after set phrases
and synonyms are folded ("trip"/"journey"/"holiday", "painting"/"watercolour",
"northern lights"/"aurora") and generic verbs (try, learn, take, visit...)
dropped, so "Try painting", "Learn painting" and "Take a painting class" are
one idea, and "Visit a new country" and "Take a trip to a country you have
never visited" are one idea. The model's name for the experience catches the
same thing in other words. Checked across the whole list, against every idea
already in the book (read back from its pages), this seller's recent lists
for the mix (browser) and the worker's memory — all bounded, never a
comparison with every list ever made. A heading left short after the book
check is topped up by name; the list is then balanced to the exact count
(each heading its share, spares spread at most two over), and a heading too
thin to stand is left out rather than padded.

Quality gate: a preflight re-proves the exact count, one unbroken numbering
run, every idea set as written within its lines, no two ideas alike, every
heading beside its ideas, every page inside the printable area, and large
print and pen-sized boxes. Black ink only. If the list cannot be made, the
page says so plainly.
Pages: 4-12 (by trim and length) · Answer key: no · AI content: yes

### What's Your Retired Name? (`retired-name`)
A party and keepsake game built for retirement books. The reader finds the
first letter of their first name in an A–Z table for a new first name, and
their birth month in a January–December table for a new last name, then reads
the two together: "Captain" + "Hammock Snoozer". Under the tables, a framed
worked example does one lookup from the page's own tables ("Example: Kelly,
born in August — K + August = Maestro Cruise Hopper"), and a line reads "My
retired name: ____". There is no answer page.

Settings: the theme only (the shared retirement picker; its default mixes a
different retirement pastime into every last name, and a chosen theme shapes
the last names while first names stay general). Everything else is derived
from the trim and reported in the theme's help line: type size, whether the
tables sit side by side or stacked, two to four letter columns and one to
three month columns, full or short month names ("Sep" when "September" would
cost more than about a point), and whether the example and write-in line fit.
Nothing is set below 12 pt; a 6 x 9 prints at about 14 pt, a letter page at
about 17 pt. A 5 x 8 trim is too narrow for 38 entries at that size, and the
form says so rather than printing small type.

Every pairing of the 26 × 12 must read as a real name, so the two lists are
held to one shape rather than checked pair by pair: a first name is a
gender-neutral title or cheerful nickname (one word, or a fixed two-word
nickname that does not itself read like a surname, at most 10 characters); a
last name is exactly two words, a leisure thing and the doer of it (the second
word ends in -er / -or / -ist or is a word like Champ or Whiz, at most 16
characters). AI writes fresh pools for every page, with spares. Each name gets
its own brief, sampled by seed: a first-name kind and flavour, or one of ~100
retirement pastimes (a facet of the theme when one is chosen). Names are
validated in the API and again in the browser: shape, pronounceable words, no
two sharing a word root within a list or across the two, and free of sensitive
topics, age jokes, insults, gendered words, alcohol, brands and characters. A
last name already printed in the book, recently in this browser, or recently
by the server for this seller is dropped. First names are only ranked behind
fresh ones, because good gender-neutral titles are finite. The table prints
whole (26 letters, 12 months) or not at all.
Pages: 1 · Answer key: no · AI content: yes

### Roll-a-Day: Retirement Edition (`roll-a-day`)
A playful plan-your-day game built for retirement books. The reader rolls a die
for their morning and rolls again for their afternoon, then puts the two
together: "Take a slow walk and grab a coffee" + "Bake a small batch of
scones". The page prints two six-row tables, "Roll #1: Morning" and "Roll #2:
Afternoon", each row a die face drawn with its pips beside one activity, and
closes with "I rolled: Morning ☐ Afternoon ☐" to note the two numbers. 36
possible days; no scoring, no extra rules, playable with any ordinary die.
There is no right answer and no answer page.

Settings: the mix only (a bit of everything, cosy days close to home, out &
about nearby, creative & curious, or friends & community). The mix only
weights the table: every side always keeps rest, gentle movement, making and
people. Type size and the write-in line are derived from the trim and reported
in the mix's help line (a 6 x 9 prints at 16-17 pt, a letter page at 20 pt;
nothing is ever set below 14 pt, and no activity runs past two lines). A 5 x 8
trim is too small for twelve rows at large print, and the form says so.

Two stacked six-item tables rather than a literal 6 x 6 grid: 36 cells would
each need a morning and an afternoon squeezed in, and a reader finds a result
faster by looking up one roll at a time.

Every morning meets every afternoon, so nobody checks the 36 pairings one by
one; every activity is held to one shape instead (AI content,
`services/studio_roll_a_day_service.py`): about half a day or less and
complete on its own (no whole-day plan, trip away or overnight; nothing that
finishes or continues the other half); no mealtime and nothing of the evening
on either side; nothing of the afternoon in a morning (a nap) and nothing
needing an early start in an afternoon (sunrise, breakfast); nothing
strenuous, and no car, golf course, beach or big budget assumed. No two
activities on a page share a word of substance (who and where aside: "a
friend", "at home"), so no day does the same thing twice. Idea shape, safety
and meaning-level repeats reuse the Bucket List's gates: one verb-led action,
nothing vague ("Try a new hobby"), sensitive, branded, or assuming a spouse,
grandchildren or a house.

Variety is structural: each side takes six different kinds of activity (rest,
gentle movement, making and people always; two of learning, local outings,
home and play, the mix's first), and every activity gets its own facet and
flavour (free, at home, with a friend, on foot or by bus...), shuffled by seed.
A reply is accepted as one set, sides alternating so each side's first briefs
win a clash over spares; a side short after the checks is topped up alone. An
activity that repeats one already in the book (read back from its pages), in
this seller's recent tables for the mix (browser) or in the worker's memory is
dropped, so two tables in one book never share an activity. All bounded, never
a comparison with every table ever made.

Quality gate: a preflight re-proves die faces 1 to 6 on each side, every
activity valid for its half of the day and set as written within its lines, at
least five kinds per side, no two activities alike, the tables inside the
printable area, and large print and dice large enough to count. Black ink
only. If the table cannot be made whole, the page says so plainly.
Pages: 1 · Answer key: no · AI content: yes

### 52 Weeks of Firsts: Retirement Edition (`weeks-of-firsts`)
A year-long "try something new" challenge built for retirement books. Fifty-two
numbered weeks, each a framed card: "Week 12" and a "Date:" line across the
top, one concrete new thing to try ("Cook a Thai green curry from scratch",
"Learn to recognise one bird by its song"), then ruled lines for notes on what
happened. The weeks are numbered, not dated, so a reader can start in any week
of the year; the first page opens with "I began my year of firsts on: ____".
There is no right answer and no answer page.

Settings: the mix (a bit of everything, close to home & low-cost, out & about,
creative & curious, or friends & community) and the writing space
(comfortable or roomy). The mix only weights the year: every area always
appears. Weeks per page (at most three), type size and line count are derived
from the trim and the writing space and reported in the writing space's help
line: comfortable prints two weeks per page on every common KDP trim (15-18 pt,
at least five writing lines each, about 27 pages); roomy gives every week a
page of its own (at least nine lines, 52 pages). Nothing is set below 14 pt,
writing lines are at least 0.36" apart, the date line at least 1.25" long.
Fewer weeks per page always win over smaller type. A card never splits across
pages, every later page holds its weeks at the same positions, and the space a
page cannot fill with a whole card becomes a "Firsts I'm Looking Forward To"
box on the first page (or a line or two more for each week there) and a
"Looking Back on My Year of Firsts" box on the last (favourite first, one to do
again, what to try next).

Every idea is held to the Bucket List's gates (AI content,
`services/studio_weeks_of_firsts_service.py`): one verb-led action, nothing
vague, doubled up, sensitive, branded, or assuming a spouse, grandchildren, a
house or a car, with a roomier line (3-12 words, at most 60 characters). On
top: nothing tied to a season, month, holiday or date, since week 1 may fall at
any time of year; nothing that sounds like an order or a test ("must",
"challenge yourself", "face your fears"); and something concrete must be left
once the "never tried before" padding is set aside ("Visit a place you've never
been" is too vague). Repeats are caught in meaning with that padding ignored,
so "Take a painting class" and "Try painting for the first time" are one idea,
while two firsts are not alike merely for both being "never tried".

Variety is structural: the year is spread over eighteen areas (cooking at home,
tasting out, exploring nearby, nature, growing, making, pictures, reading and
writing, music, learning, friends, kindness, culture, slow pleasures, games,
gentle movement, small adventures, home projects), two to four weeks each, the
mix raising four areas to four. Every idea gets its own facet and flavour (free,
at home, with a friend, on foot or by bus...), shuffled by seed, and areas are
written in concurrent batches. The browser picks the printed 52 from the pool
(spares for its own checks): each area its share, spares borrowed round robin
but never past five weeks of anything, at least fourteen areas, and bigger
outings (far travel, strenuous or costly ideas) capped at four a year. The
year is then put in reading order by seed: no area within three weeks of
itself, no two weeks of the same kind (food, outings...) back to back where
avoidable, bigger outings apart and out of the first four weeks, the heavier
areas spread across the whole year. An idea that repeats one already in the
book (read back from its pages, e.g. a second year of firsts), in this seller's
recent years for the mix (browser) or in the worker's memory is dropped. All
bounded, never a comparison with every year ever made.

Quality gate: a preflight re-proves exactly 52 weeks numbered 1 to 52 in page
order, every idea printable, distinct and set as written within its card, the
area and bigger-outing caps, no area two weeks running, every card whole and
inside the printable area with at least the chosen writing lines, and large
print, line spacing and date line at their minimums. Black ink only (writing
lines a mid grey). If a whole, balanced year cannot be made, the page says so
plainly.
Pages: about 27 (comfortable) or 52 (roomy) · Answer key: no · AI content: yes

### Travel Wish Map: Retirement Edition (`travel-wish-map`)
A travel wish list to dream over. The reader browses a checklist of
destinations, checks the ones they would love to see someday, and writes a
few words on the "Why I want to go:" line beside each. Every entry is a
pen-sized checkbox, the destination in bold on one line, and two or three
writing lines. It is about wishes, not trip planning: no itineraries,
budgets, bookings, visas or safety advice, and nothing that dates the page.
There is no right answer and no answer page.

Settings: destinations and room to write. Destinations are:
- *U.S. states* (default): all 50 states, alphabetical under the Census
  Bureau's four regions (Northeast, Midwest, South, West).
- *World regions*: 25 broad areas that do not overlap, such as the British
  Isles, the Nordic Countries, Southeast Asia and the Pacific Islands, under
  five continent headings.
- *Countries of the world*: 30 countries dealt from a pool of about 100,
  with a fixed share per continent (9 Europe, 7 Americas, 7 Asia & the
  Middle East, 4 Africa, 3 Oceania), alphabetical within each.
- *Kinds of places, near or far*: 24 places anyone can wish for, wherever
  they live and however they travel. Four each under Nature & the Outdoors,
  By the Water, Towns & Cities, History & Culture, People & Memories ("My
  hometown", "Where an old friend lives") and Close to Home ("A day trip by
  train or bus", "A café with a view").

Room to write is two lines per place (default) or three. The number of
destinations, entries per page, type size, checkbox size and line spacing
are not settings. The help line reports what the trim prints ("50 states
under 4 regions — 9 pages in 16 pt large print" on a 6 x 9).

Destinations (no AI, `utils/studio/travel-wish-map/data.ts`): every name is
bundled, fixed geography. A name that is not in the data under its own
heading never prints. States and regions always print complete. Countries
and kinds of places are dealt by seed. Names this book's earlier lists
already print go last (read back from the pages' content labels), then this
seller's recent lists (browser, about two lists' worth), then everything
else. So a second country list in a book shares no country with the first
while the pool lasts, and no list repeats a name within itself. Fixed lists
are never "avoided": a state is a fact, not a duplicate. The country pool
holds sovereign states under their UN geoscheme continent. It leaves out
disputed names and countries mostly seen in the news rather than in travel
sections, and never a country that shares its name with a U.S. state.

Page: one column. A bold heading with a rule starts only where its first
entry fits. It is repeated as "(continued)" (or "(cont.)") at the top of the
next page when a group runs over, and never leaves one entry alone there.
Every page keeps the title; only the first carries the how-to. Names are
16 pt (18 pt on a 5.5 in or wider column), never below 14 pt, and always
on one line: the type steps down only as far as the longest name the mode
could print needs. "Why I want to go:" is 2 pt smaller (never below 14 pt).
Writing lines are at least 0.38 in apart. Where the last page has room for
two to four, the list closes with "More Places on My List": write-in entries
with a line for the place and the same writing lines, never on a page of
their own. No map is drawn. A real map is either too small to write on or
borrowed artwork, and the headings already say where each place is.

Quality gate: a preflight re-proves the list against the data (every name
real and under its own heading, no repeats, fixed lists complete, sampled
headings full). It also checks that the pages print that exact list in
order, every name fits its line, no heading is cut off from its entries,
write-ins come last, every page is inside the printable area, and the type,
boxes, line spacing and the line after the label are at their minimums.
Black ink only (writing lines a mid grey). If the page is too small, it
says so plainly.
Pages: 5-17 (by trim, destinations and writing space) · Answer key: no · AI content: no

### Who Knows the Retiree Best? (`who-knows-retiree-best`)
A warm party game for retirement books, farewells and family celebrations.
Coworkers, friends or family each answer the same twelve light questions
about the retiree ("What was the very first job they were ever paid to do?",
"Tea, coffee or hot chocolate: which would they pick first?", "What do they
always say when a plan goes sideways?"), guessing what the retiree would say.
Then the retiree reads out the real answers, players tick every match (close
enough counts, and the retiree has the final say), and the scores show who
knows them best. It is a social guessing game, not a questionnaire: nothing
about the retiree is known or invented, and there is no answer page.

The pages: one answer sheet per player, then the retiree's sheet. A player's
sheet opens with a "Player:" line and closes with "Score: ___ out of 12".
Every question is numbered, in large print, followed by the room its answer
needs (a short line for a word, a name or a time; a full line for a phrase;
two lines for a saying or a story) and a box to tick when it matches. The
retiree's sheet ("Linda's Real Answers", or "The Real Answers") prints the
same twelve questions with room to write the real answers, and closes with a
scoreboard (a row per player, then "Who knows Linda best? ___") when more than
one person plays. Every sheet starts on a new page, so sheets can be handed
round.

Settings: the retiree's name (optional), who is playing and how many.
- *Name*: a first name or nickname, printed only in the headings and
  instructions ("Who Knows Linda Best?", "you think Linda would give"). It is
  never sent to the AI. Blank means "the retiree". A heading the seller typed
  is kept as typed.
- *Who's playing*: friends, family & coworkers (default), coworkers (more
  workday routines, desk habits and what they're known for at work), or
  friends & family (no office questions).
- *Players*: 1 to 6 (default 2). Each gets their own answer sheet with the
  same questions, so scores compare.
Number of questions, topics, tone, answer space, type size and questions per
page are not settings. The players' help line reports what the trim prints
("Each of 2 players gets a 3-page answer sheet, then the real answers and
scoreboard take 3 pages — about 9 pages in 18 pt large print" on a 6 x 9).

Every question is gated in the API and again in the browser (AI content,
`services/studio_who_knows_best_service.py`): one sentence ending in a single
question mark, 4-16 words and at most 80 characters, about the retiree as
they/their/them (never a name, "he" or "she") and never addressing the player
as "you". A question is dropped if it is too broad to guess ("What do they
enjoy?") or touches age, health, weight, money, relationships, family
assumed (a partner, children, grandchildren), politics, religion, alcohol,
gambling, anything embarrassing or secret, or security-question details
(a first pet's name, a street, an account). Quotations, brands and
celebrities are dropped too. A question that asks for a saying, advice or a
story always gets two answer lines, whatever the model suggested.

Repeats are caught in meaning: question words and padding ("favourite",
"usually", "most likely") are set aside, synonyms folded (coffee and tea are
one drink; job, career and office one working life; paid and pay one word),
and the Bucket List's meaning test is applied with the model's own concept
name. So "What was their first job?" and "Where did they work first?" are one
question. A question that repeats one already in the book (read back from
its pages), this seller's recent sets for the audience (browser) or the
worker's memory is dropped. All bounded, never a comparison with every set
ever made.

Variety is structural. Every question gets its own brief: a topic, one of its
facets and a question shape (a past detail, a habit, a pick between named
options, a number or time, a prediction, something they are known for, one
specific pick), sampled by seed from 17 topics and about 190 facets. A set
plans twelve different topics (audience-weighted, capped per group, always
retirement plans) plus eight spares. The browser picks the printed twelve:
at least nine topics, a topic twice only on two different details, no more
than two food, travel or career questions and three office ones, no shape
more than three times, "favourite" at most twice, no three questions opening
with the same two words, and always one about the future. It then orders
them by seed: a quick question first, retirement plans last, and no two
neighbours from the same group of topics, opening or shape where avoidable.

Page: one column, at most 6.5 in wide. The type size comes from the trim: 18
pt down to 15 pt while a typical question opens on one line, 15 pt with a line
more of wrapping on the narrowest trims, 14 pt only as a floor. Answer lines
are at least 0.38 in apart, short lines at least 1.75 in, tick boxes at least
0.24 in. A question never splits from its lines, and a question that would
need more than three lines is passed over for a spare. Each sheet takes as
many pages as it needs, with questions spread evenly (the first page, which
carries the how-to, often a little lighter) and one gap between blocks,
widened where every page has room. The scoreboard sits under the last
question when that saves a page, otherwise on a page of its own.

Quality gate: a preflight re-proves the set (twelve questions numbered 1-12,
every one printable, sized for its answer and distinct, every set rule held)
and every sheet (all twelve in order, name and score lines on a player's
sheet, a scoreboard for more than one player, nothing overlapping or past
the printable area, and type, line spacing, boxes and lines at their
minimums). Black ink only (writing lines a mid grey). If a whole, balanced
set cannot be made, or the page is too small, the page says so plainly.
Pages: 2-4 per player plus 2-4 for the real answers (by trim and players) · Answer key: no (the retiree writes the real answers) · AI content: yes

### Two Truths and a Fib: Retirement Edition (`two-truths-and-a-fib`)
A light factual challenge built for retirement books. Each numbered set has a
short title ("Early Telephones") and three lettered statements on that one
topic. Two are true and one is a fib, and the reader circles the fib's letter.
The answer page shows the same sets under the same numbers and letters, with
the fib's letter ringed and a one-sentence correction below it ("A is the fib.
The first telephone directory was printed in New Haven, Connecticut, in
1878."). Nothing on the page depends on colour.

Settings: the subject and the level. Subject is this game's own list, not the
shared retirement themes, because a fact puzzle needs a field of knowledge
rather than a lifestyle mood. The default, mixed, draws each set from a
different subject pool. The other choices are work & careers, inventions &
everyday technology, home life through the decades, hobbies & pastimes, travel
& transport, retirement traditions & customs, food & the kitchen, nature & the
outdoors, or a subject the seller types. Level is Gentle (familiar facts),
Classic or Challenging (surprising facts). Sets per page (at most three) and
type size come from the trim, and the subject's help line reports the result:
a 5 x 8 prints one set at 16 pt, a 6 x 9 two at 17 pt and an 8.5 x 11 three at
16 pt. Statements never go below 15 pt or past three lines. Each set gets a
line budget sized from a typical statement, and a set that needs more lines is
skipped for the next one. The plan only stands if the answer page, with its
corrections, fits as well.

Truth is checked before anything prints. The service writes each set as two
truths, a fib and a correction. The fib is its own field, never an index, so
reordering can't point the key at a true statement. A second, blind fact-check
call then judges every statement without being told which one is the fib
(statements are shuffled within each set), and judges every correction as a
standalone claim. A set survives only when the checker independently reads it
as true / true / false, with the false one where the writer put the fib, calls
the correction true, and finds the set coherent, the fib believable and the
content suitable. An "unsure" anywhere drops the set. If the check can't run,
no puzzles are returned. `STUDIO_FACT_CHECK_MODEL` can point the check at a
stronger model. Before that, every statement must be one plain, standalone
sentence. It is refused if it uses an absolute or superlative ("never",
"only", "the largest"), a hedge or approximate number ("reportedly",
"about 30"), time-sensitive wording ("today", "still") or a year after 2010.
It is also refused if it starts with a pronoun leaning on another statement,
addresses the reader, or touches a sensitive topic, a brand or a celebrity.
The three statements must be of similar length, and the correction must be
about the fib. The browser checks the same rules again and refuses any set
without the service's `verified` mark.

Variety is structural. Each set gets its own brief, a subject domain and an
angle sampled by seed from about 100 domains and a dozen angles. Repeats are
compared on content words, with synonyms folded ("existed before" / "invented
earlier than"). A set that repeats any statement or title is dropped if it
matches something already in the book (read back from the pages), something
this browser printed recently for the subject, or the server's recent memory
for the seller. Fib letters are dealt from a shuffled A-B-C deck for each
page, so three sets on a page never share a fib letter.
Pages: 1 · Answer key: yes (rings the fib, prints a correction) · AI content: yes

### What Kind of Retiree Are You? (`what-kind-of-retiree`)
A lighthearted scored personality quiz built for retirement books. Each
numbered question is a relatable retirement moment ("It's a free Tuesday with
nothing planned. What sounds best?") with four lettered answers, one for each
retirement style: The Explorer, The Tinkerer, The Social Butterfly and The
Professional Napper. The reader circles the letter of the answer most like
them. The pages after the quiz score it. A scoring grid has one row per
question and one column per style, each column headed by an outline symbol
(star, diamond, circle, square) and the style's name when the column can hold
it. Each cell shows the letter that scores for that style, so the reader rings
the letter they chose in every row, counts each column into the box at its
foot, and the highest column is their style. A tie reads as a blend ("read
every style that tied"). A write-up for each style follows, headed by its
symbol and name, then a "just for fun" line. Nothing depends on colour, and
there is no answer page.

Settings: the theme only (the shared retirement picker; its default gives every
question its own retirement topic). Everything else is derived from the trim
and reported in the theme's help line: 8 to 10 questions (as many as fill the
last quiz page), questions per page (at most five), type size, and whether the
grid and write-ups share a page. Comfortable type (15 pt and up) is tried
first, and the 14 pt floor only when no comfortable size fits within four quiz
pages. A 6 x 9 prints 9 questions on 3 pages at about 15 pt, then a scoring
page and a results page; a 5 x 8 prints 8 questions on 4 pages. Each question
reserves a line budget sized from typical text; when a batch runs long, the
quiz is re-planned from its own line counts rather than refused.

Scoring is fair by construction. Every question has exactly one answer per
style, each worth one circle, so no style can win on structure. Letters are
dealt from a Latin square over every run of four questions, so each style sits
at each letter equally often (never more than one apart), and the grid is
built from the same placed record as the question page, so the two cannot
disagree. The service writes every answer into its style's own field, then a
blind second call sorts each question's answers into styles without being told
which is which. A question survives only when that sort matches exactly and
the checker calls it clear, balanced (no answer the obvious "right" one, none a
put-down) and suitable. The four write-ups are checked the same way; a
write-up that fails is replaced by a vetted fallback, so every style always has
one. If the check cannot run, no questions are returned. Before that, every
question must be one or two short sentences ending in a single question mark,
and every answer a short phrase (at most 7 words, 36 characters) of similar
length to its siblings. Text is refused if it names a style ("explore",
"napper"), uses a put-down ("lazy", "boring"), assumes a spouse,
grandchildren, wealth, a house or an office career, or touches a sensitive
topic, a brand or a celebrity. The browser checks the same rules again, and the
two word lists are held identical by a test.

Variety is structural. Each question gets its own brief, a retirement topic and
a question shape sampled by seed from about 50 topics and 18 shapes. Repeats
are compared on content words. Within one quiz no two questions share a topic
or say the same thing, the same style's answers may not repeat each other, and
no word may carry one style's answers more than twice. A question that repeats
one already in the book (read back from the pages), one this browser printed
recently for the theme, or the server's recent memory for the seller is
dropped.
Pages: 4-6 (quiz pages, then scoring and results) · Answer key: no · AI content: yes

### Fill-in Funnies: Retirement Edition (`fill-in-funnies`)
A laugh-out-loud word game built for retirement books, parties and couples. It
runs in two steps on separate pages, so the story cannot give the game away.
**Step 1: Your Words** is a numbered list of prompts, each with a plain-language
label, a short example in italics and a writing line: "Describing word — like
“fluffy”", "Coworker’s name — real or made up", "Verb ending in -ing — like
“juggling”". **Step 2: Your Story** is a short, original retirement story ("The
Great Garage Tidy-Up", "Postcard From Paradise") with a numbered writing line
for each blank. The reader copies word 3 onto blank 3, then reads the result
aloud. A number can come back later in the story as a callback (the same
friend's name twice). The page ends with "The End — now read it out loud!".
Nothing depends on colour, and there is no answer page.

Settings: the theme only (the shared retirement picker; its default lets every
story pick its own situation). Story length, number of blanks, kinds of word,
type size, list columns, blank width, and whether the story needs a second page
are not settings. The page derives them from the trim, and the theme's help
line reports what came out. A 6 x 9 prints the word list at 17-18 pt and a
one-page story at 14 pt or larger. On a 5 x 8 a long story can continue onto a
second story page rather than dropping below 14 pt. When it does, the page turns
between paragraphs where it can and always carries at least four lines over.
Hints and blank numbers never go below 11 pt, writing lines never get shorter
than 1.25 in on the list or 1.1 in in the story, and the word list is sized for
every kind of prompt so every activity in a run matches.

Both pages are balanced for print. The word list is centred across the page,
even on a wide trim where the writing lines stop short of the column. On a
large trim a short story does not sit in the top half: up to half the spare
height opens up the line spacing (more room to write above each blank), and the
rest is split so the block sits at the optical centre, a little above the true
middle. A continued story keeps the same line spacing on its second page, which
starts at the top. Straight quotes and apostrophes in a story print as curly
book quotes (“…”, ’).

Every story is checked before it prints. The service asks for 8-10 blanks and
about 100 words in two to five short paragraphs with a title. Blanks are written
[1], [2] … in order of first appearance, one kind per number from a fixed list
of 21 kinds (noun, plural noun, verb, -ing verb, past-tense verb, describing
word, -ly word, place, food, animal, household object, item of clothing,
vehicle, job title, hobby, coworker's name, friend's name, number, silly sound,
exclamation, silly word). The labels and hints printed on the list are the same
text the writer is given, and a test keeps the two identical. A story is refused
if:
- a number is out of order, unused, has no kind, or is glued inside a word;
- "a" or "an" sits before a blank (the reader's word may start with a vowel);
- an article sits before a place or a name;
- it has more than two callbacks;
- one kind appears more than three times, or it uses fewer than six kinds
  (so the list is never "Noun 1 … Noun 5");
- a sentence or paragraph runs long;
- it touches a sensitive topic (health, ageing, memory, money worries,
  loneliness, death, politics, religion, alcohol, gambling), uses crude humour,
  or names a brand, a celebrity, or a commercial fill-in-the-blank game.

A blind second call then reads each story with its blanks unlabelled. It lists
every word class that would read naturally at each blank, and a story survives
only when every blank's kind fits. The same call also has to find the story
complete (clear beginning and ending), funny (blanks on the punchlines) and
suitable. If the check cannot run, no story is returned. The browser checks the
same rules again, refuses any story without the service's `verified` mark, and
the preflight proves every prompt has its blank before the pages are drawn.

Variety comes from structure, not a bank of stories. Each story gets its own
brief, sampled by seed: a situation (about 65: the retirement speech, a chaotic
cruise, a pottery class, the neighbourhood bake-off…), a format (about 20: a
diary entry, a postcard, sports commentary, a recipe, a voicemail…), a humour
pattern and a suggested mix of blank kinds. Repeats are caught on content words:
the same title, most of the story's words shared, or the same opening. So "On my
first day of retirement" does not come back as "On my second day". A new story
is checked against every Fill-in Funnies story already in the book (read back
from the pages), what this browser printed recently for the theme, and the
server's recent memory for the seller. One that repeats any of them is dropped.
Pages: 2 (3 when a small trim continues the story) · Answer key: no · AI content: yes

### Retirement Riddles & Jokes (`riddles-and-jokes`)
A light, browsable humour page built for retirement books. Each numbered item
is a short riddle ("I have a trunk but never pack for a holiday. What am I?")
or a clean joke ("Where do retired train drivers go on holiday?"). The reader
guesses the answer, then checks the answer page, where every answer is printed
in bold under the same number as its question ("Anywhere with a good track
record."). Riddles and jokes alternate down the page. A light rule separates
the items, and nothing depends on colour.

Answers go on the answer page rather than upside down under each item. The
answer page follows the book's own solutions setting (after the game or at the
back), stays tied to its game when pages are reordered, and keeps every
punchline out of sight until the reader turns to it. Upside-down answers would
also have halved what a large-print page holds. The puzzle page carries no
answer text at all, not even hidden. The answer page is drawn from the same
records as the puzzle page, so an answer can only print under its own number.

Settings: the theme (the shared retirement picker; its default gives every item
its own retirement topic) and the mix (riddles and jokes, riddles only, or
jokes only). Items per page and type size are not settings. The page aims for
about eight but never squeezes: it first looks for at least six at a
comfortable 16 pt or more, and only drops toward the 15 pt floor when a trim
cannot hold that. The theme's help line reports the result: a 5 x 8 prints six
at 16 pt, a 5.5 x 8.5 seven at 17 pt, a 6 x 9 eight at 17 pt, and a 7 x 10 or
8.5 x 11 eight at 18 pt. A setup never runs past three lines and an answer
never past two. The page reserves a line budget sized from a typical setup, and
an item that would overrun it is skipped for the next one. The plan only stands
if the answer page fits too.

Every item is checked before it prints. The service writes each item with its
kind, a short comic idea, the setup and the answer. A blind second call is then
shown every setup with the answers shuffled apart and lettered, and has to match
each setup back to its own answer. It also rates each pair: clear, a real payoff
(a pun, a twist, not a flat statement or something too obvious), one answer only,
fresh (not a well-known joke or riddle, catchphrase or quotation, even lightly
reworded) and suitable. An item survives only when the match comes back right
and every rating passes. An answer picked for two setups fails both. If the
check cannot run, nothing is returned. Before that, a setup must be one or two
short sentences ending in a single question mark, and an answer a short phrase or
sentence with no question in it. A riddle's answer is at most eight words and
never already sits in its own setup. Items are refused for:
- labels, numbering, quotation marks or knock-knock jokes;
- humour about age, memory or forgetting, health, bodies, money or pensions,
  spouses, loneliness, death, politics, religion, alcohol or gambling;
- brands or celebrities.

The browser checks the same rules again, refuses any item without the service's
`verified` mark, and a test keeps both sides' word lists identical.

Variety comes from structure, not a bank of jokes. Each item gets its own
brief, sampled by seed: a kind, a retirement topic (about 70: naps, the old
alarm clock, golf, the vegetable garden, a cruise, the office printer…), a
format (about 20: "What do you call…", "I… What am I?", "What's the difference
between…") and a humour pattern (a double meaning, a phrase taken literally, a
gentle reversal of work habits…). Repeats are caught on content words. Function
words, joke-frame words ("what do you call") and the retirement words every
item shares are dropped, and synonyms are folded ("throw away" / "get rid of",
"nap" / "snooze"). So "Why did the retiree throw away the alarm clock?" and "Why
did the retired man get rid of his alarm clock?" count as one joke, and two
riddles answered "The alarm clock." and "Your old alarm clock!" count as one
answer. No more than two setups on a page open with the same three words. A new
item is checked against every setup and answer already in the book (read back
from both its pages), what this browser printed recently for the theme, and the
server's recent memory for the seller. One that repeats any of them is dropped.
Pages: 1 · Answer key: yes (each answer in bold under its question's number) · AI content: yes

### Price Check: Then & Now (`price-check`)
A nostalgic guessing game built for retirement books. Each numbered question
names an everyday item, its quantity and a year ("In 1975, about how much did a
gallon of regular gasoline cost in the U.S.?"), with four lettered prices under
it, cheapest first. The reader circles the letter of their best guess, and the
instruction invites them to compare it with what they pay today. The answer
page sets every question again exactly as printed, with a ring round the right
letter only and an italic line beneath saying what the figure is ("About
57¢ a gallon (U.S. average)"). The year is in the question, so the line leaves
it out. A light rule separates the answers too. Questions run
oldest first, so a page reads as a walk through the decades. Nothing depends on
colour.

Prices are never written by a model. Every figure comes from a bundled dataset
(`utils/studio/price-check/data.ts`) that `scripts/build-price-check-data.py`
builds from published U.S. sources: BLS average prices (U.S. city average, the
mean of twelve months — a year missing a month is left out), the EIA's annual
regular-gasoline averages (leaded to 1975, unleaded from 1976), the theatre
owners' annual average ticket price (1989 left out as a method break) and the
USPS first-class letter rate (a year counts only when one rate held for at
least 350 days). About 400 facts across nineteen items, 1950 to 2000, all
nominal U.S. dollars — never inflation-adjusted, never converted. Each series
is one item in one unit ("a pound of white bread", "a half-gallon of whole
milk"), so a question never mixes units. National averages are asked with
"about" or "average"; the postage rate, which was exact, is asked plainly.
Seasonal or thin series (navel oranges) are rejected by the build. There is no
"now" price: a modern figure would go stale in print.

Settings: the level only. Gentle spaces the four prices well apart; Classic
sets them closer. Country, years, items, questions per page and type size are
not settings. The page walks 1950 to 2000 by itself — the 1950s and 1960s only
have stamps, gasoline and the movies to ask about, so a decade picker would
print one question five times. The level's help line reports what the trim
holds: a 5 x 8 prints three at 17 pt, a 6 x 9 five at 17 pt, a 7 x 10 six at
16 pt and an 8.5 x 11 six at 18 pt. The answer page is the taller of the two
(each answer adds its fact line), so it sets the count. Type never goes below
15 pt (the fact line sits a step smaller, never below 13 pt), a question never
runs past three lines and a fact line never past two, broken only before its
"(U.S. average)" part. Prices sit four across, or two by two on a narrow
column.

Choices are built from the true price, never picked at random. The other three
step down and up from it by a ratio drawn per step (Gentle about 1.5–1.85×,
Classic about 1.3–1.5×), and never less than two cents apart. They are refused
if any two sit too close to tell apart once rounded. All four share one style:
all in cents, or all in dollars once any reaches a dollar, so the answer never
stands out by its format. Answer letters come off a shuffled A–D deck for each
page; a 3¢ stamp that has no room for cheaper choices takes the next letter it
can use. Every question is re-proved from its fact before it prints: the price
is the dataset's, it appears exactly once among the choices at the right
letter, and the fact line under the ring names that price and unit.

Variety comes from the item, the year and the decade, never from rewording.
Each pick goes to the decade the page has used least, then to the scarcest
decade, then to the item the book has asked about least. A page never asks
about one thing twice (the two milks and the two gasolines count as one). Each
question stamps its `item@year` identity on the page. A local, network-free
prefetch reads those identities back, so a new page never repeats a question
already in the book. It also avoids near-repeats (the same item within three
years, or at the same price) until a long book has used everything else.
Pages: 1 · Answer key: yes (each question again, right letter ringed, fact beneath) · AI content: no

### Office Relics (`office-relics`)
A nostalgic picture game built for retirement books. Each numbered card shows a
clean black line drawing of an office object from the 1940s to the 1990s (a
typewriter, rotary phone, punch clock, slide rule, carousel slide projector,
water cooler), with a writing line under it. The reader names each object. The
answer page sets the same pictures under the same numbers, with each name
written on its line and, beneath it in italics, the other names people use
("Also: Rolodex, Card file"), so a right answer is never marked wrong. Nothing
depends on colour.

Settings: the level only. Gentle deals the objects most people still know on
sight and adds a word bank (every answer on the page, alphabetised, in a framed
box under the grid). Classic mixes those with objects anyone who worked through
those years will remember. Challenging leans on rarer relics (mimeograph, memo
spike, punch card, switchboard). Pictures per page, picture size, line weight
and type size are not settings. The page derives them from the trim, and the
level's help line reports the result: a 5 x 8 prints four pictures (about 1.6 x
1.9 in), a 6 x 9 six (about 2.1 x 1.4 in) and an 8.5 x 11 nine (about 2.1 x 2.0
in). A grid is only used when every picture box is at least 1.4 x 1.05 in, and a
comfortable 1.7 x 1.25 in is tried first. Every page of a run is pinned to the
same grid and pen. The answer page must fit too. On a narrow card a long name
("Overhead projector") may take two lines on the key, and the writing room
above every line is then sized for two, which also gives the reader more room.

The pictures are not output from an image model, and they are not clip art or
stock art. Each is an original vector drawing written as code for this game
(`utils/studio/office-relics/drawings.ts`) from plain geometry: outlines at two ink weights, no shading, no text, no logos, no maker's
shape or model detail, and the whole object in view. Each drawing leads with the
cue that separates it from its nearest lookalike: the handset on a fax, the card
slot and card rack on a punch clock, the fanned cards on a rotary card file.
Pictures are framed on their measured ink, so a drawing is centred and sized by
what the reader sees, and they export as the same vectors they are on screen.

Every seller prints their own pictures. Each drawing has a few knobs that change
how the object is built, never the cue that names it: three drawers or four,
round keys or square, a dome or a wedge body, a bar, cup or knob handle, which
way it faces (only where handedness does not matter; a typewriter's return
lever and a dial's finger stop are never flipped). That gives 8 to 24 versions
of every object, 569 in all. Each picture's version is dealt from a stream keyed
by the seller's puzzle salt, the page seed and the object
(`utils/studio/office-relics/variants.ts`). Two sellers' pages share about a
quarter of their objects, since the catalog is the same, but only about 2.5% of
their pictures are the same drawing. The page fingerprint names each picture's
version. The browser also remembers which versions this seller printed lately
and passes over them, so one seller's books do not repeat each other either.
The page furniture is a per-account house style
(`utils/studio/office-relics/style.ts`, 36 looks): rounded or square
single-ruled card frames, numbers as "1." or "1)", the word-bank heading, and
one of three phrasings of the instruction. The style never changes the grid. The
plan is fitted to the tallest phrasing, so the form's note holds for every
seller.

Every page is checked before it prints. Each object in the catalog (about fifty)
has one printed answer (the kind of object, never a brand), its accepted
aliases, a tier, a category, a decade and its lookalike groups. Objects a reader
could confuse or name the same way (the two desk phones, the machines with two
reels, the projectors) share a group, and two from one group never share a page.
An alias may only be shared inside a group. A trade name that became the
everyday word ("Rolodex") may be accepted as an alias but is never the printed
answer. The preflight refuses a page with a missing or mismatched drawing, the
same object twice, a lookalike pair, more than two objects of one category, an
answer that does not fit its line, a word bank that does not list exactly the
page's answers, or pictures below the size floor. After drawing, a second check
proves every picture sits inside the page, clear of the other pictures and of
every writing line. A page that fails either check becomes a plain message,
never a broken sheet.

Within a page, variety comes from the catalog and the deal. Each pick goes to a category the page has used least, and no
decade fills more than half a page, so a page wanders the whole office. Each
picture stamps its object's id on the page. A local, network-free prefetch reads
those ids back, so a new page never shows an object already in the book; when a
book has shown every object, the form says so. The browser also remembers what
this seller printed recently, so the next book starts with different objects.
Pages: 1 · Answer key: yes (each name on its line under the same picture, other accepted names beneath) · AI content: no

### Work Lingo Match (`work-lingo-match`)
A nostalgic matching game built for retirement books: "how many of these
workplace phrases do you remember?". The page lists numbered office phrases
("Circle back", "Touch base", "Low-hanging fruit"), each with an empty box, and,
shuffled apart, their plain-English meanings under letters ("Return to the
topic later"). The reader writes each meaning's letter in its phrase's box, so
nothing is drawn across the page and a finished sheet stays clean. On a trim
wide enough for both lists they sit side by side like the two columns of a
classic matching exercise; on narrower trims they stack, phrases first, under
spaced-capital headings. The answer page sets every phrase again under the same
number, its letter in the box in bold and the exact meaning from the puzzle in
italics beneath it. Nothing depends on colour.

Settings: the level only. Gentle deals everyday office phrases nearly everyone
knows and holds at most eight pairs; Classic mixes familiar phrases with a few
to think about; Challenging reaches for less obvious but still widely used
business idioms (never niche industry jargon or new startup slang). Classic and
Challenging hold up to ten. Workplace area, pairs per page, type size and decoy
meanings are not settings: every page ranges across the office by itself, and a
decoy would add a second way for a meaning to fit. The level's help line
reports what the trim holds: a 5 x 8 prints five at 15 pt, a 5.5 x 8.5 six at
16 pt, a 6 x 9 seven at 16 pt, a 7 x 10 eight at 16 pt, and an 8.5 x 11 eight
at 18 pt (Gentle) or ten at 16 pt in two columns. Type never goes below 15 pt,
a phrase or meaning never runs past two lines, and the page never prints fewer
than five pairs. The instruction is one short line ("Match each phrase to its
meaning."). A second line would cost a 5 x 8 page one of its pairs. The plan
only stands if the answer page fits too.

Every pair is checked before it prints. The service writes each pair with a
workplace area, the phrase and its meaning. A blind second call is then shown
every phrase with the meanings shuffled apart and lettered, which is the puzzle
itself, and has to match each phrase back to its meaning. It also rates each
pair: a real, established expression (not invented, not an acronym, slogan or
one company's term), an accurate workplace meaning rather than a literal one,
the only meaning on the list that fits, familiar enough for the level, and
suitable. A pair survives only when the match comes back right and every rating
passes. A meaning picked for two phrases fails both. The pairs a response
returns were all checked together as one set: when the service tops up its
pool, it checks the whole pool again, and the browser never builds a page from
two responses. If the check cannot run, nothing is returned. Before that, a
phrase must be one to six plain words starting with a capital, and a meaning
three to ten words that never repeats a word of its own phrase. Pairs are
refused for:
- insensitive or offensive origins ("totem pole", "powwow", "grandfathered"),
  ageist phrases ("put out to pasture"), crude words, violence and death,
  health, religion, politics, alcohol and gambling;
- brands and trade names used as verbs ("Kool-Aid", "Xerox").

The browser checks the same rules again, refuses any pair without the service's
`verified` mark, and a test keeps both sides' word lists identical. The page is
drawn from the same fitted records on both sides: letters are a seeded shuffle
in which no meaning keeps its phrase's position, and the preflight re-proves
that each letter is used once and that every meaning prints exactly as written.

Variety comes from structure, not a bank of phrases. Each pair gets its own
brief, sampled by seed: one of twenty workplace areas (meetings, memos,
deadlines, sales, budgets, hiring, office politics…) and one of four eras (the
typewriter-and-memo years, the 1980s and 1990s corporate world, timeless idioms).
Repeats are caught on content words, with function words, pronouns, light verbs
("take", "put") and particles dropped and endings folded. So "Put it on the
back burner" and "Back burner" count as one phrase, and "Circling back" and
"Circle back" too. The same phrase with a reworded meaning is the same pair.
On one page, two phrases that share a word ("Circle back" / "Back burner")
never appear together, two meanings that share most of their words never do,
and no meaning may echo another pair's phrase. A new phrase is checked against
every phrase already in the book (read back from its pages), what this browser
printed recently at any level, and the server's recent memory for the seller.
One that repeats any of them is dropped.
Pages: 1 · Answer key: yes (each phrase's letter in its box, exact meaning beneath) · AI content: yes

### Occupation Trivia Pack (`occupation-trivia`)
A multiple-choice trivia pack built for retirement books that celebrate one
career. The seller picks an occupation (Teacher, Nurse, Police, Military,
Trucker, Engineer, Accountant or Postal) and gets about ten numbered questions
from the tools, terms, routines, traditions and history of that job ("What did
teachers write on the blackboard with?", "Which trailer keeps a load cold?").
Each question has four choices, lettered A to D, and every letter sits inside a
printed ring the reader circles. Short choices sit two by two, and longer ones
go one under another so they never wrap into small type. The instruction names
the job ("Teacher trivia: circle the letter of the best answer."). The pack runs
over as many quiz pages as it needs (at most four). Every page keeps the title,
only the first carries the instruction, and a small italic line says when the
pack continues. Pages are split so their question counts are as even as
possible (3 / 3 / 4, never 2 / 4 / 4). There is one answer page, listing every
number with its ringed letter, the answer in bold and a short italic note.
Nothing depends on colour.

The whole key is attached to the last quiz page, so the book adds exactly one
answer page, after the quiz or at the back as the book's solutions setting
says, and never between two quiz pages. The key is drawn from the same fitted
records as the quiz, so a letter or answer can only be the one printed beside
its own question. Regenerating the pack redraws both together.

Settings: the occupation and the level. Level is Gentle (what anyone in the job
knew), Classic or Challenging (for the long-serving professional, never exam
material). Question count, type size and pages are not settings. The largest
size from 18 pt down to 15 pt that fits a pack of ten within four pages is
chosen from the trim, and the level's help line reports it: a 5.5 x 8.5 prints
ten at 15 pt, a 6 x 9 ten at 16 pt, a 7 x 10 ten at 17 pt and an 8.5 x 11 ten
at 18 pt, each on up to four pages. Only a 5 x 8 drops to eight questions. A
question never runs past four lines and a choice never past two. The answer
page tries 16 pt down to 13 pt with notes at 12 pt or larger. If no size holds
the notes, it drops the notes and keeps every answer.

Occupations are profiles in `backend/app/data/studio/occupation-trivia/prompt.json`.
Each profile has its topic areas (eighteen per job), a care rule and its own
blocked words. Adding an occupation means adding a profile there, one value in
the schema and one line in `utils/studio/occupation-trivia/content.ts`. Tests
keep the three in step. The care rules keep each pack safe for its job:
- Nurse: history, equipment names and routines, never medical advice, doses or
  treatments.
- Police and Military: no weapons, tactics or operations. Military questions
  name the branch and country when a fact depends on one.
- Trucker: no current regulations.
- Accountant: no current tax law or advice.
- Engineer: no calculations.
- Teacher and Postal: broad enough for any country and decade.

Truth is checked before anything prints. The writer gives the right answer its
own field, never an index, so no shuffling can point the key at a wrong choice.
A blind second call then sees each question with its choices shuffled and has
to pick the right one itself. It also rates the question:
- a settled fact;
- about this job, not work in general;
- clear, naming the country or era when the answer depends on one;
- fairly pitched: no exam questions, calculations, current rules, prices or
  salaries;
- wrong choices that are believable but clearly wrong;
- suitable.
The checker also flags a question that asks the same fact as an earlier one,
and judges every answer-page note as a claim on its own. A question survives
only when the pick matches, every rating passes and its note is true. If the
check cannot run, nothing is returned. `STUDIO_FACT_CHECK_MODEL` can point the
check at a stronger model.

Before the check, each question has to pass these rules:
- one question ending in a single question mark;
- no negatives or superlatives ("not", "only", "best");
- nothing time-sensitive ("today", "currently"), no hedges, no year after 2010;
- never addresses the reader, and no "do you remember" framing;
- four distinct choices of similar length, none inside another, and never
  "all of the above";
- the answer is not already in the question;
- the note is about the question.
The browser checks the same rules again, refuses any question without the
service's `verified` mark, and a test keeps both sides' word lists identical.

Variety comes from structure, not a question bank. Each question gets its own
brief, sampled by seed: one of the job's topic areas and one of fourteen
question shapes. Repeats are caught on the fact, not the wording. Two
questions are the same when they have the same answer, the same topic, or most
of the same content words, with synonyms folded ("blackboard" / "chalkboard").
So "What tool did teachers use to write on chalkboards?" and "Which item was
used by teachers to write on a blackboard?" count as one question. Each
question stamps a label (`teacher: blackboard chalk = chalk`) on the page. A
new pack refuses any fact the book already asks for that occupation, anything
this browser printed recently for it, and anything in the server's recent
memory for the seller. Right answers are dealt from shuffled A to D decks, so
over ten questions each letter is right two or three times, and never three
times running.
Pages: 2-5 (quiz pages, then one answer page) · Answer key: yes (number, ringed letter, answer and a short note) · AI content: yes

---

## Spatial (7 games)

### Maze (`maze`)
A pencil maze with one entrance, one exit, and exactly one way through.
Difficulty sets how twisty the route is and how long the solution runs.
Pages: 1 · Answer key: yes (traces the path) · AI content: no

### Shaped Maze: Retirement Edition (`shaped-maze`)
A pencil maze built inside a retirement shape — a teapot, a motorhome, a sun
hat, a golf cart, a hammock between two trees — whose outline *is* the maze's
outer wall. Each page is a small journey: START at a workday place (the
Office, the Alarm Clock, Monday Morning, the Night Shift, the Shop Floor…),
FINISH somewhere the shape stands for (Tea Time, the Open Road, the Fairway,
the Beach). One entrance, one exit, exactly one way through.

Settings: shapes and a level.
- Shapes: A mix of everything, Home comforts, Travel & getaways, Garden &
  outdoors, or Hobbies & pastimes (7–10 shapes each). The help line names a few.
- Puzzle level: Gentle (paths 0.30–0.40 in), Classic (0.26–0.34 in) or
  Challenging (0.24–0.30 in, longer route, more turns). The help line reports
  the path widths, or says plainly when the trim in Settings is too small for
  that level and which lever to move.
Shape, drawing version, Start / Finish, grid size, wall weight and caption
size are not settings; each page deals its own.

The shapes: 33 silhouettes — most from the Studio's own retirement drawing
library (the one Stained Glass and Color by Number use), plus ones drawn for
the maze alone where the library's version is too fine for corridors (beach
chair, rocking chair) or missing (sun hat, cottage, tent, garden shed,
hammock, golf cart, fishing boat, pickleball paddle, chess knight, hiking
boot). Each has 16–36 versions (knobs and mirror images). Shapes whose outline
is a rectangle, a blob or several separate objects are left out on purpose.

How a page is built (all in the browser, no AI, no images):
- The shape's silhouette is laid over a grid of pencil-wide cells and each cell
  kept when the shape covers most of it; the outline is tidied (no one-cell
  bumps, no cells touching only at a corner, one piece, no speck holes).
- A faithful-likeness gate: the cells must overlap the true silhouette well,
  keep nearly all of it, not be a plain block and not be a fringe of spurs. If
  not, narrower corridors (never below the level's floor) are tried, then
  another shape.
- A perfect maze (spanning tree) is carved over exactly the shape's cells;
  cells outside keep all four walls, so the outline is solid wall except the
  two openings. Several mazes and opening pairs are scored against the level's
  route length and dead-end aims, as in the regular Maze.
- Openings only where the outline looks straight out at open page (never into
  a hole like a mug handle, never into a notch between two parts), far apart,
  with room for the arrow and a two-line caption (START / place name) clear of
  every wall and of each other.
- Drawn in pure black: a heavier outline with softened outer corners (inner
  corners stay square so no false gap can open), lighter inner walls merged
  into runs, solid arrows. No fills, greys or textures.

Quality gate (preflight): faithful shape, one piece, no pinches; START and
FINISH on the outline facing out; exactly one route and no other gap in the
outline; the key's route walks real corridors from START to FINISH; corridors
at least a quarter inch, walls heavy enough to print; captions apart; all
inside the safe area. A page that fails is rebuilt with another design; the
seller never gets a broken maze.

Answer key: the same maze with the route drawn through the corridors, taken
from the very maze the page printed (never re-solved), in black ink.

Variety: shape, version, Start, Finish, openings and the carve itself are all
dealt from the seller's puzzle salt and the page seed. Within a book, shapes
the book already holds wait their turn, a returning shape comes back as another
version, and Starts rotate so thirty pages visit thirty workdays (read back from
labels the book's pages carry). Across a seller's books, recently printed
shapes and versions are passed over first (a bounded per-browser history). The
page fingerprint uses a digest of the maze structure, so a duplicate page is
caught whatever surrounds it. Nothing compares against every page ever made.

Pages: 1 · Answer key: yes (traces the path) · AI content: no

### Stained Glass Coloring (`stained-glass`)
A relaxing coloring page: one retirement favorite — a rocking chair, a
teapot, a sailboat, a sunflower, a fishing rod — set in a stained-glass window
and surrounded by a mosaic of irregular pieces of glass. The reader looks at the
design and colors it in, piece by piece, however they like. It is not
paint-by-number and has no answer page.

Settings: a theme and a piece size.
- Theme: A mix of everything, Home comforts, Travel & getaways, Garden &
  outdoors, or Hobbies & pastimes. The help line names the theme's subjects.
- Piece size: Relaxed (big pieces, about an inch across), Classic, or
  Intricate (more, smaller pieces — still wider than a sixth of an inch). Sizes
  are absolute, so a bigger trim gets more pieces, never smaller ones; the help
  line reports roughly how many pieces the current trim holds.
Subject, window, border, background pattern, scenery, line weights and margins
are not settings; each page deals its own design.

Every page is drawn in the browser (no AI, no images): pure black vector lines
on white, no grey, no fills, no text inside the art. The subject is a stack of
closed shapes drawn for this game, printed with a heavy outline where it meets
the background and lighter lines between its own pieces, so it always reads
first. Large pieces of the subject are cut into a few cells; the background is
a Voronoi mosaic in one of six patterns (even, graded toward the subject,
concentric rings like a rose window, rays from the sun or from below, diamond
quarries like a leaded cottage window, honeycomb). Windows
are square, rounded, round-arched or pointed-arched, with a tiled, block-
cornered, plain or no border band. Outdoor subjects stand on hills, waves or
dunes, often under a corner sun; indoor subjects often sit in a radiating
medallion.

Quality gate: the finished lines are printed to a grid at 96 dpi and every
enclosed region is measured. A mosaic cell too small or too narrow for the level
is merged into its neighbour by removing the one joint it shares most edge
with; a piece of the drawing itself can never be smaller than about an eighth of
an inch across (the tests render every version of every subject at the smallest
print size to prove it). The page then passes a preflight — a real subject in a
real version, at least 42% of its window and 1.9 in across, 24–420 pieces, ink
coverage of a line drawing, not a design the book already has — and a drawn
check (black strokes at print weights only, inside the panel). A design that
fails is dropped and another dealt; if none passes, the page shows a plain
message instead of a broken panel.

Content: 36 original subjects across four themes — home comforts (rocking
chair, coffee mug, teacup, teapot, book and glasses, houseplant, yarn basket,
sleeping cat, vintage radio, fresh-baked pie), travel (sailboat, motorhome,
camper trailer, cruise ship, suitcase, hot air balloon, beach chair, lighthouse,
steam train), garden (watering can, potted flowers, birdhouse, garden tools,
wheelbarrow, sunflower, butterfly, songbird, picnic basket) and hobbies
(fishing, golf bag, bicycle, acoustic guitar, paint palette, vintage camera,
gramophone, binoculars). Each has two to four knobs (slat style, sail plan,
steam curls, window count…) and a mirror image: 16–36 versions each, 722 in
all. No brands, logos, characters, text, or anything about health, money or
frailty. Floating subjects (balloon, butterfly, songbird) hover over the
scenery; the rest stand on it.

Uniqueness: each panel is stamped `subject|version|composition|style`. A new
page takes the theme's least-used subject in the book (a subject returns only
once the theme is used up, and then as a new version in a new window), avoids
the previous page's window design, and passes over subjects and versions this
seller printed lately. Subject, version and composition are dealt from the
seller's puzzle salt, so two sellers on the same settings print different books.

Book style and page hand (`style.ts`): the subject library is shared, so the
same teapot in the same window would otherwise print the same picture for two
sellers. Each book is dealt a style from the seller's salt and its first page's
seed — pen (three print-safe line-weight sets), a favoured window, border and
background pattern, border band and tile proportions, rounded-corner radius,
how its subjects are drawn (a touch wider or narrower, a slight taper), how
much of the window they fill, and how finely they are cut. The style token is
stamped on every page and later pages adopt it, so a book reads as one set;
the seller's next book is dealt the style, of two dozen candidates, farthest
from the last dozen they printed (remembered in the browser; the tests hold
eight books in a row at least five of eleven axes apart). On top, every page
deals its own hand around the style: a little more or less stretch and taper,
fill, and a gentle tilt for things that fly (balloon, butterfly, songbird). A
page whose hand pinches a part below the coloring floor steps down to half
strength (proven for every version, pen and extreme at the smallest print size)
and then to the plain drawing; fill never takes a subject's longer side under
2.6 in, so small trims print as before. Measured on a ⅛-inch grid, two sellers'
pages with the same subject, version and window share about 40% of the subject's
outline (previously 100%) and about 40% of all ink; the tests hold both under 60%.
Pages: 1 · Answer key: no · AI content: no

### Quote Coloring Page (`quote-coloring`)
A coloring page built around one original retirement saying ("My calendar only
lists sunsets now") lettered in big outline letters, inside a cartouche, with a
decorative pattern of flowers, shapes or hobby-and-travel motifs round it. The
reader colors the letters, then the pattern. There is no answer page.

Settings: a theme, a mood, a pattern and a space size.
- Theme: the shared retirement theme picker (mixed topics by default, a preset
  theme, or the seller's own words).
- Mood: A mix of moods, Uplifting, Playful, or Calm & reflective.
- Pattern: A mix of patterns, Flowers & leaves, Shapes & tiles, or Hobbies &
  travel (teacups, sailboats, balloons, books, cameras, suitcases...).
- Coloring spaces: Relaxed (big spaces), Classic, or Detailed. Sizes are
  absolute, so a bigger trim gets more motifs, never smaller ones; the help line
  reports the motif sizes and the smallest space, or says when the trim is too
  small.
The saying, face, letter size, line breaks, layout, cartouche, frame, line
weights and margins are not settings; each page deals its own.

Sayings (AI content, `services/studio_quote_coloring_service.py`): the page asks
for eight, one per brief — a retirement topic (~90), a tone, a sentence form
(20) and a length band, shuffled by seed — so sayings differ in idea and
structure, not just wording. Gates before anything prints: 3–12 words, at most
56 characters (the page's budget), no word over 11 letters, plain letters and
ordinary punctuation only, no digits, quotation marks, attributions or ALL CAPS;
nothing about age, health, memory, death, money worries, loneliness, spouses,
alcohol, politics or religion; no brands or celebrities; no stock line from a
list of famous quotes, slogans and greeting-card phrases. Then a blind check:
a second call rates every saying cold — original (not a known quote, proverb,
slogan, lyric or title, even lightly reworded), natural and correctly spelled,
clear, warm, suitable, about retirement — and only sayings passing every rating
return, marked `verified`. The browser re-checks the shape and only letters
verified sayings. There is no bundled quote bank.

No repeats: sayings are compared on content words with synonyms folded ("tea" /
"coffee", "journey" / "travel"), so "Retirement means more time for what
matters" and "Retirement gives you more time for what really matters" are one
saying. Checked within a reply, against the book's own pages (every page stamps
its saying), against this seller's recent sayings for the theme (browser) and
the worker's memory — all bounded, never a comparison with every page ever
made. No more than two sayings in a reply open with the same two words.

Lettering (`lettering.ts`, `fonts.ts`): drawn from the bundled font files as
vector outlines — never a text box, which the PDF export would fill solid. Five
print-proven faces (Montserrat Bold, Rubik Bold, Galindo and Righteous in
capitals; Bitter Bold in mixed case). One glyph per character, straight from the
character map; a missing glyph refuses the saying. Overlapping contours inside a
font's letters are removed, so only each letter's true edge prints. Every pair
of letters is eased apart until clear paper separates their outlines. Lines
break only between words, balanced, never stranding a short word, and the
saying is set as big as its space allows (up to about 1.9 in em) but never below
the face's proven size, at which every letter's inside, counter and punctuation
mark clears the lettering floor (tested glyph by glyph at several sub-pixel
positions). A saying that cannot fit a face at that size tries another face,
then the next saying.

Page (`compose.ts`): a frame (single line, double band, or tiled band), the
lettering in a cartouche (rounded, oval, scalloped, double-lined or pill; or a
band right across the page), and the pattern in what is left: packed (biggest
spaces first, motifs a little smaller than their space, small plain fillers in
the gaps) or a lattice (square, hex or diamond grid, two motifs alternating,
completed by packing where the field cuts the grid off). Every motif keeps clear
paper from every other line, and nothing of the pattern enters the lettering's
space. The pattern always keeps at least a row of motifs above and below the
lettering. Small trims fall back to the band layout, a single-line frame and a
plain cartouche before giving up on a saying. When the pattern is "A mix", a
saying about gardens gets flowers and one about travel or hobbies gets those
motifs, while the book is not already ahead on that family.

Motifs (`motifs.ts`): 32 original motifs (flowers, leaves, swirls; rosettes,
stars, diamonds, hexagons, hearts; teacup, mug, sailboat, balloon, suitcase,
sun, fish, bird, butterfly, book, cottage, shell, camera, palette, cloud) plus
two plain fillers per family, each with a proven smallest radius at which every
version and turn clears each level's floor.

Quality gate: the whole page is printed to a grid at 96 dpi at its real line
weights and every enclosed region measured. A pattern region under the level's
floor takes its motif off the page; a lettering or frame region under its floor
refuses the design. Then a preflight: the lettering reads back exactly as the
saying, letter for letter; it is at least its face's proven size and clear of
the cartouche; no pattern line enters the lettering's space or leaves the frame;
no two motifs touch; ink coverage is that of line art; the book does not already
print the saying. The drawn panel must be black strokes at print weights only,
unfilled, inside the safe area. A failed design is dealt again; if nothing
passes, the page says so plainly.

Uniqueness and variety: each page stamps `saying|face|layout|cartouche|frame|
fill|pattern`. Every design axis takes the option the book has used least,
never the same cartouche or frame as the page before, and the lettering face
rotates; ties are broken by the seller's salt and the page seed, so two sellers
on the same settings print different pages.
Pages: 1 · Answer key: no · AI content: yes (sayings; lettering and pattern are drawn in the browser)

### Color by Number: Retirement Scenes (`color-by-number`)
A relaxing color-by-number page: a retirement scene — a rocking chair by a
curtained window, a motorhome parked in the hills, a sailboat at golden hour,
a beach chair under an umbrella — divided into numbered spaces, with a color
key of six to eight colors below it. The reader finds each number in the key
and colors its spaces to match. There is no answer page.

Settings: scenes, detail and the color key.
- Scenes: A mix of scenes, Cozy home, Travel & getaways, Garden & outdoors, or
  Hobbies & pastimes. The help line names the theme's subjects.
- Detail: Relaxed (fewer, bigger spaces; numbers at 12 pt), Classic, or
  Detailed (more spaces for a longer session). No number anywhere prints below
  9 pt; the help line reports the number size and the scene's size on this trim.
- Color key: Color names (black & white books, the default) — each entry is
  its number in a circle, an empty box to try the pencil in, and a plain color
  name ("Light Blue", "Dark Green"); or Color swatches (color-printed books) —
  the box is filled with the color and the name still prints, so the key reads
  either way. The page never relies on printed color to say which color is meant.
Subject, drawing version, mood, scene parts, frame, number of colors, line
weights and margins are not settings; each page deals its own.

Every page is drawn in the browser (no AI, no images): black vector lines on
white, nothing filled, plus the numbers. The subject is one of the Studio's 36
original retirement drawings (the stained-glass library: 722 versions), set in
a scene built round it from its setting: a meadow (far hills, mountains or a
ridge with optional snow, patchwork fields, a winding path, a fence, trees or a
bush, flowers), a shoreline (sea, wave bands, an island), a beach (sea, sand,
rolling dunes) or a room (wall, wainscoting and chair rail, a window with a view
and optional curtains, a framed picture, baseboard, floorboards, a rug, a table
with or without a scalloped cloth for things that sit on a table). Sun, sun
rays and clouds fill outdoor skies. Parts are sized in inches with floors, and a
part that cannot get its room is left out rather than squeezed in.

Colors (`palette.ts`): nine moods (summer, golden hour, spring, autumn,
seaside; cozy, sage, coastal and lavender rooms) give each part of the scene a
believable color (sky light blue, far hill green, curtains pink...), with a
family of second choices so touching parts never share a number. The subject's
own pieces take its natural colors by size (a teapot blue, a pie tan), with a
few drawing-order hints where size would mislead (steam and smoke pale, leaves
green, a sunflower's petals golden round a brown disk). The key is settled at
six to eight distinct colors, all used, listed in pencil-box order; a scene
that cannot be keyed that way is refused, never padded.

Spaces and numbers (`paint.ts`): the page is printed to a grid at 96 dpi at
its real line weights and every enclosed space measured. Each subject drawing
is measured alone first, and never printed smaller than the size at which every
one of its spaces holds a number. A space too small for a number loses the
stretch of scenery line that pinched it (a hill top grazing the subject), which
merges it into its neighbour; a sliver made by fixed lines refuses the design.
Each space's number sits at its deepest point (the centre of the largest circle
that fits) and its clearance is then re-measured exactly against every printed
line. Specks where lines meet at a sharp angle are ink, not spaces.

Quality gate (`kdp-preflight.ts`): a real subject in a real version, big enough
to be the picture and inside the frame; a key of six to eight distinct colors,
every one used and every space numbered from it; no two touching parts printed
with the same number; every number at its size with clear paper round it; a
sensible count of spaces for the level; no single space so large the page looks
unfinished; ink coverage of line art; and not a page — or the same subject in
nearly the same scene — the book already has. The drawn page must be black
strokes at print weights, unfilled, digits only in the scene, and a key that
matches the numbers. A failed design is dealt again; if nothing passes, the
page says so plainly.

Uniqueness and variety: each page stamps `subject|version|composition|mood`,
the composition recording what was actually drawn. A new page takes the
theme's least-used subject in the book (and not the previous page's setting
when it can), a version the book has not printed, the book's least-used mood
(never the previous page's), and a composition as far as possible from the page
before and from the subject's earlier pages (at least three scene details
apart). Recently printed subjects and versions of this seller wait their turn;
all choices are dealt from the seller's puzzle salt and the page seed, so two
sellers on the same settings print different pages. Every check is bounded by
one book and one seller's recent history.
Pages: 1 · Answer key: no · AI content: no

### Dot to Dot: Retirement Edition (`dot-to-dot`)
A relaxing dot-to-dot page: large numbered dots that, joined in order from 1
and back to 1, reveal a retirement picture — a teapot, a golf flag, a sailboat,
a hammock between two posts, a porch swing. Dot 1 is ringed and its number
bold, near the top left; the numbers run clockwise round the picture. The
answer page shows the same picture with the outline drawn in.

Settings: pictures and dots.
- Pictures: A mix of everything, Home comforts, Travel & getaways, Garden &
  outdoors, or Hobbies & pastimes. The help line names the theme's subjects.
- Dots: Relaxed (about 20–30 dots, 12 pt numbers, dots at least 0.27 in
  apart), Classic (about 30–45, 11.25 pt, 0.22 in) or Challenging (about
  45–60, 10.5 pt, 0.185 in). The help line reports the number size, the gap
  and the picture's size on this trim, or says when the trim is too small.
Subject, drawing version, which way it faces, where dot 1 sits, dot size,
spacing and margins are not settings; each page deals its own.

Every page is drawn in the browser (no AI, no images): black dots, black
lining-digit numbers, a few thin pre-drawn details, nothing else — no frame,
no background. Subjects (47): the Studio's shared retirement drawings that
trace well (31 of 36; the bicycle, garden tools and yarn basket have no
telling silhouette, and the fishing scene and beach chair are two objects),
plus 16 drawn for this game (`subjects.ts`): porch swing, reading glasses,
tea kettle, country mailbox, table lamp, armchair, sun hat, beach chair,
fishing boat, camping lantern, tent, hammock, park bench, birdbath, golf flag
and golf cart. Every knob on those changes the outline itself.

Outline (`outline.ts`): the drawing's shapes are filled on a grid, the largest
connected shape kept (it must hold 80% of the ink, or the drawing is refused
as two objects), its holes filled, and its edge traced back to a smooth vector
outline — the one line the dots hide. Pre-drawn details are only what never
touches that edge: holes (inside a mug's handle, between a chair's legs) as
closed lines, closed shapes inside (windows, wheels, lenses) and long interior
lines, plus at most a small separate part; short open fragments are dropped.
So the picture's outline is only ever revealed by the reader.

Dots (`puzzle.ts`): corners come first — the outline is simplified to the
level's fidelity (as faithful as the dot budget allows) and every corner kept
is a dot; the rest are spread by length plus bend, so curves get more dots
than straight sides, and never more on an arc than its length holds at the
minimum gap. Any pair of dots under the gap (neighbours or across a narrow
tip) loses its weaker one. A page aims for the level's count, but never more
than the outline needs (twice its corners at 1.2% of its size) or than its
length holds on a small trim. Numbers take the clearest of 72 spots round
their dot, facing out of the picture where they can, never touching a line
the reader will draw, another dot, another number or a pre-drawn detail, and
always plainly nearer their own dot than any other; the most constrained dots
choose first. A picture that will not dot cleanly tries fewer dots (down to
the level's floor), then another version, then another subject.

Quality gate (`kdp-preflight.ts`): numbering exactly 1 to N, each once, each
on one dot, in path order; the count within the level; every pair of dots at
least the level's gap apart and no dot near a line it is not part of; the
finished outline never crosses or touches itself and stays within the
level's tolerance (3–4.5% of the picture's size) of the true silhouette; the
picture at least 2.8 in and filling its room; every dot and number inside the
printable panel, numbers at 10 pt or more, clear of every line, dot and other
number and nearer their own dot than any other; details clear of the outline;
and not a shape the book already prints while the theme has fresh ones. The
drawn page must be black ink only, one dot and one number per value, each
number where it was placed, and the hidden answer outline joining the dots
in order. A failed picture is dealt again; if nothing passes, the page says
so plainly.

Uniqueness and variety: a puzzle is its outline, not its drawing, so every
version is reduced to a shape signature (its silhouette on a 16 × 16 grid,
the same whichever way it faces — a flipped or re-patterned version is not a
new puzzle). Each page stamps `subject|shape|version`. A new page takes the
theme's least-used subject in the book (never the previous page's), a shape
of it the book does not show and this seller has not printed lately; a shape
repeats in a book only once the theme has none fresh left (and is then
flagged a duplicate). Traced outlines are cached (bounded), choices are dealt
from the seller's puzzle salt and the page seed, and every check is bounded
by one book and one seller's recent history — never a comparison with every
page ever made. 292 distinct outlines across the 47 subjects.
Pages: 1 · Answer key: yes · AI content: no

### Spot the Differences: Retirement Edition (`spot-the-difference`)
Two copies of one retirement scene, one above the other, the same size, in
clean black line art: a cozy living room, a tea table, a front porch, a
garden, a beach day, a fishing dock. One picture has 5 to 10 deliberate
differences; the reader circles them. The instruction names the count, and a
row of tick circles under the pictures ("Found: ○ ○ ○") shows it even with
the instruction off. The answer page is the same two pictures with every
difference ringed and numbered, and a short list of what changed ("1. No
teacup (top)", "2. Clock changed", "3. Deck chair turned around", "4. Mug /
teacup").

Settings: scenes and differences.
- Scenes: A mix of everything; At home (living room, reading nook, tea time,
  hobby corner); Porch, garden & outdoors (front porch, garden, patio coffee,
  backyard afternoon, picnic in the park, a round of golf); Travel & the
  seaside (beach day, fishing dock, cruise deck, RV campsite, sightseeing
  trip). 15 scenes; the help line names them.
- Differences: Relaxed (5–6, bold: each change at least 0.3 in across and
  0.6 in of changed line), Classic (6–8; 0.26 in, 0.45 in) or Challenging
  (8–10, some subtler; 0.2 in, 0.32 in). A page hides as many as its scene
  fairly holds within the range. The help line reports the pictures' size on
  this trim; a soft warning appears when small pictures (under 2.7 in tall,
  e.g. 5 × 8) are asked for Challenging, or for Classic with home scenes only
  — rooms hold fewer well-spaced changes.
Which scene, which things in it, which differences, picture size, line
weights and the answer layout are not settings; each page deals its own.

Every page is drawn in the browser (no AI, no images). A scene is data
(`scene.ts`): a fixed backdrop (walls, floor, hills, sea, a dock, a ship's
rail) and parts placed on it, each a drawing from a pool per slot — the
Studio's shared retirement drawings, those Dot to Dot and Shaped Maze drew,
and 39 drawn for this game (`elements.ts`: window, picture, wall clock,
shelf of books, side table, tea table, rug, vase, floor and hanging lamps,
cookies, cake, easel, footstool, slippers, a pile of books, sun, cloud,
birds, kite, trees, pine, bush, fence, flowers, sand trap, picnic blanket,
doormat, front door, hanging basket, ducks, beach umbrella, sandcastle,
bucket, beach ball, life ring, campfire, signpost, tackle box) — 92 kinds in
all (`props.ts`). Recipes (`scenes.ts`) pack parts in rows along floors,
table tops and the ground with dealt gaps, versions and facing; things in
one plane never overlap, the sky's sun, clouds and birds keep clear of
everything, and nothing prints under 0.36 in. Both pictures render from the
one scene: every shape is white paper with a black edge laid back to front,
and what prints is each edge nothing later covers (`render.ts`), parts at
1.2 pt, scenery at 0.94 pt, a 1.9 pt frame. A part keeps its anchor (its
foot, or its hook) across versions, so a changed knob moves only what it
changes — nothing else can drift between the pictures.

Differences (`differences.ts`): one thing done to one part — left out of one
picture (either one), one knob set otherwise (the clock's hands, the
fence's pickets, the window's curtains, the cloud's puffs, the cake's
tiers), turned round (only things with a front and back: chairs, boats,
watering cans — never a cloud or a bush), or swapped for something of a
similar size from the same slot. A knob that would lift a foot off the
floor is never used. Every candidate is drawn both ways and compared as ink
on a 48-per-inch grid: a cell counts only where one picture has ink and the
other none within the level's tolerance (0.05–0.07 in), so a hairline shift
is not a difference and a missing cup is. It must change enough line, be
big enough and not too big (never over 42–60% of the picture's height), and
its answer ring is fitted to the changed ink it measured. Differences are
dealt weighted by the level (Relaxed favours whole things left out or
swapped; Challenging favours knobs), one per part, at most half of one
kind, every ring clear of every other; a few dealt orders are tried, then a
packing pass (smallest rings first).

Quality gate (`kdp-preflight.ts`): the scene is real and of the chosen
group; the count within the level; one change per part; every change's
measured size within bounds; rings on the picture and apart; the two
finished pictures compared whole — they differ nowhere outside the rings
(3 grid cells of rounding noise at most) and every change still shows
there; neither picture bare nor cluttered (2–16% ink); every part wholly
inside its frame; and not a near-copy of a page the book already prints
(same scene, over 80% the same things and half the same changes). A change
the full check faults is swapped for another; a scene that cannot hide
enough is dealt again (up to 16 tries); if nothing passes, the page says so
plainly. The drawn page must have both pictures the same size and aligned,
black ink only, one hidden ring and number per difference, 1 to N once
each, and a tick circle per difference.

Uniqueness and variety: each page stamps `scene|things|changes` (short
tokens). A new page takes the group's least-used scene in the book (never
the previous page's), then one this seller has not printed lately; each
scene is dealt up to three times and the one least like the book's pages of
that scene kept; the seller's recent scenes (by what is in them) are
avoided across books. Choices come from the seller's puzzle salt and the
page seed, and every check is bounded by one book and one seller's recent
history — never a comparison with every page ever made.
Pages: 1 · Answer key: yes · AI content: no

---

## Quick-reference index (by key)

| Key | Label | Category | Pages | Answer key | AI content |
|---|---|---|---|---|---|
| sudoku | Sudoku | logic | 1 | yes | no |
| farewell-logic-grid | Logic Grid: Farewell Party | logic | 1-2 | yes | no |
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
| would-you-rather | Would You Rather | word | 1 | no | yes |
| ever-or-never | Ever or Never | word | 1 | no | yes |
| bucket-list | Retirement Bucket List | word | 4-12 | no | yes |
| retired-name | What's Your Retired Name? | word | 1 | no | yes |
| roll-a-day | Roll-a-Day: Retirement Edition | word | 1 | no | yes |
| weeks-of-firsts | 52 Weeks of Firsts: Retirement Edition | word | 27-52 | no | yes |
| travel-wish-map | Travel Wish Map: Retirement Edition | word | 5-17 | no | no |
| who-knows-retiree-best | Who Knows the Retiree Best? | word | 4-28 | no | yes |
| two-truths-and-a-fib | Two Truths and a Fib | word | 1 | yes | yes |
| what-kind-of-retiree | What Kind of Retiree Are You? | word | 4-6 | no | yes |
| fill-in-funnies | Fill-in Funnies | word | 2-3 | no | yes |
| riddles-and-jokes | Riddles & Jokes | word | 1 | yes | yes |
| price-check | Price Check: Then & Now | word | 1 | yes | no |
| office-relics | Office Relics | word | 1 | yes | no |
| work-lingo-match | Work Lingo Match | word | 1 | yes | yes |
| occupation-trivia | Occupation Trivia Pack | word | 2-5 | yes | yes |
| maze | Maze | spatial | 1 | yes | no |
| shaped-maze | Shaped Maze: Retirement Edition | spatial | 1 | yes | no |
| stained-glass | Stained Glass Coloring | spatial | 1 | no | no |
| quote-coloring | Quote Coloring Page | spatial | 1 | no | yes |
| color-by-number | Color by Number: Retirement Scenes | spatial | 1 | no | no |
| dot-to-dot | Dot to Dot: Retirement Edition | spatial | 1 | yes | no |
| spot-the-difference | Spot the Differences: Retirement Edition | spatial | 1 | yes | no |

**Total: 36 games** (2 logic · 27 word · 7 spatial).
