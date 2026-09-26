import type { StudioRng } from '../studio-rng'
import { canonicalGridForm, canonicalHash } from '../_shared/uniqueness'
import { bridgesOf, ihBridgeList, ihLanes, ihNumbers, ihPairKey, isIhSolution, solveIh, type IhBridge, type IhIsland, type IhPuzzle, type IhRules } from './solver'

/**
 * Building an Island Hopping chart.
 *
 * The chart grows from one island: again and again an island already placed
 * sends a bridge (single or double) straight across or down over open water
 * to a new island, never over another bridge and never beside another
 * island. A few more bridges are then laid between islands that already
 * face each other across clear water, so the answer has loops, not just
 * branches. The numbers are read off the bridges. That always makes a chart
 * with at least one answer; the solver then decides whether a reader can
 * reach it, and only it, without guessing — many random charts have several
 * answers, so many are drawn and the first one the level's steps finish is
 * kept.
 */

export interface IhBuilt {
  puzzle: IhPuzzle
  /** The one answer. */
  bridges: IhBridge[]
  /** Digest of the chart, the same however it is turned or mirrored. */
  signature: string
}

/** Random charts drawn before a level gives up on this stream. */
export const IH_CANDIDATES = 400
/** Share of new bridges drawn double. */
const DOUBLE = 0.4
/** Chance a clear lane between two islands gets a bridge of its own. */
const LOOP = 0.3

const OPEN = 0
const ACROSS = 1
const DOWN = 2

interface Draft {
  rows: number
  cols: number
  /** Flat lattice: island index, or -1. */
  island: Int16Array
  /** Flat lattice: a bridge passing over (ACROSS / DOWN), or OPEN. */
  water: Int8Array
  spots: [number, number][]
  /** Share of bridges laid double. */
  double: number
  bridges: { a: number; b: number; count: 1 | 2 }[]
}

const DIRS = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
] as const

function nextToIsland(d: Draft, r: number, c: number): boolean {
  return DIRS.some(([dr, dc]) => {
    const rr = r + dr
    const cc = c + dc
    return rr >= 0 && cc >= 0 && rr < d.rows && cc < d.cols && d.island[rr * d.cols + cc]! >= 0
  })
}

function lay(d: Draft, a: number, b: number, cells: number[], across: boolean, rng: StudioRng): void {
  for (const cell of cells) d.water[cell] = across ? ACROSS : DOWN
  d.bridges.push({ a, b, count: rng.chance(d.double) ? 2 : 1 })
}

/** One step of growth: a new island a bridge away from an old one. False when this try found no room. */
function grow(d: Draft, rng: StudioRng): boolean {
  const from = rng.int(0, d.spots.length - 1)
  const [r0, c0] = d.spots[from]!
  const [dr, dc] = rng.pick(DIRS)
  const path: number[] = []
  const landings: { cell: number; path: number[] }[] = []
  let r = r0 + dr
  let c = c0 + dc
  while (r >= 0 && c >= 0 && r < d.rows && c < d.cols) {
    const cell = r * d.cols + c
    if (d.island[cell]! >= 0 || d.water[cell] !== OPEN) break
    // Never beside another island: every bridge spans open water.
    if (path.length >= 1 && !nextToIsland(d, r, c)) landings.push({ cell, path: [...path] })
    path.push(cell)
    r += dr
    c += dc
  }
  if (landings.length === 0) return false
  const { cell, path: over } = rng.pick(landings)
  const index = d.spots.length
  d.island[cell] = index
  d.spots.push([Math.floor(cell / d.cols), cell % d.cols])
  lay(d, from, index, over, dr === 0, rng)
  return true
}

/** A chart's own fingerprint: turned or mirrored, it is the same puzzle. */
export function ihSignature(puzzle: IhPuzzle): string {
  const grid = Array.from({ length: puzzle.rows }, () => new Array<string>(puzzle.cols).fill('.'))
  for (const isl of puzzle.islands) grid[isl.row]![isl.col] = String(isl.n)
  return canonicalHash(canonicalGridForm(grid, (v) => v))
}

