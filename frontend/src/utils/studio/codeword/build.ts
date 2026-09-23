/**
 * Building one codeword: the grid, the code, and the letters given away.
 *
 * The grid itself is packed by the crossword's own constructor rather than by a
 * second engine here. That is not only reuse — it is what makes the page safe.
 * `buildCrossword` already refuses anything a numbered grid cannot survive: a
 * disconnected lattice, two words disagreeing about a shared cell, a word
 * touching another along its flank so a run of cells spells something nobody
 * intended. Re-deriving those rules for this page would mean two packers that
 * could drift apart, and a codeword is the game least able to survive the
 * drift: with no clues on the page, a solver who hits a contradiction has no
 * way to tell whether the book is wrong or they are.
 *
 * What this module adds on top is the part a crossword does not have — a
 * substitution alphabet over the letters that actually appear, and a small
 * starter set chosen to open the puzzle without solving it.
 */

import type { StudioRng } from '../studio-rng'
import { selectCrosswordCandidates } from '../crossword/candidate-selector'
import { buildCrossword } from '../crossword/construct'
import {
  allCrossingsConsistent,
  readEntry,
  whiteConnected,
} from '../crossword/validate'
import type { CrosswordEntry, CrosswordPair } from '../crossword/types'
import { selectCodewordWords, type CodewordWord } from './content'
import type { CodewordLevel } from './levels'

export type CodewordEntry = CrosswordEntry

export interface CodewordPuzzle {
  /** Cropped square lattice — `null` is a gap, a string is a letter cell. */
  grid: (string | null)[][]
  size: number
  /** The words the grid spells, with where each one starts and which way it runs. */
  entries: CodewordEntry[]
  /** Letter → its code number. A bijection onto 1..N. */
  letterToNumber: ReadonlyMap<string, number>
  /** The same mapping read the way a solver reads it. */
  numberToLetter: ReadonlyMap<number, string>
  /** Letters printed into the grid and the key before the solver starts. */
  starters: ReadonlySet<string>
  /** Distinct letters in the grid — the numbers this puzzle prints. */
  letters: string[]
}

/* -------------------------------------------------------------------------- *
 * The code
 * -------------------------------------------------------------------------- */

/**
 * Number every letter the grid uses, and nothing else.
 *
 * A published codeword usually runs 1–26 because its grid is built to contain
 * all twenty-six letters. This one is built from a curated retirement
 * vocabulary, where insisting on a J, a Q, an X *and* a Z in one themed grid
 * means reaching for words no reader would recognise — which is a far worse
 * page than one that runs 1–20. So the code covers exactly the letters present,
 * and the page never claims otherwise: the instruction says each number stands
 * for the same letter, and the key strip prints one box per number that exists.
 *
 * The result is a bijection by construction — a shuffle of 1..N dealt onto N
 * distinct letters — so no letter can take two numbers and no number two
 * letters. `kdp-preflight.ts` checks it again anyway, because this is the one
 * property a solver cannot work around.
 */
export function buildCodewordCipher(
  letters: readonly string[],
  rng: StudioRng,
): { letterToNumber: Map<string, number>; numberToLetter: Map<number, string> } {
  const sorted = [...letters].sort()
  const numbers = rng.shuffle(
    Array.from({ length: sorted.length }, (_, i) => i + 1),
  )
  // A code that happens to run A=1, B=2, … is a correct bijection and a
  // worthless puzzle. Vanishingly unlikely at these sizes, and free to rule out.
  if (numbers.every((value, index) => value === index + 1)) {
    numbers.reverse()
  }

  const letterToNumber = new Map<string, number>()
  const numberToLetter = new Map<number, string>()
  sorted.forEach((letter, index) => {
    const number = numbers[index]!
    letterToNumber.set(letter, number)
    numberToLetter.set(number, letter)
  })
  return { letterToNumber, numberToLetter }
}

/* -------------------------------------------------------------------------- *
 * The starters
 * -------------------------------------------------------------------------- */

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U'])

/**
 * How much of the grid the starters may fill, and how little they may leave.
 *
 * Both bounds matter and they fail in opposite directions. Give away E on a
 * grid where E is one cell in seven and a solver reads half the page before
 * deducing anything — the puzzle is over before it starts. Give away three
 * letters that appear once each and the starters buy nothing at all: the page
 * looks helpful and plays like a blank wall, which is the worse of the two for
 * this audience because it reads as the book's fault.
 */
const MAX_STARTER_SHARE = 0.25
const MIN_STARTER_CELLS = 3

/** How common one starter letter may be, as a share of the filled cells. */
const STARTER_CELL_SHARES: readonly number[] = [0.1, 0.14, 0.2]

interface LetterStats {
  letter: string
  /** Cells this letter fills. */
  cells: number
  /** Distinct words it appears in — what a starter actually buys. */
  words: number
}

