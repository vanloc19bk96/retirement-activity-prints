import type { StudioRng } from '../studio-rng'
import { canonicalHash, gridSymmetries } from '../_shared/uniqueness'
import {
  isTtSolution,
  solveTt,
  ttCounts,
  ttGeometry,
  ttRouteKey,
  ttRoutePieces,
  ttTurns,
  type TtGiven,
  type TtPortal,
  type TtPuzzle,
  type TtRules,
} from './solver'

/**
 * Building a Train Tracks board.
 *
 * The answer comes first: the line is laid from a random edge square,
 * wandering square to square without revisiting one, until it can leave
 * through another side of the board with the level's share of the board
 * covered; that fixes the row and column numbers. Then the pieces to print:
 * the two end pieces always, so the reader knows where the line comes in
 * and goes out; then the level's own solver works the board, and wherever
 * it gets stuck one of the squares it could not settle has its piece
 * printed, until it finishes. Every printed piece but the ends is then
 * taken back in turn and left out if the board still finishes without it,
 * so no piece is printed that the reader does not need — and finally a few
 * are put back, as long as the level stays the level, so every board has a
 * starting point.
 */

export interface TtBuilt {
  puzzle: TtPuzzle
  /** The one answer, from where the line enters. */
  route: number[]
  /** Digest of the squares the line covers, the same however the board is turned or mirrored. */
  signature: string
}

/** Boards tried before a level gives up on this stream. */
export const TT_CANDIDATES = 40
/** Steps of laying a line before one try is given up. */
const ROUTE_BUDGET = 6000
/** Tries at laying a line before one board is given up. */
const ROUTE_TRIES = 12
/** At an edge square with track enough, the chance the line leaves there rather than wandering on. */
const LEAVE_CHANCE = 0.4
/** The fewest turns a line takes, as a share of its squares: long straights make dull boards. */
const MIN_TURN_SHARE = 0.35

/**
 * A board's own fingerprint: the squares the line covers (its two ends
 * marked), turned or mirrored to the smallest form. Two pages with the same
 * squares share every number, so a reader would call them the same puzzle
 * whatever pieces each prints.
 */
export function ttSignature(size: number, route: readonly number[], portals: readonly [TtPortal, TtPortal]): string {
  const marks = new Map<number, string>(route.map((at) => [at, '#']))
  for (const portal of portals) marks.set(portal.at, 'E')
  const rows = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => marks.get(r * size + c) ?? '.'))
  let best: string | null = null
  for (const turned of gridSymmetries(rows)) {
    const form = turned.map((row) => row.join('')).join('/')
    if (best === null || form < best) best = form
  }
  return canonicalHash(best ?? '')
}

/** The sides of an edge square that face off the board. */
function edgeSides(n: number, at: number): number[] {
  const g = ttGeometry(n)
  return [0, 1, 2, 3].filter((d) => g.step[at * 4 + d]! < 0)
}

export interface TtRouteDraw {
  route: number[]
  portals: [TtPortal, TtPortal]
}

/**
 * A line across an N × N board covering between `minLength` and
 * `maxLength` squares, entering through one side of the board and leaving
 * through another, every row and column crossed and turning often; null
 * when the draw runs dry.
 */
export function drawTtRoute(n: number, minLength: number, maxLength: number, rng: StudioRng): TtRouteDraw | null {
  const g = ttGeometry(n)
  const edges = Array.from({ length: n * n }, (_, i) => i).filter((i) => edgeSides(n, i).length > 0)
  for (let attempt = 0; attempt < ROUTE_TRIES; attempt++) {
    const start = rng.pick(edges)
    const entrySide = rng.pick(edgeSides(n, start))
    const used = new Uint8Array(n * n)
    const route: number[] = []
    let budget = ROUTE_BUDGET
    let exitDir = -1
    const leaving = (cell: number) => (cell === start ? [] : edgeSides(n, cell).filter((d) => d !== entrySide))
    const lay = (cell: number): boolean => {
      if (--budget < 0) return false
      route.push(cell)
      used[cell] = 1
      const exits = route.length >= minLength ? leaving(cell) : []
      if (exits.length > 0 && rng.chance(LEAVE_CHANCE)) {
        exitDir = rng.pick(exits)
        return true
      }
      if (route.length < maxLength) {
        for (const d of rng.shuffle([0, 1, 2, 3])) {
          const next = g.step[cell * 4 + d]!
          if (next < 0 || used[next]) continue
          if (lay(next)) return true
          if (budget < 0) break
        }
      }
      if (exits.length > 0 && budget >= 0) {
        exitDir = rng.pick(exits)
        return true
      }
      route.pop()
      used[cell] = 0
      return false
    }
    if (!lay(start)) continue
    const portals: [TtPortal, TtPortal] = [
      { at: start, dir: entrySide },
      { at: route[route.length - 1]!, dir: exitDir },
    ]
    const { rows, cols } = ttCounts(n, route)
    if (rows.includes(0) || cols.includes(0)) continue
    if (ttTurns(n, route, portals) < route.length * MIN_TURN_SHARE) continue
    return { route: [...route], portals }
  }
  return null
}

