import {
  buildWordSearch,
  countPuzzleMix,
  countTokenReadings,
  createRng,
  directionsForDifficulty,
  isBackslashDir,
  isDiagonalDir,
  isSlashDir,
  meetsMix,
  mixTargets,
  type WordEntry,
  type WordSearchPuzzle,
} from '@/utils/puzzles/word-search-core'
import { sortForBank } from './content'
import type { WordSearchLevel } from './levels'

/**
 * Fresh word subsets tried at one count before the count is stepped down.
 *
 * Placement is the one part of this page that can fail for reasons nothing
 * upstream can see: a particular seventeen words may simply not interlock on a
 * particular grid. Re-shuffling is far cheaper than re-asking the writer, and
 * the pool is over-requested precisely so there is something else to try.
 */
const PLACEMENT_ATTEMPTS = 14
/**
 * Attempts spent on each count *below* the one the page planned.
 *
 * The ladder exists to save a page, not to find the best of thirteen
 * consolation prizes. Spending the full fourteen shuffles on every rung turned
 * a pathological pool — every word at the grid's full width — into a quarter
 * of a second of layout, which a book run pays once per sheet.
 */
const FALLBACK_ATTEMPTS = 4
/** Re-fills of the random letters before a placement is abandoned as ambiguous. */
const FILL_ATTEMPTS = 40

/**
 * The bag the filler letters are drawn from.
 *
 * Uniform A–Z is what a computer does and it looks like it: a grid speckled
 * with Q, X and Z reads as machine output, and the listed words stand out from
 * it because they are the only English-looking runs on the page. Weighting
 * towards English frequency — tempered, so the rare letters do not vanish —
 * makes the filler read like language, which is the whole craft of a word
 * search grid.
 */
const FILLER_BAG = (() => {
  const weights: Record<string, number> = {
    E: 9, T: 7, A: 7, O: 7, I: 6, N: 6, S: 6, R: 6, H: 5, L: 5,
    D: 4, C: 4, U: 4, M: 4, P: 3, F: 3, G: 3, W: 3, Y: 3, B: 3,
    V: 2, K: 2, J: 1, X: 1, Q: 1, Z: 1,
  }
  return Object.entries(weights)
    .map(([letter, count]) => letter.repeat(count))
    .join('')
})()

function placementCellKeys(puzzle: Pick<WordSearchPuzzle, 'placements'>): Set<string> {
  const keys = new Set<string>()
  for (const placement of puzzle.placements) {
    for (let i = 0; i < placement.word.length; i++) {
      keys.add(`${placement.r + placement.dir.dr * i},${placement.c + placement.dir.dc * i}`)
    }
  }
  return keys
}

/**
 * Re-draw the filler until every listed word reads in exactly one place.
 *
 * Without this the answer key is a guess. A five-letter word can turn up a
 * second time in random letters often enough to matter across a hundred-page
 * book, and when it does the key circles one of the two — so a reader who
 * found the other one is told they were wrong.
 *
 * Only the cells no placement owns are re-drawn, so the puzzle itself never
 * changes between attempts; null means this placement could not be made
 * unambiguous and the caller should try a different one.
 */
function refillUntilUnique(options: {
  puzzle: WordSearchPuzzle
  seed: number
}): string[][] | null {
  const { puzzle, seed } = options
  const fixed = placementCellKeys(puzzle)

  for (let attempt = 0; attempt < FILL_ATTEMPTS; attempt++) {
    const rng = createRng(seed + attempt)
    const grid = puzzle.grid.map((row, r) =>
      row.map((letter, c) => {
        if (fixed.has(`${r},${c}`)) return letter
        return FILLER_BAG[rng.int(0, FILLER_BAG.length - 1)]!
      }),
    )
    if (puzzle.words.every((token) => countTokenReadings(grid, token) === 1)) {
      return grid
    }
  }
  return null
}

/** One shot at `count` words on a `side` grid, or null. */
function tryPlaceAt(options: {
  entries: readonly WordEntry[]
  count: number
  side: number
  level: WordSearchLevel
  seed: number
  attempts: number
}): WordSearchPuzzle | null {
  const { entries, count, side, level, seed, attempts } = options
  const dirs = directionsForDifficulty(level.directions)
  const allowReverse = level.directions === 'hard'

  for (let attempt = 0; attempt < attempts; attempt++) {
    const rng = createRng(seed + attempt * 1_009)
    const picked = rng.shuffle([...entries]).slice(0, count)
    const built = buildWordSearch(
      picked.map((entry) => entry.token),
      side,
      dirs,
      allowReverse,
      rng,
    )
    if (!built) continue
    const mix = countPuzzleMix(built.grid, built.placements)
    const targets = mixTargets({
      wordCount: count,
      hasDiagonal: dirs.some(isDiagonalDir),
      hasSlash: dirs.some(isSlashDir),
      hasBackslash: dirs.some(isBackslashDir),
      allowReverse,
    })
    if (!meetsMix(mix, targets)) continue

    // The printed list is the placed list, never the requested one.
    const placed = new Set(built.placements.map((placement) => placement.word))
    const kept = picked.filter((entry) => placed.has(entry.token))
    if (kept.length !== count) continue

    const provisional: WordSearchPuzzle = {
      grid: built.grid,
      placements: built.placements,
      size: side,
      words: kept.map((entry) => entry.token),
      displays: kept.map((entry) => entry.display),
    }
    const grid = refillUntilUnique({ puzzle: provisional, seed: seed + attempt * 7_919 })
    if (!grid) continue

    const ordered = sortForBank(kept)
    return {
      ...provisional,
      grid,
      words: ordered.map((entry) => entry.token),
      displays: ordered.map((entry) => entry.display),
    }
  }
  return null
}

/**
 * Build the page's puzzle, or null.
 *
 * The count the page planned is tried first and hardest: fourteen different
 * subsets of the pool, each re-filled up to forty times. Only when all of that
 * fails does the count step down, and it never falls below the level's floor.
 * A page one word short of its note is a blemish; an error page where a puzzle
 * should be is a hole in the book.
 */
export function tryBuildWordSearch(options: {
  entries: readonly WordEntry[]
  wordCount: number
  gridSide: number
  level: WordSearchLevel
  seed: number
}): WordSearchPuzzle | null {
  const { entries, wordCount, gridSide, level, seed } = options
  const target = Math.min(wordCount, entries.length)
  if (target < level.minWords) return null

  for (let count = target; count >= level.minWords; count--) {
    const puzzle = tryPlaceAt({
      entries,
      count,
      side: gridSide,
      level,
      seed,
      attempts: count === target ? PLACEMENT_ATTEMPTS : FALLBACK_ATTEMPTS,
    })
    if (puzzle) return puzzle
  }
  return null
}
