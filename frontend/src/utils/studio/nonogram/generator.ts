import type { StudioRng } from '../studio-rng'
import { cluesFromBitmap } from './clues'
import { dihedralTransform } from './bitmap-draw'
import {
  buildMetrics,
  classifyDifficulty,
  densityBand,
  passesPrintQuality,
} from './difficulty'
import {
  descendingStaircase,
  familiesForStyle,
  type NonogramFamily,
} from './families'
import { traceLineSolve } from './solver'
import type {
  Bitmap,
  NonogramDifficulty,
  NonogramPuzzle,
  NonogramSize,
  NonogramStyle,
} from './types'

export { lineClue, columnOf, cluesFromBitmap, filledCount } from './clues'
export {
  solveAndCount,
  solveForcedOnly,
  traceLineSolve,
  enumerateLinePlacements,
  eachLinePlacement,
  forcedLineCells,
} from './solver'
export {
  bitmapToRows,
  canonicalBitmapKey,
  dihedralTransform,
  transpose,
} from './bitmap-draw'
export {
  NONOGRAM_FAMILIES,
  familiesForStyle,
  descendingStaircase,
  type NonogramFamily,
} from './families'
export {
  buildMetrics,
  classifyDifficulty,
  densityBand,
  difficultyScore,
  maxClueEntries,
  passesPrintQuality,
} from './difficulty'
export type {
  Bitmap,
  LineSolveTrace,
  NonogramDifficulty,
  NonogramMetrics,
  NonogramPuzzle,
  NonogramSize,
  NonogramStyle,
  SolveResult,
} from './types'
export {
  NONOGRAM_DIFFICULTIES,
  NONOGRAM_SIZES,
  NONOGRAM_STYLES,
} from './types'

/** Candidates tried while insisting on the exact requested tier. */
const STRICT_ATTEMPTS = 220
/** Further candidates accepted at any tier before falling back. */
const RELAXED_ATTEMPTS = 160
/** Families that hold up at every size, used for the last search pass. */
const RELIABLE_FAMILY_IDS = new Set(['staircase', 'bands', 'mosaic', 'blocks'])

function assemble(
  size: NonogramSize,
  bitmap: Bitmap,
  familyId: string,
  difficulty: NonogramDifficulty,
  rowClues: number[][],
  colClues: number[][],
  trace: ReturnType<typeof traceLineSolve>,
): NonogramPuzzle {
  return {
    size,
    bitmap,
    rowClues,
    colClues,
    familyId,
    difficulty,
    metrics: buildMetrics({ bitmap, rowClues, colClues, trace }),
  }
}

interface Candidate {
  bitmap: Bitmap
  familyId: string
  difficulty: NonogramDifficulty
  rowClues: number[][]
  colClues: number[][]
  trace: ReturnType<typeof traceLineSolve>
}

/**
 * Draw one grid and test it. Returns null unless it is uniquely solvable by
 * line logic alone and clean enough to print.
 */
function tryCandidate(
  family: NonogramFamily,
  size: NonogramSize,
  difficulty: NonogramDifficulty,
  rng: StudioRng,
): Candidate | null {
  const [minDensity, maxDensity] = densityBand(difficulty)
  const density = minDensity + rng.next() * (maxDensity - minDensity)
  // The free turn/flip multiplies what each family can express and keeps
  // orientation-biased families (staircase, stripes) from reading as a habit.
  const bitmap = dihedralTransform(family.draw(size, density, rng), rng.int(0, 7))

  const { rowClues, colClues } = cluesFromBitmap(bitmap)
  if (!passesPrintQuality(bitmap, rowClues, colClues)) return null

  const trace = traceLineSolve(rowClues, colClues, size)
  // A grid line logic completes has exactly one solution and needs no guessing.
  if (!trace.solved) return null

  const metrics = buildMetrics({ bitmap, rowClues, colClues, trace })
  return {
    bitmap,
    familyId: family.id,
    difficulty: classifyDifficulty(metrics.score),
    rowClues,
    colClues,
    trace,
  }
}

interface SearchResult {
  /** First candidate whose measured tier matched the request. */
  exact: Candidate | null
  /** First valid candidate at any tier, kept as a fallback. */
  any: Candidate | null
}

/**
 * Cycle a shuffled family list rather than re-picking at random, so every
 * family gets its turn within a pass instead of one lucky family dominating.
 */
function search(
  families: readonly NonogramFamily[],
  size: NonogramSize,
  difficulty: NonogramDifficulty,
  rng: StudioRng,
  attempts: number,
): SearchResult {
  if (families.length === 0) return { exact: null, any: null }
  const order = rng.shuffle(families)
  let any: Candidate | null = null
  for (let attempt = 0; attempt < attempts; attempt++) {
    const family = order[attempt % order.length]!
    const candidate = tryCandidate(family, size, difficulty, rng)
    if (!candidate) continue
    if (candidate.difficulty === difficulty) return { exact: candidate, any }
    if (!any) any = candidate
  }
  return { exact: null, any }
}

/**
 * Build one puzzle.
 *
 * Every puzzle returned is uniquely solvable by line logic alone — no
 * trial-and-error is ever required of the reader. Difficulty is *measured* from
 * how the solve actually goes, not assumed from the settings, so an "easy" page
 * in a printed book really is easy.
 */
export function buildNonogram(options: {
  size: NonogramSize
  difficulty: NonogramDifficulty
  style: NonogramStyle
  rng: StudioRng
}): NonogramPuzzle {
  const { size, difficulty, style, rng } = options
  const families = familiesForStyle(style, size)
  const pool = families.length > 0 ? families : familiesForStyle('mixed', size)

  const first = search(pool, size, difficulty, rng, STRICT_ATTEMPTS)
  // Second pass leans on families that hold up at every size, for the cases
  // where the requested tier is scarce (5×5 has little room for a hard puzzle).
  const second = first.exact
    ? null
    : search(
        familiesForStyle('mixed', size).filter((f) => RELIABLE_FAMILY_IDS.has(f.id)),
        size,
        difficulty,
        rng,
        RELAXED_ATTEMPTS,
      )

  // Ship a correct puzzle at the nearest reachable tier rather than fail a page.
  const chosen = first.exact ?? second?.exact ?? first.any ?? second?.any ?? null
  if (chosen) {
    return assemble(
      size,
      chosen.bitmap,
      chosen.familyId,
      chosen.difficulty,
      chosen.rowClues,
      chosen.colClues,
      chosen.trace,
    )
  }

  // Safety net — never reached in practice, but a printed page must exist.
  const bitmap = dihedralTransform(descendingStaircase(size), rng.int(0, 7))
  const { rowClues, colClues } = cluesFromBitmap(bitmap)
  const trace = traceLineSolve(rowClues, colClues, size)
  const metrics = buildMetrics({ bitmap, rowClues, colClues, trace })
  return assemble(
    size,
    bitmap,
    'staircase-fallback',
    classifyDifficulty(metrics.score),
    rowClues,
    colClues,
    trace,
  )
}
