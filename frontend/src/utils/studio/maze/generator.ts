import type { StudioRng } from '../studio-rng'

export type MazeDifficulty = 'easy' | 'medium' | 'hard'

export interface MazeCell {
  r: number
  c: number
}

export interface MazeGrid {
  rows: number
  cols: number
  /** hWalls[r][c] — wall on the TOP edge of cell (r, c). r spans 0..rows. */
  hWalls: boolean[][]
  /** vWalls[r][c] — wall on the LEFT edge of cell (r, c). c spans 0..cols. */
  vWalls: boolean[][]
}

export interface MazePuzzle extends MazeGrid {
  start: MazeCell
  finish: MazeCell
  /** The one corridor path from start to finish, inclusive of both ends. */
  solution: MazeCell[]
}

/** Direction deltas: 0 up, 1 right, 2 down, 3 left. */
const DR = [-1, 0, 1, 0]
const DC = [0, 1, 0, -1]

interface DifficultyProfile {
  /** Chance of continuing straight when carving — high = long readable corridors. */
  straightness: number
  /** Where the chosen maze sits in the candidates ranked by solution length. */
  lengthQuantile: number
}

const PROFILES: Record<MazeDifficulty, DifficultyProfile> = {
  easy: { straightness: 0.85, lengthQuantile: 0.05 },
  medium: { straightness: 0.5, lengthQuantile: 0.5 },
  hard: { straightness: 0.1, lengthQuantile: 0.95 },
}

/**
 * Mazes carved per puzzle before one is picked. Reachable solution lengths
 * shrink as the grid grows, so difficulty is a rank within this sample rather
 * than a fixed target — it then means the same thing at every size.
 */
const CANDIDATES = 24

function grid<T>(rows: number, cols: number, value: T): T[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => value))
}

function removeWall(g: MazeGrid, from: MazeCell, dir: number): void {
  if (dir === 0) g.hWalls[from.r]![from.c] = false
  else if (dir === 2) g.hWalls[from.r + 1]![from.c] = false
  else if (dir === 3) g.vWalls[from.r]![from.c] = false
  else g.vWalls[from.r]![from.c + 1] = false
}

export function hasWall(g: MazeGrid, cell: MazeCell, dir: number): boolean {
  if (dir === 0) return g.hWalls[cell.r]![cell.c]!
  if (dir === 2) return g.hWalls[cell.r + 1]![cell.c]!
  if (dir === 3) return g.vWalls[cell.r]![cell.c]!
  return g.vWalls[cell.r]![cell.c + 1]!
}

/**
 * Randomised depth-first carving (recursive backtracker) over a full wall grid.
 * Every cell is visited exactly once, so the corridors form a spanning tree:
 * any two cells are joined by exactly one path — the puzzle always has one answer.
 * `straightness` biases the walk toward continuing in the current direction,
 * which trades twisty junction-heavy mazes for long, scannable corridors.
 */
export function carveMaze(
  rows: number,
  cols: number,
  straightness: number,
  rng: StudioRng,
): MazeGrid {
  const g: MazeGrid = {
    rows,
    cols,
    hWalls: grid(rows + 1, cols, true),
    vWalls: grid(rows, cols + 1, true),
  }
  const visited = grid(rows, cols, false)
  const start: MazeCell = { r: rng.int(0, rows - 1), c: rng.int(0, cols - 1) }
  visited[start.r]![start.c] = true

  const stack: { cell: MazeCell; dir: number }[] = [{ cell: start, dir: -1 }]

  while (stack.length > 0) {
    const top = stack[stack.length - 1]!
    const open: number[] = []
    for (let dir = 0; dir < 4; dir++) {
      const r = top.cell.r + DR[dir]!
      const c = top.cell.c + DC[dir]!
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue
      if (!visited[r]![c]) open.push(dir)
    }
    if (open.length === 0) {
      stack.pop()
      continue
    }

    const straightAhead = open.includes(top.dir) && rng.chance(straightness)
    const dir = straightAhead ? top.dir : rng.pick(open)
    const next: MazeCell = { r: top.cell.r + DR[dir]!, c: top.cell.c + DC[dir]! }
    removeWall(g, top.cell, dir)
    visited[next.r]![next.c] = true
    stack.push({ cell: next, dir })
  }

  return g
}

