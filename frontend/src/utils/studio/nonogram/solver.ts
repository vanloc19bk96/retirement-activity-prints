import type { LineSolveTrace, SolveResult } from './types'

/** 0 = unknown, 1 = filled, -1 = empty */
type Cell = 0 | 1 | -1

/** Return `false` from a visitor to stop enumeration early. */
type PlacementVisitor = (line: readonly boolean[]) => boolean | void

function blocksOf(clue: readonly number[]): readonly number[] {
  return clue.length === 1 && clue[0] === 0 ? [] : clue
}

/**
 * Walk every valid boolean placement for a clue on a line of `length`,
 * optionally constrained by known cells (null = free, true/false fixed).
 *
 * Callback form rather than an array: the generator rejects most candidates,
 * and materialising millions of throwaway lines dominated the build loop.
 * The visited array is reused — copy it if you need to keep it.
 */
export function eachLinePlacement(
  length: number,
  clue: readonly number[],
  known: readonly (boolean | null)[],
  visit: PlacementVisitor,
): void {
  const blocks = blocksOf(clue)
  const line: boolean[] = Array.from({ length }, () => false)
  let stopped = false

  // Minimum cells still needed after block `i` (its own length excluded).
  const tailNeed: number[] = Array.from({ length: blocks.length + 1 }, () => 0)
  for (let i = blocks.length - 1; i >= 0; i--) {
    tailNeed[i] = tailNeed[i + 1]! + blocks[i]! + (i + 1 < blocks.length ? 1 : 0)
  }

  function place(blockIndex: number, start: number): void {
    if (stopped) return
    if (blockIndex === blocks.length) {
      for (let i = start; i < length; i++) {
        if (known[i] === true) return
        line[i] = false
      }
      if (visit(line) === false) stopped = true
      return
    }

    const block = blocks[blockIndex]!
    const maxStart = length - block - tailNeed[blockIndex + 1]!

    for (let s = start; s <= maxStart; s++) {
      if (stopped) return
      let ok = true
      for (let i = start; i < s; i++) {
        if (known[i] === true) {
          ok = false
          break
        }
        line[i] = false
      }
      // A known-filled cell before `s` can never be skipped by a later start.
      if (!ok) return

      for (let i = s; i < s + block; i++) {
        if (known[i] === false) {
          ok = false
          break
        }
        line[i] = true
      }
      if (!ok) continue

      const next = s + block
      if (next < length) {
        if (known[next] === true) continue
        line[next] = false
        place(blockIndex + 1, next + 1)
      } else {
        place(blockIndex + 1, next)
      }
    }
  }

  place(0, 0)
}

/** Materialised form of {@link eachLinePlacement}. */
export function enumerateLinePlacements(
  length: number,
  clue: readonly number[],
  known: readonly (boolean | null)[] = Array.from({ length }, () => null),
): boolean[][] {
  const placements: boolean[][] = []
  eachLinePlacement(length, clue, known, (line) => {
    placements.push([...line])
  })
  return placements
}

/**
 * Cells forced by intersecting all valid placements. null = contradiction.
 *
 * Intersects incrementally and bails as soon as every free cell is ambiguous,
 * so heavily fragmented lines cost a few placements instead of all of them.
 */
export function forcedLineCells(
  length: number,
  clue: readonly number[],
  known: readonly (boolean | null)[],
): (boolean | null)[] | null {
  const everTrue: boolean[] = Array.from({ length }, () => false)
  const everFalse: boolean[] = Array.from({ length }, () => false)
  let free = 0
  for (let i = 0; i < length; i++) if (known[i] === null) free++

  let any = false
  let undecided = 0
  eachLinePlacement(length, clue, known, (line) => {
    any = true
    undecided = 0
    for (let i = 0; i < length; i++) {
      if (line[i]) everTrue[i] = true
      else everFalse[i] = true
      if (known[i] === null && everTrue[i] && everFalse[i]) undecided++
    }
    // Nothing left to learn from further placements.
    if (undecided === free) return false
    return true
  })
  if (!any) return null

  const out: (boolean | null)[] = Array.from({ length }, () => null)
  for (let i = 0; i < length; i++) {
    if (known[i] !== null) {
      out[i] = known[i]!
      continue
    }
    out[i] = everTrue[i] && everFalse[i] ? null : everTrue[i]!
  }
  return out
}

function toKnown(grid: Cell[][], row: number, size: number): (boolean | null)[] {
  return Array.from({ length: size }, (_, c) => {
    const v = grid[row]![c]!
    if (v === 1) return true
    if (v === -1) return false
    return null
  })
}

function toKnownCol(grid: Cell[][], col: number, size: number): (boolean | null)[] {
  return Array.from({ length: size }, (_, r) => {
    const v = grid[r]![col]!
    if (v === 1) return true
    if (v === -1) return false
    return null
  })
}

