import type { StudioRng } from '../studio-rng'
import { canonicalHash, gridSymmetries } from '../_shared/uniqueness'
import {
  SHIP,
  UNKNOWN,
  cfCounts,
  cfGridOf,
  cfPieceOf,
  cfShipSquares,
  cfSquareList,
  cfTouching,
  isCfSolution,
  solveCf,
  type CfGiven,
  type CfPuzzle,
  type CfRules,
  type CfShip,
} from './solver'

/**
 * Building a Cruise Fleet harbor.
 *
 * The answer comes first: the fleet is dropped into the harbor longest ship
 * first, each where it neither overlaps nor touches another, which fixes the
 * row and column numbers. Then the squares to show: the level's own solver
 * works the harbor from the numbers alone, and wherever it gets stuck one of
 * the squares it could not decide is shown (a piece of ship more often than
 * water) until it finishes. Every shown square is then taken back in turn
 * and left out if the harbor still finishes without it, so no square is
 * shown that the reader does not need — and finally a few are put back, as
 * long as the level stays the level, so every harbor has a starting point.
 */

export interface CfBuilt {
  puzzle: CfPuzzle
  /** The one answer. */
  ships: CfShip[]
  /** Digest of the fleet's squares, the same however the harbor is turned or mirrored. */
  signature: string
}

/** Harbors tried before a level gives up on this stream. */
export const CF_CANDIDATES = 60
/** Tries at dropping a fleet before one harbor is given up. */
const FLEET_BUDGET = 4000
/** Of the squares shown while the solver is stuck, the share that are ship. */
const SHIP_SHOWN = 0.7

/**
 * A harbor's own fingerprint: its ship squares, turned or mirrored to the
 * smallest form. Two pages with the same fleet share every row and column
 * number and one answer, so a reader would call them the same puzzle
 * whatever squares each shows.
 */
export function cfSignature(size: number, ships: readonly CfShip[]): string {
  const grid = cfGridOf(ships, size)
  const rows = Array.from({ length: size }, (_, r) => Array.from(grid.slice(r * size, (r + 1) * size), (v) => (v === SHIP ? 'S' : '.')))
  let best: string | null = null
  for (const turned of gridSymmetries(rows)) {
    const form = turned.map((row) => row.join('')).join('/')
    if (best === null || form < best) best = form
  }
  return canonicalHash(best ?? '')
}

/** The fleet dropped into the harbor, longest first, none touching; null when the draw runs dry. */
export function drawCfFleet(n: number, fleet: readonly number[], rng: StudioRng): CfShip[] | null {
  const lengths = [...fleet].sort((a, b) => b - a)
  const taken = new Uint8Array(n * n)
  const ships: CfShip[] = []
  let budget = FLEET_BUDGET
  const fits = (ship: CfShip) => cfShipSquares(ship, n).every((i) => !taken[i] && ships.every((o) => cfShipSquares(o, n).every((j) => !cfTouching(i, j, n))))
  const place = (k: number): boolean => {
    if (k === lengths.length) return true
    const length = lengths[k]!
    const spots: CfShip[] = []
    for (let at = 0; at < n * n; at++) {
      const r = Math.floor(at / n)
      const c = at % n
      if (c + length <= n) spots.push({ at, length, across: true })
      if (length > 1 && r + length <= n) spots.push({ at, length, across: false })
    }
    for (const ship of rng.shuffle(spots)) {
      if (--budget < 0) return false
      if (!fits(ship)) continue
      // Ships of one length go in reading order, so a draw never retries the same fleet swapped round.
      const prev = ships[k - 1]
      if (prev && prev.length === length && ship.at < prev.at) continue
      ships.push(ship)
      for (const i of cfShipSquares(ship, n)) taken[i] = 1
      if (place(k + 1)) return true
      ships.pop()
      for (const i of cfShipSquares(ship, n)) taken[i] = 0
    }
    return false
  }
  return place(0) ? ships : null
}

/** The puzzle a fleet makes, showing these squares. */
export function cfPuzzleOf(n: number, fleet: readonly number[], ships: readonly CfShip[], shown: readonly number[]): CfPuzzle {
  const grid = cfGridOf(ships, n)
  const { rows, cols } = cfCounts(ships, n)
  const givens: CfGiven[] = [...shown].sort((a, b) => a - b).map((at) => ({ at, piece: cfPieceOf(grid, n, at) }))
  return { size: n, fleet: [...fleet].sort((a, b) => b - a), rows, cols, givens }
}

