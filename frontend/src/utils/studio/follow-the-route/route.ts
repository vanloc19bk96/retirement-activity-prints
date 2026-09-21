import { createRng, type StudioRng } from '../studio-rng'
import {
  DIAGONAL_DIRS,
  ORTHOGONAL_DIRS,
  type Cell,
  type Dir,
  type Route,
  type Step,
} from './types'

/** row grows downward, col grows rightward (see `types.ts`). */
const DELTA: Record<Dir, { dr: number; dc: number }> = {
  U: { dr: -1, dc: 0 },
  D: { dr: 1, dc: 0 },
  L: { dr: 0, dc: -1 },
  R: { dr: 0, dc: 1 },
  UL: { dr: -1, dc: -1 },
  UR: { dr: -1, dc: 1 },
  DL: { dr: 1, dc: -1 },
  DR: { dr: 1, dc: 1 },
}

const REVERSE: Record<Dir, Dir> = {
  U: 'D',
  D: 'U',
  L: 'R',
  R: 'L',
  UL: 'DR',
  UR: 'DL',
  DL: 'UR',
  DR: 'UL',
}

export const delta = (dir: Dir) => DELTA[dir]

export const reverseDir = (dir: Dir): Dir => REVERSE[dir]

export function moveCell(cell: Cell, dir: Dir, count = 1): Cell {
  const { dr, dc } = DELTA[dir]
  return { row: cell.row + dr * count, col: cell.col + dc * count }
}

export const sameCell = (a: Cell, b: Cell): boolean =>
  a.row === b.row && a.col === b.col

export function isInsideGrid(cell: Cell, rows: number, cols: number): boolean {
  return cell.row >= 1 && cell.row <= rows && cell.col >= 1 && cell.col <= cols
}

/** How many squares `dir` can advance from `cell` before leaving the grid. */
export function maxAdvance(cell: Cell, dir: Dir, rows: number, cols: number): number {
  const { dr, dc } = DELTA[dir]
  const vertical = dr === 0 ? Infinity : dr < 0 ? cell.row - 1 : rows - cell.row
  const horizontal = dc === 0 ? Infinity : dc < 0 ? cell.col - 1 : cols - cell.col
  const limit = Math.min(vertical, horizontal)
  return Number.isFinite(limit) ? Math.max(0, limit) : 0
}

export const dirsFor = (diagonals: boolean): readonly Dir[] =>
  diagonals ? [...ORTHOGONAL_DIRS, ...DIAGONAL_DIRS] : ORTHOGONAL_DIRS

export interface RouteSpec {
  rows: number
  cols: number
  numSteps: number
  maxStepLen: number
  diagonals: boolean
  /**
   * Least distance (in squares travelled) the end may sit from the start.
   * Modes A and B only need `end !== start`, but Mode C prints both markers and
   * asks the reader to invent the route — an end one square away makes that a
   * one-word answer next to a page of blank lines.
   */
  minEndManhattan?: number
  /** Mode C again: an end on the start's row or column is one straight move. */
  requireEndOffAxis?: boolean
}

/** Distance in squares travelled — the length of a plain L-shaped route. */
export function manhattan(a: Cell, b: Cell): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col)
}

/** Whether a finished walk ends somewhere this spec is willing to print. */
export function endIsAcceptable(route: Route, spec: RouteSpec): boolean {
  if (manhattan(route.start, route.end) < Math.max(1, spec.minEndManhattan ?? 1)) {
    return false
  }
  if (!spec.requireEndOffAxis) return true
  return route.end.row !== route.start.row && route.end.col !== route.start.col
}

/**
 * Every (dir, count) that stays on the grid. Skips the previous direction
 * (would print as two same-way lines — use a longer `count` instead) and its
 * reverse (confusing cancel).
 */
function legalMoves(cell: Cell, prevDir: Dir | null, spec: RouteSpec): Step[] {
  const moves: Step[] = []
  for (const dir of dirsFor(spec.diagonals)) {
    if (prevDir && (dir === prevDir || dir === reverseDir(prevDir))) continue
    const reach = Math.min(spec.maxStepLen, maxAdvance(cell, dir, spec.rows, spec.cols))
    for (let count = 1; count <= reach; count++) moves.push({ dir, count })
  }
  return moves
}

function appendStep(path: Cell[], from: Cell, step: Step): Cell {
  let cur = from
  for (let k = 0; k < step.count; k++) {
    cur = moveCell(cur, step.dir)
    path.push(cur)
  }
  return cur
}

