import type { StudioRng } from '../studio-rng'
import { canonicalHash, gridSymmetries } from '../_shared/uniqueness'
import { FENCE_BLANK, fenceAnswerKey, fenceCounts, fenceGeometry, fenceLoopOrder, isFenceSolution, solveFence, type FencePuzzle, type FenceRules } from './solver'

/**
 * Building a Country Fence field.
 *
 * The pasture comes first. A patch of squares is grown one at a time from a
 * random start — never leaving a hole, never touching itself corner to
 * corner — and its outline is the fence: one closed loop along the posts
 * that never crosses, branches or touches itself. The patch mostly grows
 * sideways off its thinnest parts, so the fence wanders in and out in bays
 * and headlands instead of running round a plain block. Only pastures that
 * take a fair share of the field, with a fence long enough to be worth
 * building, are kept.
 *
 * The numbers come next: every square gets the count of its sides the fence
 * runs along, the solver decides whether a reader can build the fence from
 * them without guessing using exactly the level's steps, and numbers are
 * then taken away one by one, in random order, as long as the level's steps
 * still finish the field on the same fence — so the reader gets few
 * numbers, and each one counts.
 */

export interface FenceBuilt {
  puzzle: FencePuzzle
  /** The one fence: its rails. */
  rails: number[]
  /** Digest of the numbers, the same however the field is turned or mirrored. */
  signature: string
}

/** Fields built before a level gives up on this stream. */
export const FENCE_CANDIDATES = 60
/** Numbers a "what if" level tries to take away once the easier steps can spare no more. */
export const FENCE_PROBE_TAKES = 12
/** Tries at growing a pasture with a long enough fence. */
const PASTURE_TRIES = 30

/** The numbers as a grid. */
export function fenceClueGrid(puzzle: FencePuzzle): number[][] {
  const n = puzzle.size
  return Array.from({ length: n }, (_, r) => puzzle.clues.slice(r * n, (r + 1) * n) as number[])
}

/** A field's own fingerprint: turned or mirrored, its numbers are the same puzzle. */
export function fenceSignature(puzzle: FencePuzzle): string {
  let best: string | null = null
  for (const turned of gridSymmetries(fenceClueGrid(puzzle))) {
    const form = turned.map((row) => row.map((v) => (v === FENCE_BLANK ? '.' : String(v))).join('')).join('/')
    if (best === null || form < best) best = form
  }
  return canonicalHash(best ?? '')
}

/* ------------------------------------------------------------------ *
 * The pasture
 * ------------------------------------------------------------------ */

/** The outline of a patch of squares (`inside` per square) as rails: a rail lies on it when exactly one square beside it is in the patch. */
export function fenceOutline(n: number, inside: ArrayLike<number>): number[] {
  const g = fenceGeometry(n)
  const rails: number[] = []
  for (let e = 0; e < g.rails; e++) {
    const a = g.beside[e * 2]!
    const b = g.beside[e * 2 + 1]!
    const ia = a >= 0 && inside[a] === 1
    const ib = b >= 0 && inside[b] === 1
    if (ia !== ib) rails.push(e)
  }
  return rails
}

/** True when the four squares round post (r, c) touch only corner to corner. */
function pinched(n: number, inside: ArrayLike<number>, r: number, c: number): boolean {
  const has = (sr: number, sc: number) => (sr >= 0 && sr < n && sc >= 0 && sc < n && inside[sr * n + sc] === 1 ? 1 : 0)
  const a = has(r - 1, c - 1)
  const b = has(r - 1, c)
  const d = has(r, c - 1)
  const e = has(r, c)
  return (a === 1 && e === 1 && b === 0 && d === 0) || (b === 1 && d === 1 && a === 0 && e === 0)
}

/** True when every square outside the patch can walk to the field's edge. */
function holeFree(n: number, inside: ArrayLike<number>): boolean {
  const seen = new Uint8Array(n * n)
  const stack: number[] = []
  let outside = 0
  for (let k = 0; k < n * n; k++) {
    if (inside[k]) continue
    outside++
    const r = Math.floor(k / n)
    const c = k % n
    if (r === 0 || c === 0 || r === n - 1 || c === n - 1) {
      seen[k] = 1
      stack.push(k)
    }
  }
  let reached = stack.length
  while (stack.length > 0) {
    const k = stack.pop()!
    const r = Math.floor(k / n)
    const c = k % n
    for (const j of [r > 0 ? k - n : -1, r < n - 1 ? k + n : -1, c > 0 ? k - 1 : -1, c < n - 1 ? k + 1 : -1]) {
      if (j < 0 || seen[j] || inside[j]) continue
      seen[j] = 1
      reached++
      stack.push(j)
    }
  }
  return reached === outside
}

const neighbours = (n: number, k: number) => {
  const r = Math.floor(k / n)
  const c = k % n
  return [r > 0 ? k - n : -1, r < n - 1 ? k + n : -1, c > 0 ? k - 1 : -1, c < n - 1 ? k + 1 : -1].filter((j) => j >= 0)
}

export interface FencePastureNeeds {
  /** Least and most share of the field's squares the pasture takes. */
  area: readonly [number, number]
  /** Least fence length, as rails per square of the field. */
  length: number
}

/**
 * A pasture: the fence's rails, or null when no try grows one with a long
 * enough fence. The patch grows a square at a time — never leaving a hole,
 * never touching itself corner to corner — mostly onto squares that touch
 * it on one side only, so it reaches out in arms and the fence wanders.
 */
