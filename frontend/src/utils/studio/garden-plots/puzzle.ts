import type { StudioRng } from '../studio-rng'
import { canonicalHash, gridSymmetries } from '../_shared/uniqueness'
import { gpFlowerList, gpFlowersOf, gpSolutions, isGpSolution, solveGp, type GpPuzzle, type GpRules } from './solver'

/**
 * Building a Garden Plots garden.
 *
 * The answer comes first: one flower in every row and column, none touching
 * (a row-by-row draw that never puts a flower beside the one above it).
 * Every flower then starts a bed of its own, and the beds grow a square at a
 * time into the open ground round them until the garden is full, so the
 * answer always keeps one flower to a bed. A freshly grown garden nearly
 * always has other answers too. Each other answer plants a flower on some
 * square the true answer leaves empty; handing that square to a
 * neighbouring bed leaves the other answer with two flowers in one bed and
 * none in another, so it is gone. Round by round, the hand-over that leaves
 * fewest answers is made (a piece the square held on to its bed goes with
 * it, so every bed stays in one patch, and no bed drops below two squares),
 * until one answer is left. The solver then decides whether a reader can
 * reach it without guessing, using exactly the level's steps.
 */

export interface GpBuilt {
  puzzle: GpPuzzle
  /** The one answer: each row's flower, row 0 first. */
  flowers: number[]
  /** Digest of the garden, the same however it is turned or mirrored. */
  signature: string
}

/** Gardens grown before a level gives up on this stream. */
export const GP_CANDIDATES = 80
/** Rounds of hand-overs before one garden is given up. */
const ROUNDS = 60
/** Other answers looked at, and squares tried, each round. */
const ANSWERS_SEEN = 40
const SQUARES_TRIED = 12
/** The smallest bed: a bed of one square is a flower printed for the reader. */
export const GP_MIN_BED = 2

/** A garden's own fingerprint: turned or mirrored, its beds renumbered to match, it is the same puzzle. */
export function gpSignature(puzzle: GpPuzzle): string {
  const n = puzzle.size
  const grid = Array.from({ length: n }, (_, r) => puzzle.beds.slice(r * n, (r + 1) * n))
  let best: string | null = null
  for (const turned of gridSymmetries(grid)) {
    const renumber = new Map<number, number>()
    const form = turned
      .map((row) =>
        row
          .map((b) => {
            if (!renumber.has(b)) renumber.set(b, renumber.size)
            return String(renumber.get(b))
          })
          .join(','),
      )
      .join('/')
    if (best === null || form < best) best = form
  }
  return canonicalHash(best ?? '')
}

/** One flower per row and column, none touching: each row's column, or null when the draw runs dry. */
export function drawGpFlowers(n: number, rng: StudioRng): number[] | null {
  const cols: number[] = []
  const used = new Array<boolean>(n).fill(false)
  let budget = 4000
  const place = (r: number): boolean => {
    if (r === n) return true
    for (const c of rng.shuffle(Array.from({ length: n }, (_, k) => k))) {
      if (--budget < 0) return false
      if (used[c] || (r > 0 && Math.abs(c - cols[r - 1]!) <= 1)) continue
      used[c] = true
      cols.push(c)
      if (place(r + 1)) return true
      cols.pop()
      used[c] = false
    }
    return false
  }
  return place(0) ? cols : null
}

const sideNeighbours = (i: number, n: number): number[] => {
  const r = Math.floor(i / n)
  const c = i % n
  const out: number[] = []
  if (r > 0) out.push(i - n)
  if (r + 1 < n) out.push(i + n)
  if (c > 0) out.push(i - 1)
  if (c + 1 < n) out.push(i + 1)
  return out
}

/** Beds grown from each flower until the garden is full; bed k holds row k's flower. */
export function growGpBeds(n: number, flowers: readonly number[], rng: StudioRng): number[] {
  const beds = new Array<number>(n * n).fill(-1)
  const sizes = new Array<number>(n).fill(1)
  flowers.forEach((i, k) => {
    beds[i] = k
  })
  // Some beds are greedier than others: gardens have a lawn and a herb patch.
  const appetite = Array.from({ length: n }, () => 0.35 + rng.next() * 1.3)
  let left = n * n - n
  while (left > 0) {
    const weights = appetite.map((a, k) => a / Math.sqrt(sizes[k]!))
    // A weighted draw among the beds, then a random square on its edge.
    let chosen = -1
    let frontier: number[] = []
    for (let tries = 0; tries < n * 2 && chosen < 0; tries++) {
      let x = rng.next() * weights.reduce((a, b) => a + b, 0)
      let bed = 0
      for (; bed < n - 1; bed++) {
        x -= weights[bed]!
        if (x <= 0) break
      }
      const edge = new Set<number>()
      beds.forEach((b, i) => {
        if (b !== bed) return
        for (const j of sideNeighbours(i, n)) if (beds[j] === -1) edge.add(j)
      })
      if (edge.size > 0) {
        chosen = bed
        frontier = [...edge]
      } else weights[bed] = 0
    }
    if (chosen < 0) break
    const cell = rng.pick(frontier)
    beds[cell] = chosen
    sizes[chosen]!++
    left--
  }
  return beds
}

