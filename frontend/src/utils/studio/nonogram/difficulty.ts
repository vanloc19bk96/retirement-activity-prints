import { filledCount } from './clues'
import type {
  Bitmap,
  LineSolveTrace,
  NonogramDifficulty,
  NonogramMetrics,
} from './types'

/**
 * Longest clue list allowed on a line, by grid size.
 *
 * The clue gutter is drawn in grid cells, so a line needing 8 numbers steals
 * eight columns of page width from the grid itself and shrinks every square.
 * Capping it keeps squares large enough to fill in by hand — the whole point of
 * a printed book, and the difference between a 4-star and a 2-star review.
 */
export function maxClueEntries(size: number): number {
  if (size <= 5) return 3
  if (size <= 10) return 4
  if (size <= 15) return 5
  return 6
}

const MIN_DENSITY = 0.28
const MAX_DENSITY = 0.72
/** Share of rows+columns allowed to be completely empty. */
const MAX_EMPTY_LINE_RATIO = 0.25

/** Difficulty band cuts on the 0…1 score. */
export const NONOGRAM_EASY_MAX_SCORE = 0.34
export const NONOGRAM_HARD_MIN_SCORE = 0.52

/** Sweeps beyond the first that count as "a lot of work" at this size. */
function roundSpan(size: number): number {
  return Math.max(2, Math.round(size / 3))
}

function clueLengths(clues: number[][]): { max: number; empty: number } {
  let max = 0
  let empty = 0
  for (const clue of clues) {
    if (clue.length > max) max = clue.length
    if (clue.length === 1 && clue[0] === 0) empty++
  }
  return { max, empty }
}

/**
 * Cheap gates applied before the solver runs: they reject the large majority of
 * candidates for a fraction of the cost of a line solve.
 */
export function passesPrintQuality(
  bitmap: Bitmap,
  rowClues: number[][],
  colClues: number[][],
): boolean {
  const size = bitmap.length
  const density = filledCount(bitmap) / (size * size)
  if (density < MIN_DENSITY || density > MAX_DENSITY) return false

  const rows = clueLengths(rowClues)
  const cols = clueLengths(colClues)
  const limit = maxClueEntries(size)
  if (rows.max > limit || cols.max > limit) return false

  const emptyLimit = Math.floor(size * 2 * MAX_EMPTY_LINE_RATIO)
  if (rows.empty + cols.empty > emptyLimit) return false

  return true
}

/**
 * 0 (line logic finishes it almost immediately) … 1 (slow, little forced up
 * front). Weighted toward the opening: what makes a nonogram feel hard is how
 * little the first pass hands you, not how many passes it takes afterwards.
 */
export function difficultyScore(trace: LineSolveTrace, size: number): number {
  const cells = size * size
  const opening = Math.min(1, trace.openingCells / cells)
  const rounds = Math.min(1, Math.max(0, trace.rounds - 1) / roundSpan(size))
  const score = 0.65 * (1 - opening) + 0.35 * rounds
  return Math.min(1, Math.max(0, score))
}

export function classifyDifficulty(score: number): NonogramDifficulty {
  if (score <= NONOGRAM_EASY_MAX_SCORE) return 'easy'
  if (score >= NONOGRAM_HARD_MIN_SCORE) return 'hard'
  return 'medium'
}

export function buildMetrics(options: {
  bitmap: Bitmap
  rowClues: number[][]
  colClues: number[][]
  trace: LineSolveTrace
}): NonogramMetrics {
  const { bitmap, rowClues, colClues, trace } = options
  const size = bitmap.length
  const rows = clueLengths(rowClues)
  const cols = clueLengths(colClues)
  return {
    density: filledCount(bitmap) / (size * size),
    maxRowClueLen: rows.max,
    maxColClueLen: cols.max,
    emptyLines: rows.empty + cols.empty,
    rounds: trace.rounds,
    openingRatio: trace.openingCells / (size * size),
    score: difficultyScore(trace, size),
  }
}

/**
 * Fill target for a candidate. Sparser grids force fewer cells on the opening
 * pass, so the band shifts down as the requested tier goes up — this only steers
 * the search; the measured score still decides the tier.
 */
export function densityBand(difficulty: NonogramDifficulty): [number, number] {
  if (difficulty === 'easy') return [0.44, 0.64]
  if (difficulty === 'hard') return [0.3, 0.54]
  return [0.36, 0.6]
}
