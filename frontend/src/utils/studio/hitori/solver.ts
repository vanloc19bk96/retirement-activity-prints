import { isValidHitoriSolution } from './rules'
import type { Shading } from './types'
import {
  type Cell,
  applyForcedDeductions,
  cloneState,
  isComplete,
  setShaded,
  setWhite,
  toShading,
} from './forced'

export { applyForcedDeductions } from './forced'

function pickBranchCell(
  grid: number[][],
  state: Cell[][],
  n: number,
): [number, number] | null {
  let best: [number, number] | null = null
  let bestScore = -1
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (state[r]![c] !== 0) continue
      const v = grid[r]![c]!
      let score = 0
      for (let cc = 0; cc < n; cc++) {
        if (cc !== c && grid[r]![cc] === v) score++
      }
      for (let rr = 0; rr < n; rr++) {
        if (rr !== r && grid[rr]![c] === v) score++
      }
      if (score > bestScore) {
        bestScore = score
        best = [r, c]
      }
    }
  }
  return best
}

const MAX_SEARCH_NODES = 80_000

function search(
  grid: number[][],
  state: Cell[][],
  n: number,
  cap: number,
  nodes: { n: number },
): number {
  if (nodes.n++ > MAX_SEARCH_NODES) return cap
  if (!applyForcedDeductions(grid, state, n)) return 0

  if (isComplete(state, n)) {
    return isValidHitoriSolution(grid, toShading(state, n), n) ? 1 : 0
  }

  const cell = pickBranchCell(grid, state, n)
  if (!cell) return 0
  const [r, c] = cell

  let count = 0
  for (const shade of [true, false]) {
    const next = cloneState(state)
    const ok = shade ? setShaded(next, n, r, c) : setWhite(next, r, c)
    if (!ok) continue
    count += search(grid, next, n, cap - count, nodes)
    if (count >= cap) return count
  }
  return count
}

/** Count valid shadings up to `cap` (typically 2 for uniqueness). */
export function countHitoriSolutions(
  grid: number[][],
  n: number,
  cap: number,
): number {
  const state: Cell[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => 0 as Cell),
  )
  return search(grid, state, n, cap, { n: 0 })
}

/** Return the unique forced shading, or null if deductions don't complete. */
export function getForcedShading(grid: number[][], n: number): Shading | null {
  const state: Cell[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => 0 as Cell),
  )
  if (!applyForcedDeductions(grid, state, n)) return null
  if (!isComplete(state, n)) return null
  const shading = toShading(state, n)
  if (!isValidHitoriSolution(grid, shading, n)) return null
  return shading
}

/** True when forced deductions alone fully solve the puzzle. */
export function isForcedOnlySolvable(grid: number[][], n: number): boolean {
  return getForcedShading(grid, n) !== null
}

function shadingsEqual(a: Shading, b: Shading, n: number): boolean {
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (a[r]![c] !== b[r]![c]) return false
    }
  }
  return true
}

/** Forced-only solution that matches the intended shading. */
export function isForcedSolution(
  grid: number[][],
  shading: Shading,
  n: number,
): boolean {
  const forced = getForcedShading(grid, n)
  return forced !== null && shadingsEqual(forced, shading, n)
}
