import type { StudioRng } from '../studio-rng'
import { canonicalHash, gridSymmetries } from '../_shared/uniqueness'
import { isSkySolution, skyAnswerKey, skyCluesFor, solveSky, type SkyPuzzle, type SkyRules } from './solver'

/**
 * Building a Skyline Tour city.
 *
 * The answer comes first: a city laid plot by plot in reading order, each
 * plot taking a height at random from those its row and column still
 * allow, stepping back when a plot is left with none — so every Latin
 * square can come up, not just a shuffled copy of one. Every clue round
 * the city is then counted from it. The solver decides whether a reader
 * can finish it without guessing, using exactly the level's steps; where
 * they get stuck, a plot is handed over (of a handful of stuck plots, the
 * one that takes the reader furthest), until they finish the city. Clues
 * are then rubbed out one by one, in random order, as long as the level's
 * steps still finish the city on the same answer, and every handed-over
 * plot the city can do without goes too — so the reader works from the
 * clues, few plots are given, and each clue left counts.
 */

export interface SkyBuilt {
  puzzle: SkyPuzzle
  /** The one answer: every plot's height, in reading order. */
  grid: number[]
  /** Digest of the clues and given plots, the same however the city is turned or mirrored. */
  signature: string
}

/** Cities built before a level gives up on this stream. */
export const SKY_CANDIDATES = 120

/** Stuck plots weighed each time a plot must be handed over. */
const GIVEN_TRIES = 8

/**
 * The city as one square picture, clues round the edge: the clues on the
 * border, the given plots inside, the corners empty. Turning or mirroring
 * the picture turns the city with its clues, so it is the same puzzle.
 */
export function skyPicture(puzzle: SkyPuzzle): number[][] {
  const n = puzzle.size
  const out = Array.from({ length: n + 2 }, () => new Array<number>(n + 2).fill(0))
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) out[r + 1]![c + 1] = puzzle.givens[r * n + c]!
  for (let j = 0; j < n; j++) {
    out[0]![j + 1] = puzzle.clues[j]!
    out[j + 1]![n + 1] = puzzle.clues[n + j]!
    out[n + 1]![j + 1] = puzzle.clues[2 * n + j]!
    out[j + 1]![0] = puzzle.clues[3 * n + j]!
  }
  return out
}

/** A city's own fingerprint: turned or mirrored, its clues and givens are the same puzzle. */
export function skySignature(puzzle: SkyPuzzle): string {
  let best: string | null = null
  for (const turned of gridSymmetries(skyPicture(puzzle))) {
    const form = turned.map((row) => row.join(',')).join('/')
    if (best === null || form < best) best = form
  }
  return canonicalHash(`${puzzle.size}:${best ?? ''}`)
}

/** A random finished city: every row and column holding each height once. */
export function drawSkyAnswer(n: number, rng: StudioRng): number[] {
  const grid = new Array<number>(n * n).fill(0)
  const rowUsed = new Array<number>(n).fill(0)
  const colUsed = new Array<number>(n).fill(0)
  const heights = Array.from({ length: n }, (_, k) => k + 1)
  const walk = (i: number): boolean => {
    if (i === n * n) return true
    const r = Math.floor(i / n)
    const c = i % n
    for (const v of rng.shuffle(heights)) {
      const b = 1 << (v - 1)
      if (rowUsed[r]! & b || colUsed[c]! & b) continue
      grid[i] = v
      rowUsed[r]! |= b
      colUsed[c]! |= b
      if (walk(i + 1)) return true
      rowUsed[r]! &= ~b
      colUsed[c]! &= ~b
    }
    grid[i] = 0
    return false
  }
  walk(0)
  return grid
}

export interface SkyLevelNeeds {
  size: number
  rules: SkyRules
  /** Refuse cities these steps alone finish. */
  beyond?: SkyRules | null
  /** The most plots a city of the level hands over. */
  maxGivens: number
  /** Every side keeps at least this many clues. */
  minCluesPerSide: number
}