function applyForced(
  grid: Cell[][],
  forced: (boolean | null)[],
  isRow: boolean,
  index: number,
): boolean | 'contradiction' {
  let changed = false
  for (let i = 0; i < forced.length; i++) {
    const f = forced[i]
    if (f === null) continue
    const r = isRow ? index : i
    const c = isRow ? i : index
    const next: Cell = f ? 1 : -1
    const cur = grid[r]![c]!
    if (cur === 0) {
      grid[r]![c] = next
      changed = true
    } else if (cur !== next) {
      return 'contradiction'
    }
  }
  return changed
}

function knownCount(grid: Cell[][]): number {
  let n = 0
  for (const row of grid) {
    for (const cell of row) if (cell !== 0) n++
  }
  return n
}

/** One row sweep + one column sweep. Returns false on contradiction. */
function sweep(
  grid: Cell[][],
  rowClues: number[][],
  colClues: number[][],
): boolean | 'contradiction' {
  const size = grid.length
  let changed = false
  for (let r = 0; r < size; r++) {
    const forced = forcedLineCells(size, rowClues[r]!, toKnown(grid, r, size))
    if (!forced) return 'contradiction'
    const result = applyForced(grid, forced, true, r)
    if (result === 'contradiction') return 'contradiction'
    if (result) changed = true
  }
  for (let c = 0; c < size; c++) {
    const forced = forcedLineCells(size, colClues[c]!, toKnownCol(grid, c, size))
    if (!forced) return 'contradiction'
    const result = applyForced(grid, forced, false, c)
    if (result === 'contradiction') return 'contradiction'
    if (result) changed = true
  }
  return changed
}

/** Propagate line constraints to a fixpoint. Returns false on contradiction. */
export function propagate(
  grid: Cell[][],
  rowClues: number[][],
  colClues: number[][],
): boolean {
  for (;;) {
    const result = sweep(grid, rowClues, colClues)
    if (result === 'contradiction') return false
    if (!result) return true
  }
}

function emptyGrid(size: number): Cell[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, (): Cell => 0),
  )
}

function isComplete(grid: Cell[][]): boolean {
  for (const row of grid) {
    for (const cell of row) if (cell === 0) return false
  }
  return true
}

function cloneGrid(grid: Cell[][]): Cell[][] {
  return grid.map((row) => [...row])
}

function findUnknown(grid: Cell[][]): { r: number; c: number } | null {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r]!.length; c++) {
      if (grid[r]![c] === 0) return { r, c }
    }
  }
  return null
}

/**
 * Solve by line logic alone and report how much work it took.
 *
 * `solved` is the generator's acceptance test: propagation only ever applies
 * deductions true of *every* solution, so a grid it fills completely has
 * exactly one solution AND needs no guessing. The counting solver below stays
 * as an independent check for tests.
 */
export function traceLineSolve(
  rowClues: number[][],
  colClues: number[][],
  size: number,
): LineSolveTrace {
  const grid = emptyGrid(size)
  let rounds = 0
  let openingCells = 0

  for (;;) {
    const result = sweep(grid, rowClues, colClues)
    if (result === 'contradiction') return { solved: false, rounds, openingCells }
    rounds++
    if (rounds === 1) openingCells = knownCount(grid)
    if (isComplete(grid)) return { solved: true, rounds, openingCells }
    if (!result) return { solved: false, rounds, openingCells }
  }
}

/**
 * Count solutions up to `cap`. `forcedOnly` is true when line logic alone
 * fills the entire grid (no backtracking needed).
 */
export function solveAndCount(
  rowClues: number[][],
  colClues: number[][],
  size: number,
  cap: number,
): SolveResult {
  const grid = emptyGrid(size)

  if (!propagate(grid, rowClues, colClues)) {
    return { count: 0, forcedOnly: false }
  }

  if (isComplete(grid)) {
    return { count: 1, forcedOnly: true }
  }

  let count = 0

  function search(current: Cell[][]): void {
    if (count >= cap) return
    if (!propagate(current, rowClues, colClues)) return
    if (isComplete(current)) {
      count++
      return
    }
    const unknown = findUnknown(current)
    if (!unknown) return

    for (const guess of [1, -1] as const) {
      if (count >= cap) return
      const next = cloneGrid(current)
      next[unknown.r]![unknown.c] = guess
      search(next)
    }
  }

  search(cloneGrid(grid))
  return { count, forcedOnly: false }
}

/** Solve by forced logic only; returns bitmap or null if incomplete/contradiction. */
export function solveForcedOnly(
  rowClues: number[][],
  colClues: number[][],
  size: number,
): boolean[][] | null {
  const grid = emptyGrid(size)
  if (!propagate(grid, rowClues, colClues)) return null
  if (!isComplete(grid)) return null
  return grid.map((row) => row.map((c) => c === 1))
}