/**
 * The beds with square `i` handed to bed `to`. Any piece of its old bed that
 * the square held on to the bed's flower goes with it (it touches the square,
 * so the new bed stays in one patch). Null when the square is a flower's or
 * the old bed would drop below GP_MIN_BED squares.
 */
export function gpHandOver(n: number, beds: readonly number[], flowers: readonly number[], i: number, to: number): number[] | null {
  const from = beds[i]!
  const home = flowers[from]!
  if (home === i || from === to) return null
  const out = [...beds]
  out[i] = to
  const kept = new Set([home])
  const stack = [home]
  while (stack.length > 0) {
    const x = stack.pop()!
    for (const j of sideNeighbours(x, n)) {
      if (out[j] === from && !kept.has(j)) {
        kept.add(j)
        stack.push(j)
      }
    }
  }
  if (kept.size < GP_MIN_BED) return null
  out.forEach((b, j) => {
    if (b === from && !kept.has(j)) out[j] = to
  })
  return out
}

export interface GpLevelNeeds {
  size: number
  rules: GpRules
  /** Refuse gardens these steps alone finish. */
  beyond?: GpRules | null
  /** The fewest group or "what if" steps the garden must take (Challenging asks for two). */
  minSets?: number
}

/** True when the garden is one the level's steps finish on exactly this answer, and no easier. */
export function gpMeetsLevel(puzzle: GpPuzzle, flowers: readonly number[], needs: GpLevelNeeds): boolean {
  if (!isGpSolution(puzzle, flowers)) return false
  for (let k = 0; k < puzzle.size; k++) if (puzzle.beds.filter((b) => b === k).length < GP_MIN_BED) return false
  const solve = solveGp(puzzle, needs.rules)
  if (!solve.solved || gpFlowerList(gpFlowersOf(solve.state)) !== gpFlowerList(flowers)) return false
  if (needs.beyond && solveGp(puzzle, needs.beyond).solved) return false
  return solve.tally.sets + solve.tally.probe >= (needs.minSets ?? 0)
}

/**
 * One garden grown for the level, kept only when the level's steps solve it
 * to exactly its answer (and, when `beyond` is given, those steps alone do
 * not). Null when this draw does not.
 */
export function drawGpCandidate(options: GpLevelNeeds & { rng: StudioRng }): GpBuilt | null {
  const { size: n, rng } = options
  const cols = drawGpFlowers(n, rng)
  if (!cols) return null
  const flowers = cols.map((c, r) => r * n + c)
  const answer = new Set(flowers)
  let beds = growGpBeds(n, flowers, rng)
  if (beds.includes(-1)) return null
  for (let round = 0; round < ROUNDS; round++) {
    const answers = gpSolutions({ size: n, beds }, ANSWERS_SEEN)
    if (answers.length === 1) {
      const puzzle: GpPuzzle = { size: n, beds }
      return gpMeetsLevel(puzzle, flowers, options) ? { puzzle, flowers, signature: gpSignature(puzzle) } : null
    }
    // Squares where another answer plants a flower and the true one does not.
    const squares = [...new Set(answers.flat().filter((i) => !answer.has(i)))]
    let best: { beds: number[]; left: number } | null = null
    for (const i of rng.shuffle(squares).slice(0, SQUARES_TRIED)) {
      for (const to of new Set(sideNeighbours(i, n).map((j) => beds[j]!))) {
        const moved = gpHandOver(n, beds, flowers, i, to)
        if (!moved) continue
        const left = gpSolutions({ size: n, beds: moved }, ANSWERS_SEEN).length
        if (!best || left < best.left) best = { beds: moved, left }
      }
    }
    if (!best) return null
    beds = best.beds
  }
  return null
}

/**
 * A garden for the level from this stream: gardens grown until one is solved
 * by exactly the level's steps, or null when none is within the budget.
 */
export function buildGpGarden(
  options: GpLevelNeeds & {
    rng: StudioRng
    /** Gardens already refused for this page (by signature). */
    exclude?: ReadonlySet<string>
  },
): GpBuilt | null {
  const { exclude, ...needs } = options
  for (let k = 0; k < GP_CANDIDATES; k++) {
    const built = drawGpCandidate(needs)
    if (built && !exclude?.has(built.signature)) return built
  }
  return null
}
