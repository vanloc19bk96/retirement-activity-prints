import type { StudioRng } from '../studio-rng'
import { randomPartition } from './partition'
import { countShikakuSolutions, isShikakuForcedSolvable } from './solver'
import type { ShikakuClue, ShikakuDifficulty, ShikakuPuzzle, ShikakuRect } from './types'

interface Tier {
  /** Roughly how many squares each block should cover on a board of any size. */
  cellsPerBlock: number
  minCap: number
  maxCap: number
  /**
   * Whether the puzzle must fall to "only one place it can go" reasoning.
   * `null` accepts either — the middle tier wants the mix.
   */
  wantForced: boolean | null
}

const TIERS: Record<ShikakuDifficulty, Tier> = {
  easy: { cellsPerBlock: 14, minCap: 6, maxCap: 10, wantForced: true },
  medium: { cellsPerBlock: 10, minCap: 9, maxCap: 13, wantForced: null },
  hard: { cellsPerBlock: 8, minCap: 12, maxCap: 16, wantForced: false },
}

/**
 * Starting block-size cap for a tier on a given board.
 *
 * The cap has to grow with the board, and not for looks. A 12×12 cut into
 * nothing but 2s and 3s has astronomically many valid tilings — barely 1% of
 * clue placements pin down a single solution — so a fixed small cap starves the
 * search and drives it down to a field of 1s. Blocks sized to the board keep
 * every grid unique at a sensible clue density.
 */
export function areaCapFor(difficulty: ShikakuDifficulty, cells: number): number {
  const tier = TIERS[difficulty]
  return Math.min(tier.maxCap, Math.max(tier.minCap, Math.round(cells / tier.cellsPerBlock)))
}

/** Longest side for a cap. Ribbons constrain hard, but only big blocks earn them. */
export function sideCapFor(maxArea: number): number {
  if (maxArea <= 6) return 4
  if (maxArea <= 9) return 5
  return 6
}

/** Fresh boards per area cap. */
const PARTITION_ATTEMPTS = 5
/** Clue re-rolls per board — the same tiling is often unique under a better roll. */
const CLUE_ATTEMPTS = 12
/**
 * Extra rolls spent chasing the tier's flavour once a uniquely solvable board is
 * already in hand.
 *
 * A fully forced 12×12 is genuinely rare, and without this the easy tier burned
 * every roll — sixty solves plus sixty forced-checks — before settling for the
 * board it found first. The settled-for board is still an easy board; its blocks
 * come from the same small area cap.
 */
const FLAVOUR_BUDGET = 10

/**
 * Area caps to try, in order. Escalating — never fragmenting.
 *
 * Bigger blocks are *more* constraining: there are far fewer ways to place a
 * 2×5 than a 1×2. Stepping the cap down on failure is what buried a 12×12 under
 * single squares; stepping it up walks toward boards that pin themselves down.
 */
function areaCaps(start: number, cells: number): number[] {
  // Room to escalate, but not so far that a board ends up with a dozen huge
  // blocks and a page that reads as empty.
  const ceiling = Math.min(20, Math.max(start, Math.round(cells / 7)))
  const caps: number[] = []
  for (let cap = start; cap <= ceiling; cap += 2) caps.push(cap)
  return caps
}

function placeClues(rects: ShikakuRect[], rng: StudioRng): ShikakuClue[] {
  return rects.map((rect) => ({
    r: rect.r + rng.int(0, rect.h - 1),
    c: rect.c + rng.int(0, rect.w - 1),
    value: rect.h * rect.w,
  }))
}

function singletonPuzzle(rows: number, cols: number): ShikakuPuzzle {
  const solution: ShikakuRect[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) solution.push({ r, c, h: 1, w: 1 })
  }
  return {
    rows,
    cols,
    solution,
    clues: solution.map((rect) => ({ r: rect.r, c: rect.c, value: 1 })),
  }
}

/**
 * A Shikaku with exactly one solution.
 *
 * Starts at the tier's block size for this board and escalates when a cap
 * cannot produce a provably unique board. The all-singleton board at the end is
 * a correctness guarantee, not a path anything takes in practice — the top caps
 * find a unique board in roughly a third of rolls, and there are sixty of them.
 */
export function buildShikakuPuzzle(
  rows: number,
  cols: number,
  difficulty: ShikakuDifficulty,
  rng: StudioRng,
): ShikakuPuzzle {
  const tier = TIERS[difficulty]
  const cells = rows * cols
  let fallback: ShikakuPuzzle | null = null
  let rollsSinceFallback = 0

  for (const maxArea of areaCaps(areaCapFor(difficulty, cells), cells)) {
    const maxSide = sideCapFor(maxArea)
    for (let attempt = 0; attempt < PARTITION_ATTEMPTS; attempt++) {
      const rects = randomPartition(rows, cols, { maxArea, maxSide }, rng)
      if (!rects) continue

      for (let roll = 0; roll < CLUE_ATTEMPTS; roll++) {
        const clues = placeClues(rects, rng)
        if (countShikakuSolutions(rows, cols, clues, 2) !== 1) continue

        const puzzle: ShikakuPuzzle = { rows, cols, clues, solution: rects }
        if (tier.wantForced === null) return puzzle
        if (isShikakuForcedSolvable(rows, cols, clues) === tier.wantForced) return puzzle
        // Unique but the wrong flavour — keep it in case nothing better lands.
        if (!fallback) fallback = puzzle
        else if (++rollsSinceFallback >= FLAVOUR_BUDGET) return fallback
      }
    }
    if (fallback) return fallback
  }

  return fallback ?? singletonPuzzle(rows, cols)
}

export { countShikakuSolutions, isShikakuForcedSolvable, clueCandidates } from './solver'
export { randomPartition } from './partition'
export type { ShikakuClue, ShikakuDifficulty, ShikakuPuzzle, ShikakuRect } from './types'
