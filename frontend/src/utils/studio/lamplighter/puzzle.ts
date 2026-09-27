import type { StudioRng } from '../studio-rng'
import { canonicalHash, gridSymmetries } from '../_shared/uniqueness'
import { LAMP_FLOOR, LAMP_WALL, isLampSolution, lampAnswerKey, lampAround, lampSight, solveLamp, type LampPuzzle, type LampRules } from './solver'

/**
 * Building a Lamplighter house.
 *
 * The walls come first, laid in pairs that mirror each other through the
 * house's centre (the classic look of the puzzle), never four in a block
 * and never walling off a room: every floor square can walk to every
 * other. The answer comes next: lamps dropped one at a time, in random
 * order, on squares still in the dark, until every square is lit (so no
 * lamp ever shines on another). Every wall then carries the number of lamps
 * beside it. That house nearly always has one answer; the solver decides
 * whether a reader can reach it without guessing, using exactly the level's
 * steps. Numbers are then rubbed out one by one, in random order, as long
 * as the level's steps still finish the house on the same answer — so the
 * reader gets few numbers, and each one counts.
 */

export interface LampBuilt {
  puzzle: LampPuzzle
  /** The one answer: the lamps, in reading order. */
  lamps: number[]
  /** Digest of the walls and numbers, the same however the house is turned or mirrored. */
  signature: string
}

/** Houses built before a level gives up on this stream. */
export const LAMP_CANDIDATES = 300
/** Tries at laying walls that leave every room reachable. */
const WALL_TRIES = 40

/** The walls and numbers as a grid (the square values). */
export function lampCellGrid(puzzle: LampPuzzle): number[][] {
  const n = puzzle.size
  return Array.from({ length: n }, (_, r) => puzzle.cells.slice(r * n, (r + 1) * n) as number[])
}

/** A house's own fingerprint: turned or mirrored, its walls and numbers are the same puzzle. */
export function lampSignature(puzzle: LampPuzzle): string {
  let best: string | null = null
  for (const turned of gridSymmetries(lampCellGrid(puzzle))) {
    const form = turned.map((row) => row.join(',')).join('/')
    if (best === null || form < best) best = form
  }
  return canonicalHash(best ?? '')
}

/** True when every floor square can walk to every other, side to side. */
export function lampFloorConnected(n: number, wall: ArrayLike<number | boolean>): boolean {
  let start = -1
  let floor = 0
  for (let i = 0; i < n * n; i++) {
    if (wall[i]) continue
    floor++
    if (start < 0) start = i
  }
  if (start < 0) return false
  const seen = new Uint8Array(n * n)
  const stack = [start]
  seen[start] = 1
  let reached = 1
  while (stack.length > 0) {
    const i = stack.pop()!
    const r = Math.floor(i / n)
    const c = i % n
    for (const j of [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, c > 0 ? i - 1 : -1, c < n - 1 ? i + 1 : -1]) {
      if (j < 0 || seen[j] || wall[j]) continue
      seen[j] = 1
      reached++
      stack.push(j)
    }
  }
  return reached === floor
}

/** True when some 2 × 2 block is all wall. */
export function lampWallBlock(n: number, wall: ArrayLike<number | boolean>): boolean {
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const i = r * n + c
      if (wall[i] && wall[i + 1] && wall[i + n] && wall[i + n + 1]) return true
    }
  }
  return false
}

/**
 * The walls: `count` of them (give or take the centre square), in pairs
 * mirrored through the centre. Null when no try leaves every room
 * reachable.
 */
export function drawLampWalls(n: number, rng: StudioRng, count: number): Uint8Array | null {
  for (let t = 0; t < WALL_TRIES; t++) {
    const wall = new Uint8Array(n * n)
    let placed = 0
    for (const i of rng.shuffle(Array.from({ length: n * n }, (_, k) => k))) {
      if (placed >= count) break
      if (wall[i]) continue
      const twin = n * n - 1 - i
      wall[i] = 1
      wall[twin] = 1
      if (lampWallBlock(n, wall)) {
        wall[i] = 0
        wall[twin] = 0
        continue
      }
      placed += i === twin ? 1 : 2
    }
    if (placed >= count - 1 && lampFloorConnected(n, wall)) return wall
  }
  return null
}

