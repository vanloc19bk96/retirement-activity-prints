import type { StudioRng } from '../studio-rng'
import { remainingDigitsForRun } from './combos'
import type { KakuroCellKind, KakuroTopology } from './topologies'

export interface KakuroCell {
  r: number
  c: number
}

export interface KakuroRun {
  cells: KakuroCell[]
  direction: 'across' | 'down'
  sum: number
}

export interface KakuroPuzzle {
  grid: number[][]
  runs: KakuroRun[]
  /** Visible starter digits (0 = blank). Ensures uniqueness when sums alone are not enough. */
  givens: number[][]
}

export interface ClueSums {
  down?: number
  across?: number
}

export function extractRuns(cells: KakuroCellKind[][], size: number): KakuroRun[] {
  const runs: KakuroRun[] = []

  for (let r = 0; r < size; r++) {
    let run: KakuroCell[] = []
    for (let c = 0; c <= size; c++) {
      if (c < size && cells[r][c] === 'white') run.push({ r, c })
      else {
        if (run.length >= 2) runs.push({ cells: run, direction: 'across', sum: 0 })
        run = []
      }
    }
  }

  for (let c = 0; c < size; c++) {
    let run: KakuroCell[] = []
    for (let r = 0; r <= size; r++) {
      if (r < size && cells[r][c] === 'white') run.push({ r, c })
      else {
        if (run.length >= 2) runs.push({ cells: run, direction: 'down', sum: 0 })
        run = []
      }
    }
  }

  for (const run of runs) {
    if (run.cells.length < 2 || run.cells.length > 9) {
      throw new Error(`Kakuro run length ${run.cells.length} out of [2,9] — corrupt topology`)
    }
  }
  return runs
}

interface RunIndex {
  across: (KakuroRun | null)[][]
  down: (KakuroRun | null)[][]
}

function indexRunsByCell(runs: KakuroRun[], size: number): RunIndex {
  const across: (KakuroRun | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null),
  )
  const down: (KakuroRun | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null),
  )
  for (const run of runs) {
    for (const { r, c } of run.cells) {
      if (run.direction === 'across') across[r][c] = run
      else down[r][c] = run
    }
  }
  return { across, down }
}

function digitUsedInRun(
  grid: number[][],
  run: KakuroRun | null,
  val: number,
  skipR: number,
  skipC: number,
): boolean {
  if (!run) return false
  for (const { r, c } of run.cells) {
    if (r === skipR && c === skipC) continue
    if (grid[r][c] === val) return true
  }
  return false
}

function fitsNoRepeat(
  grid: number[][],
  r: number,
  c: number,
  val: number,
  runsByCell: RunIndex,
): boolean {
  if (digitUsedInRun(grid, runsByCell.across[r][c], val, r, c)) return false
  if (digitUsedInRun(grid, runsByCell.down[r][c], val, r, c)) return false
  return true
}

function emptyPlayGrid(cells: KakuroCellKind[][]): number[][] {
  return cells.map((row) => row.map((kind) => (kind === 'black' ? -1 : 0)))
}

function whiteCellsOf(cells: KakuroCellKind[][], size: number): KakuroCell[] {
  const out: KakuroCell[] = []
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (cells[r][c] === 'white') out.push({ r, c })
    }
  }
  return out
}

function sumOf(run: KakuroRun, grid: number[][]): number {
  return run.cells.reduce((total, { r, c }) => total + grid[r][c], 0)
}

function placedInRun(grid: number[][], run: KakuroRun): number[] {
  const placed: number[] = []
  for (const { r, c } of run.cells) {
    const v = grid[r][c]
    if (v > 0) placed.push(v)
  }
  return placed
}

/** Candidate digit bitmask; supports cells that belong to only one run direction. */
function candidateMask(
  grid: number[][],
  r: number,
  c: number,
  runsByCell: RunIndex,
): number {
  const across = runsByCell.across[r][c]
  const down = runsByCell.down[r][c]
  if (!across && !down) return 0

  let mask = 0b1111111110 // bits 1–9
  if (across) {
    mask &= remainingDigitsForRun(
      across.cells.length,
      across.sum,
      placedInRun(grid, across),
    )
  }
  if (down) {
    mask &= remainingDigitsForRun(down.cells.length, down.sum, placedInRun(grid, down))
  }

  for (let d = 1; d <= 9; d++) {
    if ((mask & (1 << d)) === 0) continue
    if (!fitsNoRepeat(grid, r, c, d, runsByCell)) mask &= ~(1 << d)
  }
  return mask
}