export function drawFencePasture(n: number, rng: StudioRng, needs: FencePastureNeeds): number[] | null {
  const cells = n * n
  const wantLength = Math.ceil(needs.length * cells)
  for (let t = 0; t < PASTURE_TRIES; t++) {
    const target = Math.round(cells * (needs.area[0] + rng.next() * (needs.area[1] - needs.area[0])))
    const inside = new Uint8Array(cells)
    inside[rng.int(0, cells - 1)] = 1
    let area = 1
    while (area < target) {
      const options: { k: number; touching: number }[] = []
      for (let k = 0; k < cells; k++) {
        if (inside[k]) continue
        const touching = neighbours(n, k).filter((j) => inside[j]).length
        if (touching === 0) continue
        inside[k] = 1
        const r = Math.floor(k / n)
        const c = k % n
        if (!pinched(n, inside, r, c) && !pinched(n, inside, r, c + 1) && !pinched(n, inside, r + 1, c) && !pinched(n, inside, r + 1, c + 1) && holeFree(n, inside)) {
          options.push({ k, touching })
        }
        inside[k] = 0
      }
      if (options.length === 0) break
      // Mostly squares touching on one side, so the pasture reaches out; now and then any, so shapes vary.
      const reaching = options.filter((o) => o.touching === 1)
      const pool = reaching.length > 0 && rng.chance(0.8) ? reaching : options
      inside[rng.pick(pool).k] = 1
      area++
    }
    if (area < Math.round(cells * needs.area[0])) continue
    const rails = fenceOutline(n, inside)
    if (rails.length >= wantLength && fenceLoopOrder(n, rails)) return rails
  }
  return null
}

/* ------------------------------------------------------------------ *
 * The numbers
 * ------------------------------------------------------------------ */

export interface FenceLevelNeeds extends FencePastureNeeds {
  size: number
  rules: FenceRules
  /** Refuse fields these steps alone finish. */
  beyond?: FenceRules | null
}

/** True when the level's own steps finish the field on exactly this fence. */
function finishes(puzzle: FencePuzzle, rails: readonly number[], rules: FenceRules): boolean {
  const done = (r: FenceRules) => {
    const solve = solveFence(puzzle, r)
    return solve.solved && fenceAnswerKey(solve.rails) === fenceAnswerKey(rails)
  }
  // "What if" only adds to the other steps: a field they finish, it finishes too — and far sooner.
  if (rules === 'probe' && done('loop')) return true
  return done(rules)
}

/** True when the field is one the level's steps finish on exactly this fence, and no easier. */
export function fenceMeetsLevel(puzzle: FencePuzzle, rails: readonly number[], needs: Pick<FenceLevelNeeds, 'rules' | 'beyond'>): boolean {
  if (!isFenceSolution(puzzle, rails)) return false
  if (!finishes(puzzle, rails, needs.rules)) return false
  return !(needs.beyond && solveFence(puzzle, needs.beyond).solved)
}

/**
 * One field built for the level, kept only when the level's steps solve it
 * to exactly its fence (and, when `beyond` is given, those steps alone do
 * not). Null when this draw does not.
 */
export function drawFenceCandidate(options: FenceLevelNeeds & { rng: StudioRng }): FenceBuilt | null {
  const { size: n, rng } = options
  const rails = drawFencePasture(n, rng, options)
  if (!rails) return null
  const clues = fenceCounts(n, rails)
  if (!finishes({ size: n, clues }, rails, options.rules)) return null

  // Take numbers away while the level's steps still finish the field: first
  // while the steps short of "what if" do, then — at a "what if" level — a
  // few more that only "what if" can do without.
  const order = rng.shuffle(clues.map((_, k) => k))
  const first: FenceRules = options.rules === 'probe' ? 'loop' : options.rules
  for (const s of order) {
    const keep = clues[s]!
    clues[s] = FENCE_BLANK
    if (!finishes({ size: n, clues }, rails, first)) clues[s] = keep
  }
  if (options.rules === 'probe') {
    let tries = 0
    for (const s of order) {
      if (clues[s] === FENCE_BLANK) continue
      if (tries++ >= FENCE_PROBE_TAKES) break
      const keep = clues[s]!
      clues[s] = FENCE_BLANK
      if (!finishes({ size: n, clues }, rails, 'probe')) clues[s] = keep
    }
  }
  const puzzle: FencePuzzle = { size: n, clues }
  if (!fenceMeetsLevel(puzzle, rails, options)) return null
  return { puzzle, rails: [...rails].sort((a, b) => a - b), signature: fenceSignature(puzzle) }
}

/**
 * A field for the level from this stream: fields built until one is solved
 * by exactly the level's steps, or null when none is within the budget.
 */
export function buildFenceField(
  options: FenceLevelNeeds & {
    rng: StudioRng
    /** Fields already refused for this page (by signature). */
    exclude?: ReadonlySet<string>
  },
): FenceBuilt | null {
  const { exclude, ...needs } = options
  for (let k = 0; k < FENCE_CANDIDATES; k++) {
    const built = drawFenceCandidate(needs)
    if (built && !exclude?.has(built.signature)) return built
  }
  return null
}

/** How many numbers a field prints. */
export const fenceClueCount = (puzzle: FencePuzzle) => puzzle.clues.filter((v) => v !== FENCE_BLANK).length