function letterStats(
  grid: readonly (string | null)[][],
  entries: readonly CodewordEntry[],
): Map<string, LetterStats> {
  const stats = new Map<string, LetterStats>()
  const touch = (letter: string): LetterStats => {
    let entry = stats.get(letter)
    if (!entry) {
      entry = { letter, cells: 0, words: 0 }
      stats.set(letter, entry)
    }
    return entry
  }

  for (const row of grid) {
    for (const cell of row) {
      if (cell === null) continue
      touch(cell).cells += 1
    }
  }
  for (const entry of entries) {
    for (const letter of new Set(entry.word)) {
      touch(letter).words += 1
    }
  }
  return stats
}

/**
 * Order candidates by what a starter is for: opening words.
 *
 * Most words first, because a letter that shows up in five entries gives the
 * solver five places to read outwards from. Fewest cells breaks the tie, so of
 * two letters that open the same number of words the page gives away the one
 * that reveals less ink.
 *
 * The list is shuffled before it is sorted, so two puzzles with the same shape
 * do not always hand over the same three letters — a book whose every page
 * starts with E, S and T teaches the solver the code instead of the method.
 */
function rankCandidates(candidates: LetterStats[], rng: StudioRng): LetterStats[] {
  return rng
    .shuffle(candidates)
    .sort((a, b) => b.words - a.words || a.cells - b.cells)
}

function pickWithinBudget(
  ranked: readonly LetterStats[],
  want: number,
  cellBudget: number,
): LetterStats[] | null {
  const chosen: LetterStats[] = []
  let spent = 0

  // Exactly one vowel, when the grid offers one. A vowel is the most useful
  // anchor a solver can be handed — it is what turns a run of numbers into a
  // word shape — and two of them start filling the page in for them.
  const vowel = ranked.find(
    (stat) => VOWELS.has(stat.letter) && stat.cells <= cellBudget,
  )
  if (vowel) {
    chosen.push(vowel)
    spent += vowel.cells
  }

  for (const stat of ranked) {
    if (chosen.length >= want) break
    if (chosen.includes(stat)) continue
    if (vowel && VOWELS.has(stat.letter)) continue
    if (spent + stat.cells > cellBudget) continue
    chosen.push(stat)
    spent += stat.cells
  }

  // A vowel-free grid (or one whose only vowel is too common) still needs its
  // full complement, so fall back to whatever is left rather than print two.
  for (const stat of ranked) {
    if (chosen.length >= want) break
    if (chosen.includes(stat)) continue
    if (spent + stat.cells > cellBudget) continue
    chosen.push(stat)
    spent += stat.cells
  }

  if (chosen.length !== want) return null
  if (spent < MIN_STARTER_CELLS) return null
  return chosen
}

/**
 * The two or three mappings printed before the solver begins, or null.
 *
 * Tried at widening tolerances rather than at one fixed rule: a compact gentle
 * grid can genuinely hold no letter that appears in two words without also
 * appearing in a tenth of the cells, and refusing that page outright would mean
 * the smallest trims never print a codeword. Null means even the widest
 * tolerance could not find a set, and the caller draws a different grid instead
 * of printing starters that give the page away.
 */
export function pickCodewordStarters(options: {
  grid: readonly (string | null)[][]
  entries: readonly CodewordEntry[]
  want: number
  rng: StudioRng
}): Set<string> | null {
  const { grid, entries, want, rng } = options
  const stats = letterStats(grid, entries)
  const filled = [...stats.values()].reduce((sum, stat) => sum + stat.cells, 0)
  if (filled === 0 || stats.size <= want) return null

  const cellBudget = Math.max(MIN_STARTER_CELLS, Math.floor(filled * MAX_STARTER_SHARE))

  for (const share of STARTER_CELL_SHARES) {
    const perLetterCap = Math.max(1, Math.ceil(filled * share))
    for (const minWords of [2, 1]) {
      const candidates = [...stats.values()].filter(
        (stat) => stat.words >= minWords && stat.cells <= perLetterCap,
      )
      // Leave the solver more letters to deduce than the page hands over.
      if (candidates.length < want || stats.size - want < want) continue
      const chosen = pickWithinBudget(rankCandidates(candidates, rng), want, cellBudget)
      if (chosen) return new Set(chosen.map((stat) => stat.letter))
    }
  }

  return null
}

/* -------------------------------------------------------------------------- *
 * The grid
 * -------------------------------------------------------------------------- */

/** Substitutes handed to the packer on top of the words it is asked to place. */
const SUBSTITUTE_WORDS = 7
/** Fresh draws before a page gives up and says so. */
const BUILD_ATTEMPTS = 5
/**
 * Letters past the level's floor at which a draw is good enough to stop on.
 *
 * Without it every page would pay for all five draws, because "more letters" has
 * no natural ceiling — a codeword with twenty-two numbers is not meaningfully
 * better to solve than one with twenty, and the seconds are better spent not
 * being spent.
 */