/** Islands in reading order, and the bridges renumbered to match. */
function settleOrder(d: Draft): { puzzle: IhPuzzle; bridges: IhBridge[] } {
  const numbers = ihNumbers(d.spots.length, d.bridges)
  const order = d.spots.map((_, i) => i).sort((i, j) => d.spots[i]![0] - d.spots[j]![0] || d.spots[i]![1] - d.spots[j]![1])
  const rank = new Map(order.map((old, k) => [old, k]))
  const islands: IhIsland[] = order.map((old) => ({ row: d.spots[old]![0], col: d.spots[old]![1], n: numbers[old]! }))
  const bridges = d.bridges.map((b) => {
    const a = rank.get(b.a)!
    const c = rank.get(b.b)!
    return { a: Math.min(a, c), b: Math.max(a, c), count: b.count }
  })
  return { puzzle: { rows: d.rows, cols: d.cols, islands }, bridges }
}

/** A random chart of this size and island count with at least one answer, not yet proven. */
export function draftIhChart(options: { rows: number; cols: number; islands: number; rng: StudioRng; double?: number; loop?: number }): { puzzle: IhPuzzle; bridges: IhBridge[] } | null {
  const { rows, cols, islands, rng, double = DOUBLE, loop = LOOP } = options
  const d: Draft = {
    rows,
    cols,
    island: new Int16Array(rows * cols).fill(-1),
    water: new Int8Array(rows * cols),
    spots: [],
    double,
    bridges: [],
  }
  const start = rng.int(0, rows * cols - 1)
  d.island[start] = 0
  d.spots.push([Math.floor(start / cols), start % cols])
  for (let tries = 0; d.spots.length < islands && tries < islands * 40; tries++) grow(d, rng)
  if (d.spots.length < islands) return null

  // Loops: islands already facing each other across clear water.
  const drafted = settleOrder(d)
  const taken = new Set(drafted.bridges.map((b) => ihPairKey(b.a, b.b)))
  const rank = new Map<number, number>()
  drafted.puzzle.islands.forEach((isl, k) => rank.set(isl.row * cols + isl.col, k))
  const byRank = new Map<number, number>()
  d.spots.forEach(([r, c], old) => byRank.set(rank.get(r * cols + c)!, old))
  for (const lane of rng.shuffle(ihLanes(drafted.puzzle))) {
    if (taken.has(ihPairKey(lane.a, lane.b)) || !rng.chance(loop)) continue
    if (lane.cells.some((cell) => d.water[cell] !== OPEN)) continue
    lay(d, byRank.get(lane.a)!, byRank.get(lane.b)!, lane.cells, lane.horizontal, rng)
  }
  return settleOrder(d)
}

/**
 * One random chart of this size and island count, kept only when the
 * level's steps solve it to exactly its bridges. Null when this draw does not.
 */
export function drawIhCandidate(options: {
  rows: number
  cols: number
  islands: number
  rules: IhRules
  /** Refuse charts these steps alone finish. */
  beyond?: IhRules | null
  double?: number
  loop?: number
  rng: StudioRng
}): IhBuilt | null {
  const { rows, cols, islands, rules, beyond = null, double, loop, rng } = options
  const draft = draftIhChart({ rows, cols, islands, rng, double, loop })
  if (!draft) return null
  const { puzzle, bridges } = draft
  if (!isIhSolution(puzzle, bridges)) return null
  const solve = solveIh(puzzle, rules)
  if (!solve.solved || ihBridgeList(bridgesOf(puzzle, solve.state)) !== ihBridgeList(bridges)) return null
  if (beyond && solveIh(puzzle, beyond).solved) return null
  return { puzzle, bridges, signature: ihSignature(puzzle) }
}

/**
 * A chart for the level from this stream: random draws until one is solved
 * by exactly the level's steps, or null when none is within the budget.
 */
export function buildIhChart(options: {
  size: number
  minIslands: number
  maxIslands: number
  rules: IhRules
  beyond: IhRules | null
  double: number
  loop: number
  rng: StudioRng
  /** Charts already refused for this page (by signature). */
  exclude?: ReadonlySet<string>
}): IhBuilt | null {
  const { size, minIslands, maxIslands, rules, beyond, double, loop, rng, exclude } = options
  for (let k = 0; k < IH_CANDIDATES; k++) {
    const islands = rng.int(minIslands, maxIslands)
    const built = drawIhCandidate({ rows: size, cols: size, islands, rules, beyond, double, loop, rng })
    if (built && !exclude?.has(built.signature)) return built
  }
  return null
}
