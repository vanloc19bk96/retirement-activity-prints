import type { StudioRng } from '../studio-rng'
import { canonicalHash, gridSymmetries } from '../_shared/uniqueness'
import { STONES_BLANK, isStonesSolution, solveStones, stonesAnswerKey, stonesNeighbours, type StonesPuzzle, type StonesRules } from './solver'

/**
 * Building a Stepping Stones path.
 *
 * The walk comes first: one path through every stone, across or down. It
 * starts as a plain zigzag, row after row, and is then bent thousands of
 * times at random — an end of the walk steps onto a neighbouring stone
 * already on it, and the loop that makes is turned round — until the walk
 * wanders the whole garden with no trace of the zigzag left. Walks that run
 * too straight, with a long run of stones in one line, or that finish close
 * to where they start, are not kept.
 *
 * The numbers come next: every stone gets its place in the walk, and numbers
 * are then taken away one by one, the most crowded first, as long as the
 * level's steps still finish the path on the same walk — so the reader gets few
 * numbers, and each one counts. The start (1) and the finish (the last
 * number) always stay on the page: the reader always knows where the walk
 * begins and ends, and the two lie a fair way apart.
 */

export interface StonesBuilt {
  puzzle: StonesPuzzle
  /** The one path: the number on every stone. */
  values: number[]
  /** Digest of the numbers, the same however the path is turned, mirrored or walked backwards. */
  signature: string
}

/** Walks built before a level gives up on this stream. */
export const STONES_CANDIDATES = 40
/** Numbers a "what if" level tries to take away once the easier steps can spare no more. */
export const STONES_PROBE_TAKES = 12
/** Bends per stone when mixing a walk. */
const BENDS_PER_STONE = 60
/** Tries at a walk with no run that is too straight and its ends a fair way apart. */
const WALK_TRIES = 40

/** The numbers as a grid. */
export function stonesClueGrid(puzzle: StonesPuzzle): number[][] {
  const n = puzzle.size
  return Array.from({ length: n }, (_, r) => puzzle.clues.slice(r * n, (r + 1) * n) as number[])
}

/**
 * A path's own fingerprint: turned or mirrored its numbers are the same
 * puzzle, and so are they walked the other way round (k read as N² + 1 − k).
 */
export function stonesSignature(puzzle: StonesPuzzle): string {
  const N = puzzle.size * puzzle.size
  let best: string | null = null
  const reversed: StonesPuzzle = { size: puzzle.size, clues: puzzle.clues.map((v) => (v === STONES_BLANK ? v : N + 1 - v)) }
  for (const form of [puzzle, reversed]) {
    for (const turned of gridSymmetries(stonesClueGrid(form))) {
      const text = turned.map((row) => row.map((v) => (v === STONES_BLANK ? '.' : String(v))).join(' ')).join('/')
      if (best === null || text < best) best = text
    }
  }
  return canonicalHash(best ?? '')
}

/* ------------------------------------------------------------------ *
 * The walk
 * ------------------------------------------------------------------ */

/** The longest run of stones the walk takes in one straight line. */
export function stonesLongestRun(order: readonly number[]): number {
  let best = Math.min(2, order.length)
  let run = 1
  for (let k = 2; k < order.length; k++) {
    const straight = order[k]! - order[k - 1]! === order[k - 1]! - order[k - 2]!
    run = straight ? run + 1 : 1
    best = Math.max(best, run + 1)
  }
  return best
}

/** Steps between two stones, across and down. */
export const stonesDistance = (n: number, a: number, b: number) => Math.abs(Math.floor(a / n) - Math.floor(b / n)) + Math.abs((a % n) - (b % n))

/** How far apart the walk's start and finish lie, across and down. */
export const stonesEndsApart = (n: number, order: readonly number[]) => stonesDistance(n, order[0]!, order[order.length - 1]!)

/**
 * A walk through every stone of an n × n path: the stones in walking order.
 * A zigzag, bent at random many times over ("backbite": an end steps onto a
 * neighbour already on the walk, and the stretch between is turned round),
 * so it keeps visiting every stone once while losing all trace of the
 * zigzag.
 */
export function drawStonesWalk(n: number, rng: StudioRng): number[] {
  const N = n * n
  const nb = stonesNeighbours(n)
  const walk: number[] = []
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) walk.push(r * n + (r % 2 === 0 ? c : n - 1 - c))
  const index = new Int32Array(N)
  walk.forEach((s, k) => (index[s] = k))
  const turn = (from: number, to: number) => {
    for (let i = from, j = to; i < j; i++, j--) {
      const a = walk[i]!
      walk[i] = walk[j]!
      walk[j] = a
    }
    for (let k = from; k <= to; k++) index[walk[k]!] = k
  }
  const bends = BENDS_PER_STONE * N
  for (let b = 0; b < bends; b++) {
    const head = rng.chance(0.5)
    const end = head ? walk[0]! : walk[N - 1]!
    const t = nb[end * 4 + rng.int(0, 3)]!
    if (t < 0) continue
    const k = index[t]!
    if (head) {
      if (k === 1) continue
      turn(0, k - 1)
    } else {
      if (k === N - 2) continue
      turn(k + 1, N - 1)
    }
  }
  return walk
}

/** The number on every stone for a walk. */
export function stonesValuesOf(n: number, walk: readonly number[]): number[] {
  const values = new Array<number>(n * n).fill(0)
  walk.forEach((s, k) => (values[s] = k + 1))
  return values
}

