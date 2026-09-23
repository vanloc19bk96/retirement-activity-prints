import type { StudioRng } from '../studio-rng'

/**
 * The maze itself, with no opinion about the page it prints on.
 *
 * Two promises hold this module together, and every level in `levels.ts` is
 * tuned inside them rather than against them:
 *
 * * **There is exactly one route.** Corridors are carved as a spanning tree, so
 *   any two cells are joined by one path and one only. A solver who reaches
 *   Finish has found *the* answer, and the key cannot disagree with the page.
 * * **The route is worth walking.** A tree alone guarantees nothing about the
 *   walk: the same carver can hand back a maze whose answer is a short
 *   staircase from one opening to the other. So a batch is carved, each is
 *   scored on how long its route runs and how many dead ends it hides, and the
 *   one closest to the level's shape is the one that prints.
 */

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
  /** Cell behind the gap in the top border. */
  start: MazeCell
  /** Cell behind the gap in the bottom border. */
  finish: MazeCell
  /** The one corridor path from start to finish, inclusive of both ends. */
  solution: MazeCell[]
  /** Corners the route turns at — a straight run of twelve counts as one. */
  turns: number
  /** Cells with a single open side. What a solver has to back out of. */
  deadEnds: number
}

/** Direction deltas: 0 up, 1 right, 2 down, 3 left. */
const DR = [-1, 0, 1, 0]
const DC = [0, 1, 0, -1]

/**
 * How a level wants its maze to feel, in numbers the carver can act on.
 *
 * `routeShare` and `deadEndShare` are aims, not guarantees: a batch is carved
 * and the closest one wins, so a target no grid of that size can reach costs
 * nothing except that the nearest miss is chosen instead.
 */
export interface MazeProfile {
  /** Chance of carrying straight on while carving. High = long, scannable corridors. */
  straightness: number
  /** Route length the level aims for, as a share of the grid's cells. */
  routeShare: number
  /** Dead ends the level aims for, as a share of the grid's cells. */
  deadEndShare: number
  /**
   * Shortest route the level accepts, as a multiple of `rows + cols`.
   *
   * The floor against a trivial page. A maze whose answer is barely longer than
   * the straight line between its two openings is one a reader solves by
   * looking at it, and a book of those is a book returned.
   */
  minRouteFactor: number
}

/** Mazes carved per puzzle before one is chosen. */
const CARVE_CANDIDATES = 14
/** Entrance / exit pairs tried per carved maze. */
const OPENING_CANDIDATES = 3

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
 *
 * Every cell is visited exactly once, so the corridors form a spanning tree:
 * any two cells are joined by exactly one path — the puzzle always has one
 * answer. `straightness` biases the walk toward continuing in its current
 * direction, which trades twisty junction-heavy mazes for long corridors an
 * older eye can follow without losing its place.
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
  const from: MazeCell = { r: rng.int(0, rows - 1), c: rng.int(0, cols - 1) }
  visited[from.r]![from.c] = true

  const stack: { cell: MazeCell; dir: number }[] = [{ cell: from, dir: -1 }]

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
 * The single corridor path between two cells.
 *
 * Breadth-first with a parent map rather than a recursive walk: the maze is a
 * tree, so the first route found is the only route either way, but a grid of a
 * thousand cells is a thousand stack frames deep in the worst case, and this
 * runs in a browser tab that is also holding a book.
 */
export function solveMaze(g: MazeGrid, start: MazeCell, finish: MazeCell): MazeCell[] {
  const UNSEEN = -2
  const parent = grid<number>(g.rows, g.cols, UNSEEN)
  const queue: MazeCell[] = [start]
  parent[start.r]![start.c] = -1

  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head]!
    if (cell.r === finish.r && cell.c === finish.c) break
    for (let dir = 0; dir < 4; dir++) {
      if (hasWall(g, cell, dir)) continue
      const r = cell.r + DR[dir]!
      const c = cell.c + DC[dir]!
      if (r < 0 || r >= g.rows || c < 0 || c >= g.cols) continue
      if (parent[r]![c] !== UNSEEN) continue
      // Store the heading that walks back toward `start`, so the path unwinds
      // without a second grid holding cell references.
      parent[r]![c] = (dir + 2) % 4
      queue.push({ r, c })
    }
  }

  if (parent[finish.r]![finish.c] === UNSEEN) return []

  const path: MazeCell[] = []
  let cell = finish
  for (;;) {
    path.push(cell)
    const back = parent[cell.r]![cell.c]!
    if (back === -1) break
    cell = { r: cell.r + DR[back]!, c: cell.c + DC[back]! }
  }
  return path.reverse()
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

