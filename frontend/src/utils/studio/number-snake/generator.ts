import type { StudioRng } from '../studio-rng'

export type SnakeAdjacency = 'orthogonal' | 'diagonal'
export type SnakeDifficulty = 'easy' | 'medium' | 'hard'
export type SnakeSize = 5 | 6 | 7 | 8 | 9 | 10

export interface SnakeCell {
  r: number
  c: number
}

export interface SnakePuzzle {
  rows: number
  cols: number
  solution: number[][]
  given: boolean[][]
}

const ORTHO_DIRS: readonly [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

const DIAG_DIRS: readonly [number, number][] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
]

/** Clue density ≈ difficulty; uniqueness may leave more clues. */
const CLUE_RATIO: Record<SnakeDifficulty, number> = {
  easy: 0.5,
  medium: 0.35,
  hard: 0.22,
}

const PATH_ATTEMPTS = 80
const PATH_BACKTRACK_BUDGET = 50_000

export function dirsFor(adj: SnakeAdjacency): readonly [number, number][] {
  return adj === 'orthogonal' ? ORTHO_DIRS : DIAG_DIRS
}

export function targetClueCount(size: number, difficulty: SnakeDifficulty): number {
  const n = size * size
  return Math.max(2, Math.round(n * CLUE_RATIO[difficulty]))
}

export function isInBounds(r: number, c: number, rows: number, cols: number): boolean {
  return r >= 0 && r < rows && c >= 0 && c < cols
}

export function areAdjacent(a: SnakeCell, b: SnakeCell, adj: SnakeAdjacency): boolean {
  const dr = Math.abs(a.r - b.r)
  const dc = Math.abs(a.c - b.c)
  if (dr === 0 && dc === 0) return false
  if (adj === 'orthogonal') return dr + dc === 1
  return dr <= 1 && dc <= 1
}

function neighborCells(
  r: number,
  c: number,
  rows: number,
  cols: number,
  adj: SnakeAdjacency,
): SnakeCell[] {
  const out: SnakeCell[] = []
  for (const [dr, dc] of dirsFor(adj)) {
    const nr = r + dr
    const nc = c + dc
    if (isInBounds(nr, nc, rows, cols)) out.push({ r: nr, c: nc })
  }
  return out
}

export function invertSolution(solution: number[][], n: number): SnakeCell[] {
  const cells: SnakeCell[] = Array.from({ length: n + 1 }, () => ({ r: -1, c: -1 }))
  for (let r = 0; r < solution.length; r++) {
    for (let c = 0; c < solution[r]!.length; c++) {
      cells[solution[r]![c]!] = { r, c }
    }
  }
  return cells
}

export function usesEachNumberOnce(solution: number[][], n: number): boolean {
  const seen = new Set<number>()
  for (const row of solution) {
    for (const v of row) {
      if (v < 1 || v > n || seen.has(v)) return false
      seen.add(v)
    }
  }
  return seen.size === n
}

export function consecutiveAlwaysAdjacent(
  solution: number[][],
  rows: number,
  cols: number,
  adj: SnakeAdjacency,
): boolean {
  const n = rows * cols
  const cells = invertSolution(solution, n)
  for (let k = 1; k < n; k++) {
    if (!areAdjacent(cells[k]!, cells[k + 1]!, adj)) return false
  }
  return true
}

/**
 * Randomized Warnsdorff backtracking — prefer neighbours with fewest onward options.
 */
export function generateHamiltonianPath(
  rows: number,
  cols: number,
  adj: SnakeAdjacency,
  rng: StudioRng,
): number[][] {
  const n = rows * cols
  const starts = rng.shuffle(
    Array.from({ length: n }, (_, i) => ({ r: Math.floor(i / cols), c: i % cols })),
  )

  for (let attempt = 0; attempt < PATH_ATTEMPTS; attempt++) {
    const start = starts[attempt % starts.length]!
    const path = tryPathFrom(start, rows, cols, adj, rng)
    if (!path) continue
    const solution = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0))
    for (let i = 0; i < path.length; i++) {
      solution[path[i]!.r]![path[i]!.c] = i + 1
    }
    return solution
  }
  throw new Error(`Failed to generate Hamiltonian path for ${rows}×${cols} (${adj})`)
}

