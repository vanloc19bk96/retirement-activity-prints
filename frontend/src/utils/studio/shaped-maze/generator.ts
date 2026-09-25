import type { StudioRng } from '../studio-rng'
import {
  countDeadEnds,
  countTurns,
  hasWall,
  solveMaze,
  type MazeCell,
  type MazeGrid,
  type MazeProfile,
} from '../maze/generator'
import { isExterior, isInside, type ShapeMask } from './mask'

/**
 * A maze carved inside a shape, with the same two promises as the regular
 * Maze (`maze/generator.ts`):
 *
 * * **Exactly one route.** Corridors are a spanning tree over the shape's
 *   cells and nothing else: cells outside the outline keep all four walls
 *   and are never visited, so the outline is solid wall except for the two
 *   openings, and any two cells of the shape are joined by one path only.
 * * **A route worth walking.** A batch is carved, several entrance / exit
 *   pairs are tried on each, and the one closest to the level's aims (route
 *   length, dead ends) prints — the same scoring the regular Maze uses.
 *
 * The walls live in the regular Maze's grid (`hWalls` / `vWalls`), so its
 * solver, turn counter and dead-end counter work here unchanged; only the
 * carve and the openings are the shape's own.
 */

/** Direction deltas: 0 up, 1 right, 2 down, 3 left. */
const DR = [-1, 0, 1, 0]
const DC = [0, 1, 0, -1]

/** A gap in the outline: `cell` is inside, the neighbour through `dir` is open paper. */
export interface ShapedOpening {
  cell: MazeCell
  dir: number
}

export interface ShapedMazePuzzle extends MazeGrid {
  mask: ShapeMask
  start: ShapedOpening
  finish: ShapedOpening
  /** The one corridor path from start to finish, inclusive of both ends. */
  solution: MazeCell[]
  turns: number
  deadEnds: number
}

/** Mazes carved per puzzle before one is chosen. */
const CARVE_CANDIDATES = 12
/** Entrance / exit pairs tried per carved maze. */
const OPENING_CANDIDATES = 5
/** Openings at least this share of the shape's longer side apart, as the crow flies. */
const MIN_OPENING_SPREAD = 0.4

function grid<T>(rows: number, cols: number, value: T): T[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => value))
}

function removeWall(g: MazeGrid, from: MazeCell, dir: number): void {
  if (dir === 0) g.hWalls[from.r]![from.c] = false
  else if (dir === 2) g.hWalls[from.r + 1]![from.c] = false
  else if (dir === 3) g.vWalls[from.r]![from.c] = false
  else g.vWalls[from.r]![from.c + 1] = false
}

/**
 * Randomised depth-first carve (recursive backtracker) over the shape's cells.
 *
 * Starts from a random cell of the shape and only ever steps onto another
 * cell of the shape, so the carve is a spanning tree of exactly the shape.
 * `straightness` favours carrying on in the same direction: long runs an
 * older eye can follow without losing its place.
 */