/** Corners on a path — where the pencil changes heading. */
export function countTurns(path: readonly MazeCell[]): number {
  let turns = 0
  for (let i = 2; i < path.length; i++) {
    const a = path[i - 2]!
    const b = path[i - 1]!
    const c = path[i]!
    if (b.r - a.r !== c.r - b.r || b.c - a.c !== c.c - b.c) turns++
  }
  return turns
}

/**
 * True when corridors form a spanning tree: every cell reachable and exactly
 * cells-1 openings. Equivalent to "exactly one solution".
 *
 * Border gaps are not counted — they lead off the page, not to another cell —
 * so a punched entrance and exit cannot make a perfect maze read as imperfect.
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

/**
 * Columns for the two openings, far enough apart to be worth walking between.
 *
 * A maze entered and left through the same column is a maze whose answer is a
 * drop down the page with a wiggle in it. A third of the width apart is where
 * the route has to cross the grid to get there, whatever the carve did — and
 * drawing both ends per puzzle, rather than pinning them to opposite corners,
 * is what stops twelve pages of one book opening at the same spot.
 */
export function pickOpenings(
  cols: number,
  rng: StudioRng,
): { startCol: number; finishCol: number } {
  const startCol = rng.int(0, cols - 1)
  const gap = Math.max(1, Math.floor(cols / 3))
  const choices: number[] = []
  for (let c = 0; c < cols; c++) {
    if (Math.abs(c - startCol) >= gap) choices.push(c)
  }
  const finishCol = choices.length > 0 ? rng.pick(choices) : (startCol + 1) % cols
  return { startCol, finishCol }
}

/**
 * Distance from the shape the level asked for. Lower is closer.
 *
 * Both terms are relative, so a level can move either aim without the other
 * quietly taking over the score, and route length is weighted the heavier of
 * the two: it is what a solver experiences as difficulty, while dead ends are
 * what they experience as texture.
 */
function scoreCandidate(options: {
  cells: number
  routeLength: number
  deadEnds: number
  profile: MazeProfile
}): number {
  const { cells, routeLength, deadEnds, profile } = options
  const routeMiss = Math.abs(routeLength / cells - profile.routeShare) / profile.routeShare
  const deadMiss = Math.abs(deadEnds / cells - profile.deadEndShare) / profile.deadEndShare
  return routeMiss * 2 + deadMiss
}

/**
 * Carve a batch, score every candidate, and print the closest match.
 *
 * Ranking cannot fail — the worst batch still has a best member — so every seed
 * yields a maze, and the same seed always yields the same one.
 */
export function buildMaze(options: {
  rows: number
  cols: number
  profile: MazeProfile
  rng: StudioRng
}): MazePuzzle {
  const { rows, cols, profile, rng } = options
  const cells = rows * cols
  const routeFloor = profile.minRouteFactor * (rows + cols)

  interface Candidate {
    g: MazeGrid
    start: MazeCell
    finish: MazeCell
    solution: MazeCell[]
    deadEnds: number
    score: number
  }

  const candidates: Candidate[] = []
  for (let i = 0; i < CARVE_CANDIDATES; i++) {
    const g = carveMaze(rows, cols, profile.straightness, rng)
    const deadEnds = countDeadEnds(g)
    for (let j = 0; j < OPENING_CANDIDATES; j++) {
      const { startCol, finishCol } = pickOpenings(cols, rng)
      const start: MazeCell = { r: 0, c: startCol }
      const finish: MazeCell = { r: rows - 1, c: finishCol }
      const solution = solveMaze(g, start, finish)
      candidates.push({
        g,
        start,
        finish,
        solution,
        deadEnds,
        score: scoreCandidate({
          cells,
          routeLength: solution.length,
          deadEnds,
          profile,
        }),
      })
    }
  }

  // The floor is walked once. A batch where nothing clears it means a small
  // grid, not a bug, and the best of that batch is still the page to print.
  const longEnough = candidates.filter((c) => c.solution.length >= routeFloor)
  const pool = longEnough.length > 0 ? longEnough : candidates
  let best = pool[0]!
  for (const candidate of pool) {
    if (candidate.score < best.score) best = candidate
  }

  // Punched last, so the border gaps cannot have influenced the carve or the
  // solve — the route through the maze is the route the key draws.
  best.g.hWalls[0]![best.start.c] = false
  best.g.hWalls[rows]![best.finish.c] = false

  return {
    ...best.g,
    start: best.start,
    finish: best.finish,
    solution: best.solution,
    turns: countTurns(best.solution),
    deadEnds: best.deadEnds,
  }
}