/* ------------------------------------------------------------------ *
 * The numbers
 * ------------------------------------------------------------------ */

export interface StonesLevelNeeds {
  size: number
  rules: StonesRules
  /** Refuse paths these steps alone finish. */
  beyond?: StonesRules | null
  /** Longest straight run of stones a walk may take. */
  maxRun: number
  /** Fewest and most numbers the page prints, as a share of the stones. */
  clues: readonly [number, number]
}

/** True when the level's own steps finish the path on exactly this walk. */
function finishes(puzzle: StonesPuzzle, values: readonly number[], rules: StonesRules): boolean {
  const done = (r: StonesRules) => {
    const solve = solveStones(puzzle, r)
    return solve.solved && stonesAnswerKey(solve.values) === stonesAnswerKey(values)
  }
  // "What if" only adds to the other steps: a path they finish, it finishes too — and far sooner.
  if (rules === 'probe' && done('link')) return true
  return done(rules)
}

/** How many numbers a path prints. */
export const stonesClueCount = (puzzle: StonesPuzzle) => puzzle.clues.filter((v) => v !== STONES_BLANK).length

/** The fewest and most numbers a level prints on its stones. */
export function stonesClueRange(needs: Pick<StonesLevelNeeds, 'size' | 'clues'>): [number, number] {
  const N = needs.size * needs.size
  return [Math.ceil(needs.clues[0] * N), Math.floor(needs.clues[1] * N)]
}

/** True when the path is one the level's steps finish on exactly this walk, and no easier. */
export function stonesMeetsLevel(puzzle: StonesPuzzle, values: readonly number[], needs: Pick<StonesLevelNeeds, 'rules' | 'beyond'>): boolean {
  if (!isStonesSolution(puzzle, values)) return false
  if (!finishes(puzzle, values, needs.rules)) return false
  return !(needs.beyond && solveStones(puzzle, needs.beyond).solved)
}

/**
 * One path built for the level, kept only when the level's steps solve it
 * to exactly its walk (and, when `beyond` is given, those steps alone do
 * not), with a fair number of numbers left. Null when this draw does not.
 */
export function drawStonesCandidate(options: StonesLevelNeeds & { rng: StudioRng }): StonesBuilt | null {
  const { size: n, rng } = options
  const N = n * n
  let walk: number[] | null = null
  for (let t = 0; t < WALK_TRIES && !walk; t++) {
    const tried = drawStonesWalk(n, rng)
    if (stonesLongestRun(tried) <= options.maxRun && stonesEndsApart(n, tried) >= Math.ceil(n / 2)) walk = tried
  }
  if (!walk) return null
  const values = stonesValuesOf(n, walk)
  const clues = [...values]
  const [fewest, most] = stonesClueRange(options)

  // Take numbers away while the level's steps still finish the path, never
  // the start or the finish, and never below the level's fewest: first
  // while the steps short of "what if" do, then — at a "what if" level — a
  // few more that only "what if" can do without. The most crowded number is
  // tried first, so the ones left spread over the whole path instead of
  // leaving a corner bare.
  const rank = new Map(rng.shuffle(clues.map((_, k) => k)).map((s, i) => [s, i]))
  const crowd = (s: number) => {
    let near = 0
    for (let t = 0; t < N; t++) if (t !== s && clues[t] !== STONES_BLANK && stonesDistance(n, s, t) <= 2) near++
    return near
  }
  const nextToTry = (tried: ReadonlySet<number>) => {
    let best = -1
    let bestCrowd = -1
    for (let s = 0; s < N; s++) {
      if (clues[s] === STONES_BLANK || values[s] === 1 || values[s] === N || tried.has(s)) continue
      const c = crowd(s)
      if (c > bestCrowd || (c === bestCrowd && rank.get(s)! < rank.get(best)!)) {
        best = s
        bestCrowd = c
      }
    }
    return best
  }
  const first: StonesRules = options.rules === 'probe' ? 'link' : options.rules
  let left = N
  const kept = new Set<number>()
  for (let s = nextToTry(kept); s >= 0 && left > fewest; s = nextToTry(kept)) {
    const keep = clues[s]!
    clues[s] = STONES_BLANK
    if (finishes({ size: n, clues }, values, first)) left--
    else {
      clues[s] = keep
      kept.add(s)
    }
  }
  if (options.rules === 'probe') {
    const tried = new Set<number>()
    for (let s = nextToTry(tried); s >= 0 && left > fewest && tried.size < STONES_PROBE_TAKES; s = nextToTry(tried)) {
      tried.add(s)
      const keep = clues[s]!
      clues[s] = STONES_BLANK
      if (finishes({ size: n, clues }, values, 'probe')) left--
      else clues[s] = keep
    }
  }
  if (left > most) return null
  const puzzle: StonesPuzzle = { size: n, clues }
  if (!stonesMeetsLevel(puzzle, values, options)) return null
  return { puzzle, values, signature: stonesSignature(puzzle) }
}

/**
 * A path for the level from this stream: paths built until one is solved
 * by exactly the level's steps, or null when none is within the budget.
 */
export function buildStonesPath(
  options: StonesLevelNeeds & {
    rng: StudioRng
    /** Paths already refused for this page (by signature). */
    exclude?: ReadonlySet<string>
  },
): StonesBuilt | null {
  const { exclude, ...needs } = options
  for (let k = 0; k < STONES_CANDIDATES; k++) {
    const built = drawStonesCandidate(needs)
    if (built && !exclude?.has(built.signature)) return built
  }
  return null
}