/**
 * The single corridor path between two cells. Depth-first is enough because the
 * carved maze is a tree — the first route found is the only route.
 */
export function solveMaze(g: MazeGrid, start: MazeCell, finish: MazeCell): MazeCell[] {
  const seen = grid(g.rows, g.cols, false)
  const path: MazeCell[] = []

  const walk = (cell: MazeCell): boolean => {
    seen[cell.r]![cell.c] = true
    path.push(cell)
    if (cell.r === finish.r && cell.c === finish.c) return true
    for (let dir = 0; dir < 4; dir++) {
      if (hasWall(g, cell, dir)) continue
      const r = cell.r + DR[dir]!
      const c = cell.c + DC[dir]!
      if (r < 0 || r >= g.rows || c < 0 || c >= g.cols) continue
      if (seen[r]![c]) continue
      if (walk({ r, c })) return true
    }
    path.pop()
    return false
  }

  walk(start)
  return path
}

/**
 * Carve a batch of candidates, keep the one whose solution length matches the
 * difficulty, then open the entrance and exit. Ranking cannot fail, so every
 * seed yields a valid maze.
 */
export function buildMaze(
  rows: number,
  cols: number,
  difficulty: MazeDifficulty,
  rng: StudioRng,
): MazePuzzle {
  const { straightness, lengthQuantile } = PROFILES[difficulty]
  const start: MazeCell = { r: 0, c: 0 }
  const finish: MazeCell = { r: rows - 1, c: cols - 1 }

  const candidates = Array.from({ length: CANDIDATES }, () => {
    const grid = carveMaze(rows, cols, straightness, rng)
    return { grid, solution: solveMaze(grid, start, finish) }
  })
  // Stable sort — equal lengths keep carve order, so the pick stays deterministic.
  candidates.sort((a, b) => a.solution.length - b.solution.length)
  const { grid: g, solution } =
    candidates[Math.round(lengthQuantile * (CANDIDATES - 1))]!
  // Openings in the outer wall — drawn after solving so they cannot create a
  // second route through the border.
  g.hWalls[0]![start.c] = false
  g.hWalls[rows]![finish.c] = false

  return { ...g, start, finish, solution }
}

/** Cells whose only open side is the one they were entered from. */
export function countDeadEnds(g: MazeGrid): number {
  let total = 0
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      let open = 0
      for (let dir = 0; dir < 4; dir++) {
        if (!hasWall(g, { r, c }, dir)) open++
      }
      if (open === 1) total++
    }
  }
  return total
}

/**
 * True when corridors form a spanning tree: every cell reachable and exactly
 * cells-1 openings. Equivalent to “exactly one solution”.
 */
export function isPerfectMaze(g: MazeGrid): boolean {
  const cells = g.rows * g.cols
  let openings = 0
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      if (!hasWall(g, { r, c }, 1) && c + 1 < g.cols) openings++
      if (!hasWall(g, { r, c }, 2) && r + 1 < g.rows) openings++
    }
  }
  if (openings !== cells - 1) return false

  const seen = grid(g.rows, g.cols, false)
  const stack: MazeCell[] = [{ r: 0, c: 0 }]
  seen[0]![0] = true
  let reached = 1
  while (stack.length > 0) {
    const cell = stack.pop()!
    for (let dir = 0; dir < 4; dir++) {
      if (hasWall(g, cell, dir)) continue
      const r = cell.r + DR[dir]!
      const c = cell.c + DC[dir]!
      if (r < 0 || r >= g.rows || c < 0 || c >= g.cols) continue
      if (seen[r]![c]) continue
      seen[r]![c] = true
      reached++
      stack.push({ r, c })
    }
  }
  return reached === cells
}