const LETTERS_GOOD_ENOUGH = 3

export function distinctGridLetters(grid: readonly (string | null)[][]): string[] {
  const letters = new Set<string>()
  for (const row of grid) {
    for (const cell of row) {
      if (cell !== null) letters.add(cell)
    }
  }
  return [...letters].sort()
}

/**
 * Everything this grid promises, checked before a code is laid over it.
 *
 * Each of these is cheap here and catastrophic in print. A word that does not
 * read back off the grid is a word the solution page claims is there and is
 * not. An inconsistent crossing is two answers fighting over one cell, which no
 * amount of deduction resolves. A disconnected lattice is two puzzles printed
 * as one, and the smaller half has no starters to open it.
 */
function gridIsSound(
  grid: (string | null)[][],
  size: number,
  entries: CodewordEntry[],
): boolean {
  if (entries.length === 0) return false
  if (entries.some((entry) => readEntry(grid, entry) !== entry.word)) return false
  if (!allCrossingsConsistent(grid, entries)) return false
  if (!whiteConnected(grid, size)) return false
  // Both headings, or the page is a word list with boxes round it.
  return new Set(entries.map((entry) => entry.dir)).size >= 2
}

export interface BuildCodewordOptions {
  pool: readonly CodewordWord[]
  level: CodewordLevel
  /** Cells a side the page can print — the packer never exceeds it. */
  maxGridSide: number
  /** Words this page aims to interlock, after the page-size cap. */
  targetWords: number
  rng: StudioRng
}

interface SoundDraw {
  grid: (string | null)[][]
  size: number
  entries: CodewordEntry[]
  letters: string[]
  starters: Set<string>
}

/**
 * One draw: choose words, pack them, and check everything the page will claim.
 *
 * The chosen words are ranked by crossability before the packer sees them —
 * the crossword's own selector, reused. It is not cosmetic: a pool ordered so
 * that words sharing letters come first is the difference between a grid that
 * closes on the first pass and one that backtracks through twenty thousand
 * nodes before giving up.
 */
function drawCodeword(
  options: BuildCodewordOptions & { target: number },
): SoundDraw | null {
  const { pool, level, maxGridSide, target, rng } = options

  const words = selectCodewordWords({ pool, count: target + SUBSTITUTE_WORDS, rng })
  if (words.length < level.minWords) return null

  const pairs = selectCrosswordCandidates(
    words.map<CrosswordPair>((word) => ({ word: word.token, clue: word.display })),
    target,
  )
  const built = buildCrossword(pairs, maxGridSide, rng, target)
  if (!built) return null
  if (built.entries.length < level.minWords) return null

  const entries = built.entries.map((entry) => ({ ...entry, number: 0 }))
  if (!gridIsSound(built.grid, built.size, entries)) return null

  const letters = distinctGridLetters(built.grid)
  if (letters.length < level.minDistinctLetters) return null

  const starters = pickCodewordStarters({
    grid: built.grid,
    entries,
    want: level.starterLetters,
    rng,
  })
  if (!starters) return null

  return { grid: built.grid, size: built.size, entries, letters, starters }
}

/**
 * Draw a codeword, or null.
 *
 * Retries with a fresh word selection rather than a fresh packing of the same
 * words: when a draw fails it is almost always because the words it was given
 * share too few letters to interlock or to cover enough of the alphabet, and
 * re-packing the same pool cannot fix either.
 *
 * The best sound draw is kept rather than the first, because the two things a
 * codeword is measured by — how many numbers it has and how many words hold
 * them together — are both maximised, not merely cleared. A draw that reaches
 * the floor plus a comfortable margin stops the search, so a typical page still
 * costs one pass.
 */
export function buildCodewordPuzzle(
  options: BuildCodewordOptions,
): CodewordPuzzle | null {
  const { level, targetWords, rng } = options
  const target = Math.max(level.minWords, Math.min(targetWords, level.targetWords))
  const stopAt = level.minDistinctLetters + LETTERS_GOOD_ENOUGH

  let best: SoundDraw | null = null
  for (let attempt = 0; attempt < BUILD_ATTEMPTS; attempt++) {
    const draw = drawCodeword({ ...options, target })
    if (draw) {
      if (
        !best ||
        draw.letters.length > best.letters.length ||
        (draw.letters.length === best.letters.length &&
          draw.entries.length > best.entries.length)
      ) {
        best = draw
      }
      if (best.letters.length >= stopAt) break
    }
  }
  if (!best) return null

  const { letterToNumber, numberToLetter } = buildCodewordCipher(best.letters, rng)
  return {
    grid: best.grid,
    size: best.size,
    entries: best.entries,
    letterToNumber,
    numberToLetter,
    starters: best.starters,
    letters: best.letters,
  }
}