/** Fill white cells with distinct-in-run digits; sums are derived afterward. */
export function fillGrid(topology: KakuroTopology, rng: StudioRng): number[][] {
  const { size, cells } = topology
  const grid = emptyPlayGrid(cells)
  const runsByCell = indexRunsByCell(extractRuns(cells, size), size)

  function fill(pos: number): boolean {
    if (pos === size * size) return true
    const r = Math.floor(pos / size)
    const c = pos % size
    if (grid[r][c] === -1) return fill(pos + 1)

    for (const val of rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      if (!fitsNoRepeat(grid, r, c, val, runsByCell)) continue
      grid[r][c] = val
      if (fill(pos + 1)) return true
      grid[r][c] = 0
    }
    return false
  }

  if (!fill(0)) throw new Error(`Kakuro fill failed for topology ${topology.id}`)
  return grid
}

/** Count solutions up to `cap`. Optional `givens` pre-fill white cells. */
export function countSolutions(
  topology: KakuroTopology,
  runs: KakuroRun[],
  cap: number,
  givens?: number[][],
): number {
  const { size, cells } = topology
  const grid = emptyPlayGrid(cells)
  if (givens) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (givens[r][c] > 0) grid[r][c] = givens[r][c]
      }
    }
  }

  const runsByCell = indexRunsByCell(runs, size)
  const whites = whiteCellsOf(cells, size)
  let count = 0

  function solve(): boolean {
    if (count >= cap) return true

    let best = -1
    let bestMask = 0
    let bestCount = 10

    for (let i = 0; i < whites.length; i++) {
      const { r, c } = whites[i]
      if (grid[r][c] !== 0) continue
      const mask = candidateMask(grid, r, c, runsByCell)
      if (mask === 0) return false
      let n = 0
      for (let d = 1; d <= 9; d++) if (mask & (1 << d)) n++
      if (n < bestCount) {
        best = i
        bestMask = mask
        bestCount = n
        if (n === 1) break
      }
    }

    if (best < 0) {
      count++
      return count >= cap
    }

    const { r, c } = whites[best]
    for (let d = 1; d <= 9; d++) {
      if ((bestMask & (1 << d)) === 0) continue
      grid[r][c] = d
      if (solve()) return true
      grid[r][c] = 0
    }
    return false
  }

  solve()
  return count
}

function blankGivens(cells: KakuroCellKind[][]): number[][] {
  return cells.map((row) => row.map((kind) => (kind === 'black' ? -1 : 0)))
}

/** Reveal starter digits until sum clues + givens have exactly one solution. */
function enforceUniqueness(
  topology: KakuroTopology,
  runs: KakuroRun[],
  solution: number[][],
  rng: StudioRng,
): number[][] {
  const givens = blankGivens(topology.cells)
  if (countSolutions(topology, runs, 2, givens) === 1) return givens

  for (const { r, c } of rng.shuffle(whiteCellsOf(topology.cells, topology.size))) {
    givens[r][c] = solution[r][c]
    if (countSolutions(topology, runs, 2, givens) === 1) return givens
  }

  throw new Error(`Kakuro uniqueness enforcement failed for topology ${topology.id}`)
}

export function generatePuzzle(
  topology: KakuroTopology,
  rng: StudioRng,
  maxAttempts = 20,
): KakuroPuzzle {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const grid = fillGrid(topology, rng)
    const runs = extractRuns(topology.cells, topology.size)
    for (const run of runs) run.sum = sumOf(run, grid)
    try {
      const givens = enforceUniqueness(topology, runs, grid, rng)
      return { grid, runs, givens }
    } catch {
      // try another fill
    }
  }
  throw new Error(
    `Could not generate a uniquely-solvable Kakuro for topology ${topology.id} after ${maxAttempts} attempts`,
  )
}

/** Map clue-cell (black cell before each run) → across/down sums. */
export function indexClueSumsByCell(runs: KakuroRun[]): Map<string, ClueSums> {
  const map = new Map<string, ClueSums>()
  for (const run of runs) {
    const first = run.cells[0]!
    const cr = run.direction === 'across' ? first.r : first.r - 1
    const cc = run.direction === 'across' ? first.c - 1 : first.c
    const key = `${cr},${cc}`
    const entry = map.get(key) ?? {}
    if (run.direction === 'across') entry.across = run.sum
    else entry.down = run.sum
    map.set(key, entry)
  }
  return map
}
