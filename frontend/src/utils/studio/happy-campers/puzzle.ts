import type { StudioRng } from '../studio-rng'
import { canonicalGridForm, canonicalHash } from '../_shared/uniqueness'
import { hcCounts, isHcSolution, solveHc, tentsOf, type HcPuzzle, type HcRules } from './solver'

/**
 * Building a Happy Campers grid.
 *
 * Tents are pitched first, at random squares that do not touch; each tent
 * then gets a tree on a random free side. The counts are read off the
 * tents. That always makes a grid with at least one answer; the solver then
 * decides whether a reader can reach it, and only it, without guessing —
 * most random grids have several answers, so many are drawn and the first
 * one the level's steps finish is kept.
 */

export interface HcBuilt {
  puzzle: HcPuzzle
  /** The one answer, flat: true where a tent goes. */
  tents: boolean[]
  /** Digest of the grid, the same however it is turned or mirrored. */
  signature: string
}

/** Random grids drawn before a level gives up on this stream. */
export const HC_CANDIDATES = 400

function pitch(rows: number, cols: number, tentCount: number, rng: StudioRng): HcBuilt['tents'] | null {
  const size = rows * cols
  const tents = new Array<boolean>(size).fill(false)
  let placed = 0
  for (const i of rng.shuffle(Array.from({ length: size }, (_, k) => k))) {
    if (placed === tentCount) break
    const r = Math.floor(i / cols)
    const c = i % cols
    let clear = true
    for (let dr = -1; dr <= 1 && clear; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr
        const cc = c + dc
        if (rr >= 0 && cc >= 0 && rr < rows && cc < cols && tents[rr * cols + cc]) {
          clear = false
          break
        }
      }
    }
    if (!clear) continue
    tents[i] = true
    placed++
  }
  return placed === tentCount ? tents : null
}

function plant(rows: number, cols: number, tents: readonly boolean[], rng: StudioRng): boolean[] | null {
  const trees = new Array<boolean>(rows * cols).fill(false)
  const order = rng.shuffle(tents.flatMap((t, i) => (t ? [i] : [])))
  for (const i of order) {
    const r = Math.floor(i / cols)
    const c = i % cols
    const sides = [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ]
      .filter(([rr, cc]) => rr! >= 0 && cc! >= 0 && rr! < rows && cc! < cols)
      .map(([rr, cc]) => rr! * cols + cc!)
      .filter((k) => !tents[k] && !trees[k])
    if (sides.length === 0) return null
    trees[rng.pick(sides)] = true
  }
  return trees
}

/** A grid's own fingerprint: turned or mirrored, it is the same puzzle. */
export function hcSignature(puzzle: Pick<HcPuzzle, 'rows' | 'cols' | 'trees'>, tents: readonly boolean[]): string {
  const grid = Array.from({ length: puzzle.rows }, (_, r) =>
    Array.from({ length: puzzle.cols }, (_, c) => {
      const i = r * puzzle.cols + c
      return puzzle.trees[i] ? 'T' : tents[i] ? 'A' : '.'
    }),
  )
  return canonicalHash(canonicalGridForm(grid, (v) => v))
}

/**
 * One random grid of this size and tent count, kept only when the level's
 * steps solve it to exactly its tents. Null when this draw does not.
 */
export function drawHcCandidate(options: {
  rows: number
  cols: number
  tentCount: number
  rules: HcRules
  /** Refuse grids the basic steps alone finish. */
  beyondBasic?: boolean
  rng: StudioRng
}): HcBuilt | null {
  const { rows, cols, tentCount, rules, beyondBasic = false, rng } = options
  const tents = pitch(rows, cols, tentCount, rng)
  if (!tents) return null
  const trees = plant(rows, cols, tents, rng)
  if (!trees) return null
  const { rowCounts, colCounts } = hcCounts(rows, cols, tents)
  const puzzle: HcPuzzle = { rows, cols, trees, rowCounts, colCounts }
  const solve = solveHc(puzzle, rules)
  if (!solve.solved) return null
  const found = tentsOf(solve.state)
  if (found.some((t, i) => t !== tents[i]) || !isHcSolution(puzzle, found)) return null
  if (beyondBasic && solveHc(puzzle, 'basic').solved) return null
  return { puzzle, tents, signature: hcSignature(puzzle, tents) }
}

/**
 * A grid for the level from this stream: random draws until one is solved
 * by exactly the level's steps, or null when none is within the budget.
 */
export function buildHcGrid(options: {
  size: number
  minTents: number
  maxTents: number
  rules: HcRules
  beyondBasic: boolean
  rng: StudioRng
  /** Grids already refused for this page (by signature). */
  exclude?: ReadonlySet<string>
}): HcBuilt | null {
  const { size, minTents, maxTents, rules, beyondBasic, rng, exclude } = options
  for (let k = 0; k < HC_CANDIDATES; k++) {
    const tentCount = rng.int(minTents, maxTents)
    const built = drawHcCandidate({ rows: size, cols: size, tentCount, rules, beyondBasic, rng })
    if (built && !exclude?.has(built.signature)) return built
  }
  return null
}