/** The lamps: dropped at random on squares still dark until the whole house is lit. */
export function drawLampAnswer(puzzle: LampPuzzle, rng: StudioRng): number[] {
  const n = puzzle.size
  const lit = new Uint8Array(n * n)
  const lamps: number[] = []
  for (const i of rng.shuffle(puzzle.cells.flatMap((v, k) => (v === LAMP_FLOOR ? [k] : [])))) {
    if (lit[i]) continue
    lamps.push(i)
    lit[i] = 1
    for (const j of lampSight(puzzle, i)) lit[j] = 1
  }
  return lamps.sort((a, b) => a - b)
}

/** The house with every wall numbered by the lamps beside it. */
export function lampNumberAll(n: number, wall: ArrayLike<number>, lamps: readonly number[]): LampPuzzle {
  const bare: LampPuzzle = { size: n, cells: Array.from({ length: n * n }, (_, i) => (wall[i] ? LAMP_WALL : LAMP_FLOOR)) }
  const on = new Set(lamps)
  return { size: n, cells: bare.cells.map((v, i) => (v === LAMP_WALL ? lampAround(bare, i).filter((j) => on.has(j)).length : v)) }
}

export interface LampLevelNeeds {
  size: number
  /** How many walls the house is built with. */
  walls: number
  rules: LampRules
  /** Refuse houses these steps alone finish. */
  beyond?: LampRules | null
  /** The fewest numbers a house of the level prints. */
  minNumbers: number
}

/** True when the house is one the level's steps finish on exactly this answer, and no easier. */
export function lampMeetsLevel(puzzle: LampPuzzle, lamps: readonly number[], needs: Pick<LampLevelNeeds, 'rules' | 'beyond'>): boolean {
  if (!isLampSolution(puzzle, lamps)) return false
  const solve = solveLamp(puzzle, needs.rules)
  if (!solve.solved || lampAnswerKey(solve.lamps) !== lampAnswerKey(lamps)) return false
  return !(needs.beyond && solveLamp(puzzle, needs.beyond).solved)
}

/** True when the level's own steps finish the house on exactly this answer. */
function finishes(puzzle: LampPuzzle, lamps: readonly number[], rules: LampRules): boolean {
  const solve = solveLamp(puzzle, rules)
  return solve.solved && lampAnswerKey(solve.lamps) === lampAnswerKey(lamps)
}

/**
 * One house built for the level, kept only when the level's steps solve it
 * to exactly its answer (and, when `beyond` is given, those steps alone do
 * not). Null when this draw does not.
 */
export function drawLampCandidate(options: LampLevelNeeds & { rng: StudioRng }): LampBuilt | null {
  const { size: n, rng } = options
  const wall = drawLampWalls(n, rng, options.walls)
  if (!wall) return null
  const bare: LampPuzzle = { size: n, cells: Array.from({ length: n * n }, (_, i) => (wall[i] ? LAMP_WALL : LAMP_FLOOR)) }
  const lamps = drawLampAnswer(bare, rng)
  const full = lampNumberAll(n, wall, lamps)
  if (!finishes(full, lamps, options.rules)) return null

  // Rub numbers out while the level's steps still finish the house.
  const cells = [...full.cells]
  let numbers = cells.filter((v) => v >= 0).length
  for (const i of rng.shuffle(cells.flatMap((v, k) => (v >= 0 ? [k] : [])))) {
    if (numbers <= options.minNumbers) break
    const keep = cells[i]!
    cells[i] = LAMP_WALL
    if (finishes({ size: n, cells }, lamps, options.rules)) numbers--
    else cells[i] = keep
  }
  const puzzle: LampPuzzle = { size: n, cells }
  if (!lampMeetsLevel(puzzle, lamps, options)) return null
  return { puzzle, lamps, signature: lampSignature(puzzle) }
}

/**
 * A house for the level from this stream: houses built until one is solved
 * by exactly the level's steps, or null when none is within the budget.
 */
export function buildLampHouse(
  options: LampLevelNeeds & {
    rng: StudioRng
    /** Houses already refused for this page (by signature). */
    exclude?: ReadonlySet<string>
  },
): LampBuilt | null {
  const { exclude, ...needs } = options
  for (let k = 0; k < LAMP_CANDIDATES; k++) {
    const built = drawLampCandidate(needs)
    if (built && !exclude?.has(built.signature)) return built
  }
  return null
}
