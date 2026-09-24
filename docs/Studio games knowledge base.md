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

## Word (14 games)

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
| would-you-rather | Would You Rather | word | 1 | no | yes |
| ever-or-never | Ever or Never | word | 1 | no | yes |
| retired-name | What's Your Retired Name? | word | 1 | no | yes |
| two-truths-and-a-fib | Two Truths and a Fib | word | 1 | yes | yes |
| what-kind-of-retiree | What Kind of Retiree Are You? | word | 4-6 | no | yes |
| maze | Maze | spatial | 1 | yes | no |

**Total: 16 games** (1 logic · 14 word · 1 spatial).