function buildRoute(start: Cell, steps: Step[], spec: RouteSpec): Route {
  const path: Cell[] = [start]
  let cur = start
  for (const step of steps) cur = appendStep(path, cur, step)
  return {
    gridRows: spec.rows,
    gridCols: spec.cols,
    start,
    steps,
    path,
    end: cur,
  }
}

/** One random walk. Returns null when the walk boxed itself in. */
function walk(rng: StudioRng, spec: RouteSpec): Route | null {
  const start: Cell = {
    row: rng.int(1, spec.rows),
    col: rng.int(1, spec.cols),
  }
  const steps: Step[] = []
  let cur = start
  let prevDir: Dir | null = null

  for (let i = 0; i < spec.numSteps; i++) {
    const moves = legalMoves(cur, prevDir, spec)
    if (moves.length === 0) return null
    const step = rng.pick(moves)
    steps.push(step)
    cur = moveCell(cur, step.dir, step.count)
    prevDir = step.dir
  }
  return buildRoute(start, steps, spec)
}

/**
 * Swap the last step for one that lands somewhere the spec accepts.
 *
 * The generator retries a fresh walk when a route ends somewhere unusable,
 * because a re-rolled route is more varied than a patched one. This is the
 * guaranteed exit from that loop: on any grid worth printing the
 * second-to-last cell has at least two legal moves, and at most one of them can
 * land on the start square, so a replacement always exists.
 */
function repairEnding(route: Route, spec: RouteSpec): Route | null {
  const steps = route.steps
  if (steps.length === 0) return null
  const before = route.path[route.path.length - 1 - steps[steps.length - 1]!.count]
  if (!before) return null
  const prevDir = steps.length > 1 ? steps[steps.length - 2]!.dir : null

  let offStart: Route | null = null
  for (const move of legalMoves(before, prevDir, spec)) {
    if (sameCell(moveCell(before, move.dir, move.count), route.start)) continue
    const candidate = buildRoute(route.start, [...steps.slice(0, -1), move], spec)
    if (endIsAcceptable(candidate, spec)) return candidate
    // Keeping the grid's hard invariant beats keeping a soft distance rule.
    offStart ??= candidate
  }
  return offStart
}

/** Retries before the walk is patched instead of re-rolled (§3). */
const MAX_WALK_ATTEMPTS = 200

/**
 * Deterministic route for `seed` + `spec` (§3).
 *
 * Invariants (pinned in `route.test.ts`): every cell of `path` is inside the
 * grid, `end !== start`, `steps.length === numSteps`, and no step counts less
 * than 1. The answer is the simulation itself, so the key cannot disagree with
 * the printed moves.
 */
export function generateRoute(seed: number, spec: RouteSpec): Route {
  const rng = createRng(seed)
  let last: Route | null = null

  for (let attempt = 0; attempt < MAX_WALK_ATTEMPTS; attempt++) {
    const route = walk(rng, spec)
    if (!route) continue
    if (endIsAcceptable(route, spec)) return route
    last = route
  }
  const repaired = last ? repairEnding(last, spec) : null
  if (repaired) return repaired
  // Unreachable on any tier grid (>= 4x4): kept so a caller that invents a
  // degenerate spec gets a valid, if dull, route instead of a crash.
  return buildRoute(
    { row: 1, col: 1 },
    Array.from({ length: spec.numSteps }, (_, i) => ({
      dir: (i % 2 === 0 ? 'R' : 'D') as Dir,
      count: 1,
    })),
    spec,
  )
}

/**
 * Re-walk `start` + `steps` from scratch. Tests use it to check the answer
 * without trusting the value the generator recorded.
 */
export function simulateRoute(start: Cell, steps: readonly Step[]): Cell {
  let cur = start
  for (const step of steps) cur = moveCell(cur, step.dir, step.count)
  return cur
}

/** Printed coordinate of a cell: column letter then row number, e.g. `C4`. */
export function cellCode(cell: Cell): string {
  return `${columnLetter(cell.col)}${cell.row}`
}

export function columnLetter(col: number): string {
  // Grids never exceed 8 columns, so a single letter always suffices.
  return String.fromCharCode(64 + Math.max(1, col))
}

/**
 * The move list as printed. Two figures on one page must not share it — a
 * repeated list reads as a printing mistake even when the grids differ.
 */
export function routeStepsKey(route: Route): string {
  return route.steps.map((s) => `${s.dir}${s.count}`).join(',')
}