export interface CfLevelNeeds {
  size: number
  fleet: readonly number[]
  rules: CfRules
  /** Refuse harbors these steps alone finish. */
  beyond?: CfRules | null
  /** The fewest "where can it go" steps the harbor must take. */
  minAdvanced?: number
  /** Squares shown: at least this many. */
  minGivens?: number
}

/** True when the level's steps finish the harbor on exactly this answer, and no easier. */
export function cfMeetsLevel(puzzle: CfPuzzle, ships: readonly CfShip[], needs: CfLevelNeeds): boolean {
  if (!isCfSolution(puzzle, ships)) return false
  if (puzzle.givens.length < (needs.minGivens ?? 0)) return false
  const solve = solveCf(puzzle, needs.rules)
  if (!solve.solved || cfSquareList(ships, puzzle.size) !== squaresOf(solve.state)) return false
  if (needs.beyond && solveCf(puzzle, needs.beyond).solved) return false
  return solve.tally.fleet >= (needs.minAdvanced ?? 0)
}

/** The ship squares a solver state has marked, as one comparable string. */
export function squaresOf(state: Int8Array): string {
  const out: number[] = []
  state.forEach((v, i) => {
    if (v === SHIP) out.push(i)
  })
  return out.join('.')
}

/**
 * One harbor built for the level, kept only when the level's steps solve it
 * to exactly its answer (and, when `beyond` is given, those steps alone do
 * not). Null when this draw does not.
 */
export function drawCfCandidate(options: CfLevelNeeds & { rng: StudioRng }): CfBuilt | null {
  const { size: n, fleet, rules, rng } = options
  const ships = drawCfFleet(n, fleet, rng)
  if (!ships) return null
  const grid = cfGridOf(ships, n)
  const shown: number[] = []
  const solves = (list: readonly number[]) => solveCf(cfPuzzleOf(n, fleet, ships, list), rules)

  // Show squares where the solver is stuck until it finishes.
  for (let solve = solves(shown); !solve.solved; solve = solves(shown)) {
    const open = Array.from(solve.state.keys()).filter((i) => solve.state[i] === UNKNOWN)
    if (open.length === 0) return null
    const ship = open.filter((i) => grid[i] === SHIP)
    const pool = ship.length > 0 && rng.chance(SHIP_SHOWN) ? ship : open
    shown.push(rng.pick(pool))
  }
  // Take back every square the harbor finishes without.
  for (const i of rng.shuffle(shown)) {
    const without = shown.filter((j) => j !== i)
    if (solves(without).solved) shown.splice(shown.indexOf(i), 1)
  }
  // A starting point: squares put back while the level stays the level (ship pieces first).
  const minGivens = options.minGivens ?? 0
  if (shown.length < minGivens) {
    const rest = rng.shuffle(Array.from({ length: n * n }, (_, i) => i).filter((i) => !shown.includes(i)))
    const order = [...rest.filter((i) => grid[i] === SHIP), ...rest.filter((i) => grid[i] !== SHIP)]
    for (const i of order) {
      if (shown.length >= minGivens) break
      const more = [...shown, i]
      if (options.beyond && solveCf(cfPuzzleOf(n, fleet, ships, more), options.beyond).solved) continue
      shown.push(i)
    }
  }
  const puzzle = cfPuzzleOf(n, fleet, ships, shown)
  return cfMeetsLevel(puzzle, ships, options) ? { puzzle, ships, signature: cfSignature(n, ships) } : null
}

/**
 * A harbor for the level from this stream: harbors built until one is
 * solved by exactly the level's steps, or null when none is within the
 * budget.
 */
export function buildCfHarbor(
  options: CfLevelNeeds & {
    rng: StudioRng
    /** Harbors already refused for this page (by signature). */
    exclude?: ReadonlySet<string>
  },
): CfBuilt | null {
  const { exclude, ...needs } = options
  for (let k = 0; k < CF_CANDIDATES; k++) {
    const built = drawCfCandidate(needs)
    if (built && !exclude?.has(built.signature)) return built
  }
  return null
}