/** The puzzle a line makes, printing the pieces on these squares (and always its two ends). */
export function ttPuzzleOf(n: number, draw: TtRouteDraw, shown: readonly number[]): TtPuzzle {
  const { route, portals } = draw
  const pieces = ttRoutePieces(n, route, portals)
  const at = [...new Set([portals[0].at, portals[1].at, ...shown])].sort((a, b) => a - b)
  const givens: TtGiven[] = at.map((i) => ({ at: i, piece: pieces.get(i)! }))
  const { rows, cols } = ttCounts(n, route)
  return { size: n, rows, cols, portals, givens }
}

export interface TtLevelNeeds {
  size: number
  fill: readonly [number, number]
  rules: TtRules
  /** Refuse boards these steps alone finish. */
  beyond?: TtRules | null
  /** The fewest of the level's own steps the board must take. */
  minAdvanced?: number
  /** Pieces printed, the two ends among them: at least, at most. */
  givens: readonly [number, number]
}

/** How many of the level's own steps a solve took: "what if" at `probe`, "don't close it early" below. */
const advancedSteps = (rules: TtRules, tally: { loop: number; probe: number }) => (rules === 'probe' ? tally.probe : tally.loop)

/** True when the level's steps finish the board on exactly this line, and no easier. */
export function ttMeetsLevel(puzzle: TtPuzzle, route: readonly number[], needs: TtLevelNeeds): boolean {
  if (!isTtSolution(puzzle, route)) return false
  if (puzzle.givens.length < needs.givens[0] || puzzle.givens.length > needs.givens[1]) return false
  const solve = solveTt(puzzle, needs.rules)
  if (!solve.solved || ttRouteKey(solve.route) !== ttRouteKey(route)) return false
  if (needs.beyond && solveTt(puzzle, needs.beyond).solved) return false
  return advancedSteps(needs.rules, solve.tally) >= (needs.minAdvanced ?? 0)
}

/**
 * One board built for the level, kept only when the level's steps solve it
 * to exactly its line (and, when `beyond` is given, those steps alone do
 * not). Null when this draw does not.
 */
export function drawTtCandidate(options: TtLevelNeeds & { rng: StudioRng }): TtBuilt | null {
  const { size: n, fill, rules, rng } = options
  const cells = n * n
  const draw = drawTtRoute(n, Math.ceil(cells * fill[0]), Math.floor(cells * fill[1]), rng)
  if (!draw) return null
  const ends = new Set([draw.portals[0].at, draw.portals[1].at])
  const onRoute = new Set(draw.route)
  const shown: number[] = []
  const solves = (list: readonly number[], steps: TtRules = rules) => solveTt(ttPuzzleOf(n, draw, list), steps)
  const most = options.givens[1]

  // Print pieces where the solver is stuck until it finishes.
  for (let solve = solves(shown); !solve.solved; solve = solves(shown)) {
    const pool = solve.unsettled.filter((i) => onRoute.has(i) && !ends.has(i) && !shown.includes(i))
    if (pool.length === 0 || shown.length + ends.size >= most + 4) return null
    shown.push(rng.pick(pool))
  }
  // Take back every piece the board finishes without.
  for (const i of rng.shuffle(shown)) {
    const without = shown.filter((j) => j !== i)
    if (solves(without).solved) shown.splice(shown.indexOf(i), 1)
  }
  // A starting point: pieces put back while the level stays the level.
  const least = options.givens[0]
  if (shown.length + ends.size < least) {
    for (const i of rng.shuffle(draw.route.filter((j) => !ends.has(j) && !shown.includes(j)))) {
      if (shown.length + ends.size >= least) break
      const more = [...shown, i]
      if (options.beyond && solves(more, options.beyond).solved) continue
      shown.push(i)
    }
  }
  const puzzle = ttPuzzleOf(n, draw, shown)
  return ttMeetsLevel(puzzle, draw.route, options) ? { puzzle, route: draw.route, signature: ttSignature(n, draw.route, draw.portals) } : null
}

/**
 * A board for the level from this stream: boards built until one is solved
 * by exactly the level's steps, or null when none is within the budget.
 */
export function buildTtBoard(
  options: TtLevelNeeds & {
    rng: StudioRng
    /** Boards already refused for this page (by signature). */
    exclude?: ReadonlySet<string>
  },
): TtBuilt | null {
  const { exclude, ...needs } = options
  for (let k = 0; k < TT_CANDIDATES; k++) {
    const built = drawTtCandidate(needs)
    if (built && !exclude?.has(built.signature)) return built
  }
  return null
}