function tryPathFrom(
  start: SnakeCell,
  rows: number,
  cols: number,
  adj: SnakeAdjacency,
  rng: StudioRng,
): SnakeCell[] | null {
  const n = rows * cols
  const visited = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false))
  const path: SnakeCell[] = []
  let steps = 0

  function degree(r: number, c: number): number {
    let d = 0
    for (const [dr, dc] of dirsFor(adj)) {
      const nr = r + dr
      const nc = c + dc
      if (isInBounds(nr, nc, rows, cols) && !visited[nr]![nc]) d++
    }
    return d
  }

  function dfs(r: number, c: number): boolean {
    if (++steps > PATH_BACKTRACK_BUDGET) return false
    visited[r]![c] = true
    path.push({ r, c })
    if (path.length === n) return true

    const neigh = neighborCells(r, c, rows, cols, adj).filter((cell) => !visited[cell.r]![cell.c])
    const ranked = rng.shuffle(neigh).sort((a, b) => degree(a.r, a.c) - degree(b.r, b.c))
    for (const next of ranked) {
      if (dfs(next.r, next.c)) return true
    }
    visited[r]![c] = false
    path.pop()
    return false
  }

  return dfs(start.r, start.c) ? path : null
}

/** Node budget for uniqueness checks — overrun ⇒ treat as non-unique (keep the clue). */
const SOLVER_NODE_BUDGET = 250_000

/**
 * Count completions of the clue mask, capped at `cap` (usually 2 for uniqueness).
 * Fills gaps between consecutive clues with exact-length paths (Hidato-style).
 */
export function countSnakeSolutions(
  solution: number[][],
  given: boolean[][],
  rows: number,
  cols: number,
  adj: SnakeAdjacency,
  cap: number,
): number {
  const n = rows * cols
  const posOf: (SnakeCell | null)[] = Array.from({ length: n + 1 }, () => null)
  const occupied = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false))

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!given[r]![c]) continue
      const v = solution[r]![c]!
      posOf[v] = { r, c }
      occupied[r]![c] = true
    }
  }
  if (!posOf[1] || !posOf[n]) return 0

  const known: number[] = []
  for (let v = 1; v <= n; v++) {
    if (posOf[v]) known.push(v)
  }

  let count = 0
  let nodes = 0

  function searchGap(gapIndex: number): void {
    if (count >= cap || nodes > SOLVER_NODE_BUDGET) return
    if (gapIndex >= known.length - 1) {
      count++
      return
    }

    const a = known[gapIndex]!
    const b = known[gapIndex + 1]!
    const dist = b - a
    const start = posOf[a]!
    const end = posOf[b]!

    function walk(r: number, c: number, remaining: number): void {
      if (count >= cap || ++nodes > SOLVER_NODE_BUDGET) return
      if (remaining === 0) {
        if (r === end.r && c === end.c) searchGap(gapIndex + 1)
        return
      }

      for (const next of neighborCells(r, c, rows, cols, adj)) {
        if (remaining === 1) {
          if (next.r === end.r && next.c === end.c) walk(next.r, next.c, 0)
          continue
        }
        if (occupied[next.r]![next.c]) continue
        occupied[next.r]![next.c] = true
        walk(next.r, next.c, remaining - 1)
        occupied[next.r]![next.c] = false
        if (count >= cap || nodes > SOLVER_NODE_BUDGET) return
      }
    }

    walk(start.r, start.c, dist)
  }

  searchGap(0)
  // Budget overrun: not proven unique — report ≥2 so carver keeps the clue.
  if (nodes > SOLVER_NODE_BUDGET) return Math.max(count, 2)
  return count
}

export function carveClues(
  solution: number[][],
  rows: number,
  cols: number,
  adj: SnakeAdjacency,
  targetClues: number,
  rng: StudioRng,
): boolean[][] {
  const n = rows * cols
  const given = Array.from({ length: rows }, () => Array.from({ length: cols }, () => true))
  const cells = invertSolution(solution, n)
  // Always keep endpoints 1 and N.
  const removable = rng.shuffle(
    Array.from({ length: n }, (_, i) => i + 1).filter((v) => v !== 1 && v !== n),
  )

  let count = n
  for (const value of removable) {
    if (count <= targetClues) break
    const { r, c } = cells[value]!
    given[r]![c] = false
    if (countSnakeSolutions(solution, given, rows, cols, adj, 2) === 1) {
      count--
    } else {
      given[r]![c] = true
    }
  }
  return given
}

export function buildSnakePuzzle(
  rows: number,
  cols: number,
  adj: SnakeAdjacency,
  difficulty: SnakeDifficulty,
  rng: StudioRng,
): SnakePuzzle {
  const solution = generateHamiltonianPath(rows, cols, adj, rng)
  const target = targetClueCount(rows, difficulty)
  const given = carveClues(solution, rows, cols, adj, target, rng)
  return { rows, cols, solution, given }
}