export function carveShapedMaze(mask: ShapeMask, straightness: number, rng: StudioRng): MazeGrid {
  const { rows, cols } = mask
  const g: MazeGrid = {
    rows,
    cols,
    hWalls: grid(rows + 1, cols, true),
    vWalls: grid(rows, cols + 1, true),
  }
  const cells: MazeCell[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (isInside(mask, r, c)) cells.push({ r, c })
  if (cells.length === 0) return g

  const visited = grid(rows, cols, false)
  const from = rng.pick(cells)
  visited[from.r]![from.c] = true
  const stack: { cell: MazeCell; dir: number }[] = [{ cell: from, dir: -1 }]

  while (stack.length > 0) {
    const top = stack[stack.length - 1]!
    const open: number[] = []
    for (let dir = 0; dir < 4; dir++) {
      const r = top.cell.r + DR[dir]!
      const c = top.cell.c + DC[dir]!
      if (isInside(mask, r, c) && !visited[r]![c]) open.push(dir)
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

/** True when nothing of the shape lies straight ahead of the cell, all the way off the grid. */
function facesOut(mask: ShapeMask, r: number, c: number, dir: number): boolean {
  for (let rr = r + DR[dir]!, cc = c + DC[dir]!; rr >= 0 && rr < mask.rows && cc >= 0 && cc < mask.cols; rr += DR[dir]!, cc += DC[dir]!) {
    if (isInside(mask, rr, cc)) return false
  }
  return true
}

/**
 * Every edge of the outline where an opening could go: one that looks
 * straight out at open page. Never into a hole the shape encloses (the space
 * inside a mug handle), and never into a notch facing another part of the
 * shape (under a teapot's spout), where the arrow and caption would sit
 * between two stretches of maze and read as part of it.
 */
export function outlineEdges(mask: ShapeMask): ShapedOpening[] {
  const out: ShapedOpening[] = []
  for (let r = 0; r < mask.rows; r++) {
    for (let c = 0; c < mask.cols; c++) {
      if (!isInside(mask, r, c)) continue
      for (let dir = 0; dir < 4; dir++) {
        const rr = r + DR[dir]!
        const cc = c + DC[dir]!
        if (!isInside(mask, rr, cc) && isExterior(mask, rr, cc) && facesOut(mask, r, c, dir)) out.push({ cell: { r, c }, dir })
      }
    }
  }
  return out
}

/**
 * True when the shape's corridors form a spanning tree — every cell of the
 * shape reachable and exactly cells-1 openings between them — and no wall of
 * the outline is missing except the two named openings. Equivalent to "one
 * way in, one way out, exactly one route between them".
 */
export function isPerfectShapedMaze(g: MazeGrid, mask: ShapeMask, openings: readonly ShapedOpening[]): boolean {
  let cells = 0
  let links = 0
  let first: MazeCell | null = null
  const allowed = new Set(openings.map((o) => `${o.cell.r},${o.cell.c},${o.dir}`))
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      if (!isInside(mask, r, c)) continue
      cells++
      first ??= { r, c }
      for (let dir = 0; dir < 4; dir++) {
        if (hasWall(g, { r, c }, dir)) continue
        const rr = r + DR[dir]!
        const cc = c + DC[dir]!
        if (isInside(mask, rr, cc)) {
          // Counted from one side only.
          if (dir === 1 || dir === 2) links++
        } else if (!allowed.has(`${r},${c},${dir}`)) {
          return false
        }
      }
    }
  }
  if (!first || links !== cells - 1) return false

  const seen = grid(g.rows, g.cols, false)
  const stack: MazeCell[] = [first]
  seen[first.r]![first.c] = true
  let reached = 1
  while (stack.length > 0) {
    const cell = stack.pop()!
    for (let dir = 0; dir < 4; dir++) {
      if (hasWall(g, cell, dir)) continue
      const r = cell.r + DR[dir]!
      const c = cell.c + DC[dir]!
      if (!isInside(mask, r, c) || seen[r]![c]) continue
      seen[r]![c] = true
      reached++
      stack.push({ r, c })
    }
  }
  return reached === cells
}

function scoreCandidate(cells: number, routeLength: number, deadEnds: number, profile: MazeProfile): number {
  const routeMiss = Math.abs(routeLength / cells - profile.routeShare) / profile.routeShare
  const deadMiss = Math.abs(deadEnds / cells - profile.deadEndShare) / profile.deadEndShare
  return routeMiss * 2 + deadMiss
}

/**
 * Shortest route a level accepts, in cells. The regular Maze measures its
 * floor against rows + cols; a shape is not a rectangle, so the same measure
 * is taken from its area — twice the side of a square with as many cells.
 */
export function routeFloor(cells: number, profile: MazeProfile): number {
  return Math.round(profile.minRouteFactor * 2 * Math.sqrt(cells) * 0.8)
}

/**
 * Carve a batch, try entrance / exit pairs from `openings`, and keep the
 * closest match to the level. `openings` is already limited to edges where
 * the page has room for the Start / Finish label and arrow. Returns null when
 * no two openings are far enough apart to make a walk of it.
 */
export function buildShapedMaze(options: {
  mask: ShapeMask
  profile: MazeProfile
  openings: readonly ShapedOpening[]
  /** True when both openings' labels can sit on the page together. */
  compatible?: (start: ShapedOpening, finish: ShapedOpening) => boolean
  rng: StudioRng
}): ShapedMazePuzzle | null {
  const { mask, profile, openings, compatible, rng } = options
  const spread = MIN_OPENING_SPREAD * Math.max(mask.rows, mask.cols)
  const far = (a: ShapedOpening, b: ShapedOpening) => Math.hypot(a.cell.r - b.cell.r, a.cell.c - b.cell.c) >= spread
  const pairs: [ShapedOpening, ShapedOpening][] = []
  for (const a of openings) {
    for (const b of openings) {
      if (a === b || !far(a, b)) continue
      if (compatible && !compatible(a, b)) continue
      pairs.push([a, b])
    }
  }
  if (pairs.length === 0) return null

  const floor = routeFloor(mask.count, profile)
  interface Candidate {
    g: MazeGrid
    start: ShapedOpening
    finish: ShapedOpening
    solution: MazeCell[]
    deadEnds: number
    score: number
  }
  const candidates: Candidate[] = []
  for (let i = 0; i < CARVE_CANDIDATES; i++) {
    const g = carveShapedMaze(mask, profile.straightness, rng)
    const deadEnds = countDeadEnds(g)
    for (const [start, finish] of rng.sample(pairs, OPENING_CANDIDATES)) {
      const solution = solveMaze(g, start.cell, finish.cell)
      if (solution.length === 0) continue
      candidates.push({ g, start, finish, solution, deadEnds, score: scoreCandidate(mask.count, solution.length, deadEnds, profile) })
    }
  }
  if (candidates.length === 0) return null

  const longEnough = candidates.filter((c) => c.solution.length >= floor)
  const pool = longEnough.length > 0 ? longEnough : candidates
  let best = pool[0]!
  for (const candidate of pool) if (candidate.score < best.score) best = candidate

  // Punched last, so the openings cannot have influenced the carve or the
  // solve: the route through the maze is the route the key draws.
  removeWall(best.g, best.start.cell, best.start.dir)
  removeWall(best.g, best.finish.cell, best.finish.dir)

  return {
    ...best.g,
    mask,
    start: best.start,
    finish: best.finish,
    solution: best.solution,
    turns: countTurns(best.solution),
    deadEnds: best.deadEnds,
  }
}

/**
 * Stable digest of a maze's structure — shape cells, walls and openings —
 * so two pages that hold the same maze fingerprint alike whatever the page
 * around them. Also what makes two different mazes in the same shape differ.
 */
export function shapedMazeSignature(puzzle: ShapedMazePuzzle): string {
  const parts: string[] = [`${puzzle.rows}x${puzzle.cols}`]
  let bits = ''
  for (let r = 0; r < puzzle.rows; r++) {
    for (let c = 0; c < puzzle.cols; c++) {
      if (!isInside(puzzle.mask, r, c)) {
        bits += '.'
        continue
      }
      // Right and down walls are enough: every inner edge is someone's right or bottom.
      bits += String(Number(hasWall(puzzle, { r, c }, 1)) * 2 + Number(hasWall(puzzle, { r, c }, 2)))
    }
  }
  parts.push(bits)
  parts.push(`${puzzle.start.cell.r},${puzzle.start.cell.c},${puzzle.start.dir}`)
  parts.push(`${puzzle.finish.cell.r},${puzzle.finish.cell.c},${puzzle.finish.dir}`)
  return parts.join('|')
}