/** True when the level's own steps finish the city on exactly this answer. */
function finishes(puzzle: SkyPuzzle, grid: readonly number[], rules: SkyRules): boolean {
  const solve = solveSky(puzzle, rules)
  return solve.solved && skyAnswerKey(solve.grid) === skyAnswerKey(grid)
}

/** The clues standing on each side. */
export function skyCluesPerSide(puzzle: SkyPuzzle): number[] {
  const n = puzzle.size
  return [0, 1, 2, 3].map((side) => puzzle.clues.slice(side * n, (side + 1) * n).filter((c) => c > 0).length)
}

/** True when the city is one the level's steps finish on exactly this answer, and no easier. */
export function skyMeetsLevel(puzzle: SkyPuzzle, grid: readonly number[], needs: Pick<SkyLevelNeeds, 'rules' | 'beyond'>): boolean {
  if (!isSkySolution(puzzle, grid)) return false
  if (!finishes(puzzle, grid, needs.rules)) return false
  return !(needs.beyond && solveSky(puzzle, needs.beyond).solved)
}

/**
 * One city built for the level, kept only when the level's steps solve it
 * to exactly its answer (and, when `beyond` is given, those steps alone do
 * not). Null when this draw does not.
 */
export function drawSkyCandidate(options: SkyLevelNeeds & { rng: StudioRng }): SkyBuilt | null {
  const { size: n, rng, rules } = options
  const grid = drawSkyAnswer(n, rng)
  const clues = skyCluesFor(n, grid)
  const givens = new Array<number>(n * n).fill(0)
  const now = (): SkyPuzzle => ({ size: n, clues, givens })
  // Every clue up, and a plot handed over wherever the level's steps get
  // stuck, until they finish the city: the givens go only where the clues
  // alone cannot lead the reader.
  for (let solve = solveSky(now(), rules); !solve.solved; solve = solveSky(now(), rules)) {
    const stuck = solve.grid.flatMap((v, i) => (v === 0 ? [i] : []))
    // A city that needs more than the level hands over is let go now: rubbing out clues never frees a given.
    if (stuck.length === 0 || givens.filter((v) => v > 0).length >= options.maxGivens) return null
    // Of a handful of stuck plots, the one that, handed over, leaves the fewest open.
    let best = -1
    let fewest = Infinity
    for (const i of rng.sample(stuck, GIVEN_TRIES)) {
      givens[i] = grid[i]!
      const open = solveSky(now(), rules).open
      givens[i] = 0
      if (open < fewest) {
        fewest = open
        best = i
      }
    }
    givens[best] = grid[best]!
  }
  // Then rub out every clue the level's steps can do without, and every given.
  const side = (k: number) => Math.floor(k / n)
  const perSide = [n, n, n, n]
  for (const k of rng.shuffle(Array.from({ length: 4 * n }, (_, j) => j))) {
    if (perSide[side(k)]! <= options.minCluesPerSide) continue
    const keep = clues[k]!
    clues[k] = 0
    if (finishes(now(), grid, rules)) perSide[side(k)]!--
    else clues[k] = keep
  }
  for (const i of rng.shuffle(givens.flatMap((v, k) => (v > 0 ? [k] : [])))) {
    const keep = givens[i]!
    givens[i] = 0
    if (!finishes(now(), grid, rules)) givens[i] = keep
  }
  const puzzle = now()
  if (givens.filter((v) => v > 0).length > options.maxGivens) return null
  if (!skyMeetsLevel(puzzle, grid, options)) return null
  return { puzzle, grid, signature: skySignature(puzzle) }
}

/**
 * A city for the level from this stream: cities built until one is solved
 * by exactly the level's steps, or null when none is within the budget.
 */
export function buildSkyCity(
  options: SkyLevelNeeds & {
    rng: StudioRng
    /** Cities already refused for this page (by signature). */
    exclude?: ReadonlySet<string>
  },
): SkyBuilt | null {
  const { exclude, ...needs } = options
  for (let k = 0; k < SKY_CANDIDATES; k++) {
    const built = drawSkyCandidate(needs)
    if (built && !exclude?.has(built.signature)) return built
  }
  return null
}
