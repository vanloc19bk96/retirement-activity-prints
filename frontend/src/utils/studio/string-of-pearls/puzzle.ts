import type { StudioRng } from '../studio-rng'
import { canonicalHash, gridSymmetries } from '../_shared/uniqueness'
import {
  PEARL_BLACK,
  PEARL_NONE,
  PEARL_WHITE,
  isPearl,
  isPearlSolution,
  pearlAnswerKey,
  pearlLinkBetween,
  pearlLoopOrder,
  solvePearl,
  type PearlPuzzle,
  type PearlRules,
} from './solver'

/**
 * Building a String of Pearls board.
 *
 * The necklace comes first. A patch of the board's inner corners is grown
 * one at a time from a random start — never leaving a hole, never touching
 * itself corner to corner — and its outline is the necklace: one closed
 * loop through square centres that never crosses or touches itself. Only
 * necklaces that wander over enough of the board are kept.
 *
 * The pearls come next: a black pearl may sit wherever the necklace turns
 * with a straight run on both sides, a white pearl wherever it runs straight
 * with a turn beside it. Every such pearl goes down, the solver decides
 * whether a reader can thread the necklace from them without guessing using
 * exactly the level's steps, and pearls are then taken away one by one, in
 * random order, as long as the level's steps still finish the board on the
 * same necklace — so the reader gets few pearls, and each one counts.
 */

export interface PearlBuilt {
  puzzle: PearlPuzzle
  /** The one necklace: its links, in order. */
  links: number[]
  /** Digest of the pearls, the same however the board is turned or mirrored. */
  signature: string
}

/** Boards built before a level gives up on this stream. */
export const PEARL_CANDIDATES = 120
/** Tries at growing a necklace that wanders over enough of the board. */
const LOOP_TRIES = 40

/** The pearls as a grid. */
export function pearlCellGrid(puzzle: PearlPuzzle): number[][] {
  const n = puzzle.size
  return Array.from({ length: n }, (_, r) => puzzle.cells.slice(r * n, (r + 1) * n) as number[])
}

/** A board's own fingerprint: turned or mirrored, its pearls are the same puzzle. */
export function pearlSignature(puzzle: PearlPuzzle): string {
  let best: string | null = null
  for (const turned of gridSymmetries(pearlCellGrid(puzzle))) {
    const form = turned.map((row) => row.join('')).join('/')
    if (best === null || form < best) best = form
  }
  return canonicalHash(best ?? '')
}

/* ------------------------------------------------------------------ *
 * The necklace
 * ------------------------------------------------------------------ */

/**
 * The outline of a patch of inner corners (an (n−1) × (n−1) grid, `inside`
 * per corner square) as links: a link lies on the outline when exactly one
 * of the two corner squares beside it is in the patch.
 */
export function pearlOutline(n: number, inside: ArrayLike<number>): number[] {
  const m = n - 1
  const has = (fr: number, fc: number) => fr >= 0 && fr < m && fc >= 0 && fc < m && inside[fr * m + fc] === 1
  const links: number[] = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c
      // Across to the right: the corner squares above and below it.
      if (c < n - 1 && has(r - 1, c) !== has(r, c)) links.push(pearlLinkBetween(n, i, i + 1))
      // Down: the corner squares left and right of it.
      if (r < n - 1 && has(r, c - 1) !== has(r, c)) links.push(pearlLinkBetween(n, i, i + n))
    }
  }
  return links.sort((a, b) => a - b)
}

/** True when the four corner squares round lattice point (r, c) touch only corner to corner. */
function pinched(m: number, inside: ArrayLike<number>, r: number, c: number): boolean {
  const has = (fr: number, fc: number) => (fr >= 0 && fr < m && fc >= 0 && fc < m && inside[fr * m + fc] === 1 ? 1 : 0)
  const a = has(r - 1, c - 1)
  const b = has(r - 1, c)
  const d = has(r, c - 1)
  const e = has(r, c)
  return (a === 1 && e === 1 && b === 0 && d === 0) || (b === 1 && d === 1 && a === 0 && e === 0)
}

/** True when every corner square outside the patch can walk to the board's edge. */
function holeFree(m: number, inside: ArrayLike<number>): boolean {
  const seen = new Uint8Array(m * m)
  const stack: number[] = []
  let outside = 0
  for (let k = 0; k < m * m; k++) {
    if (inside[k]) continue
    outside++
    const r = Math.floor(k / m)
    const c = k % m
    if (r === 0 || c === 0 || r === m - 1 || c === m - 1) {
      seen[k] = 1
      stack.push(k)
    }
  }
  let reached = stack.length
  while (stack.length > 0) {
    const k = stack.pop()!
    const r = Math.floor(k / m)
    const c = k % m
    for (const j of [r > 0 ? k - m : -1, r < m - 1 ? k + m : -1, c > 0 ? k - 1 : -1, c < m - 1 ? k + 1 : -1]) {
      if (j < 0 || seen[j] || inside[j]) continue
      seen[j] = 1
      reached++
      stack.push(j)
    }
  }
  return reached === outside
}

/**
 * How much of the patch's outline no pearl can mark: a corner beside
 * another corner (a step), or a straight with straights on both sides (the
 * middle of a long run). Where a necklace is bare, nothing pins it down, and
 * a reader is left to guess.
 */
export function pearlBare(n: number, inside: ArrayLike<number>): { bare: number; length: number } {
  const m = n - 1
  const has = (fr: number, fc: number) => (fr >= 0 && fr < m && fc >= 0 && fc < m && inside[fr * m + fc] === 1 ? 1 : 0)
  // Per lattice point: how many corner squares round it are in the patch (1 or 3: a corner of the outline; 2: straight).
  const round = new Uint8Array(n * n)
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) round[r * n + c] = has(r - 1, c - 1) + has(r - 1, c) + has(r, c - 1) + has(r, c)
  }
  const onLoop = (i: number) => round[i]! > 0 && round[i]! < 4
  const corner = (i: number) => round[i] === 1 || round[i] === 3
  let bare = 0
  let length = 0
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c
      if (!onLoop(i)) continue
      length++
      // Its two neighbours along the outline.
      const along: number[] = []
      if (c < n - 1 && has(r - 1, c) !== has(r, c)) along.push(i + 1)
      if (c > 0 && has(r - 1, c - 1) !== has(r, c - 1)) along.push(i - 1)
      if (r < n - 1 && has(r, c - 1) !== has(r, c)) along.push(i + n)
      if (r > 0 && has(r - 1, c - 1) !== has(r - 1, c)) along.push(i - n)
      const turnsBeside = along.filter(corner).length
      if (corner(i) ? turnsBeside > 0 : turnsBeside === 0) bare++
    }
  }
  return { bare, length }
}

/** Most of a necklace's squares that may be bare. */
export const PEARL_MAX_BARE = 0.2

/**
 * A necklace threading at least `cover` of the board's squares: its links,
 * or null when no try wanders far enough. The patch grows a corner square
 * at a time — never leaving a hole, never touching itself corner to corner
 * — mostly where its outline is left least bare, so the necklace runs in
 * short straights and wide bends that pearls can mark.
 */
export function drawPearlLoop(n: number, rng: StudioRng, cover: number): number[] | null {
  const m = n - 1
  const want = Math.ceil(cover * n * n)
  for (let t = 0; t < LOOP_TRIES; t++) {
    const inside = new Uint8Array(m * m)
    inside[rng.int(0, m * m - 1)] = 1
    let area = 1
    let best: { links: number[]; share: number } | null = null
    const limit = Math.round(m * m * 0.7)
    while (area < limit) {
      const options: { k: number; bare: number }[] = []
      for (let k = 0; k < m * m; k++) {
        if (inside[k]) continue
        const r = Math.floor(k / m)
        const c = k % m
        const touching = [r > 0 ? k - m : -1, r < m - 1 ? k + m : -1, c > 0 ? k - 1 : -1, c < m - 1 ? k + 1 : -1].some((j) => j >= 0 && inside[j])
        if (!touching) continue
        inside[k] = 1
        if (!pinched(m, inside, r, c) && !pinched(m, inside, r, c + 1) && !pinched(m, inside, r + 1, c) && !pinched(m, inside, r + 1, c + 1) && holeFree(m, inside)) {
          const { bare, length } = pearlBare(n, inside)
          options.push({ k, bare: bare / length })
        }
        inside[k] = 0
      }
      if (options.length === 0) break
      // Mostly the growth that leaves the least bare necklace; now and then any, so shapes vary.
      const fewest = Math.min(...options.map((o) => o.bare))
      const pool = rng.chance(0.85) ? options.filter((o) => o.bare <= fewest + 1e-9) : options
      inside[rng.pick(pool).k] = 1
      area++
      const { bare, length } = pearlBare(n, inside)
      const share = bare / length
      if (length >= want && share <= PEARL_MAX_BARE && (!best || share < best.share || (share === best.share && rng.chance(0.5)))) {
        best = { links: pearlOutline(n, inside), share }
      }
    }
    if (best && pearlLoopOrder(n, best.links)) return best.links
  }
  return null
}

/* ------------------------------------------------------------------ *
 * The pearls
 * ------------------------------------------------------------------ */

/**
 * Every pearl the necklace allows: black where it turns with a straight run
 * on both sides, white where it runs straight with a turn beside it.
 */
export function pearlSpots(n: number, links: readonly number[]): number[] {
  const order = pearlLoopOrder(n, links)
  const cells = new Array<number>(n * n).fill(PEARL_NONE)
  if (!order) return cells
  const L = order.length
  const turns = order.map((cur, k) => {
    const prev = order[(k - 1 + L) % L]!
    const next = order[(k + 1) % L]!
    return cur - prev !== next - cur
  })
  order.forEach((cur, k) => {
    const before = turns[(k - 1 + L) % L]!
    const after = turns[(k + 1) % L]!
    if (turns[k] && !before && !after) cells[cur] = PEARL_BLACK
    else if (!turns[k] && (before || after)) cells[cur] = PEARL_WHITE
  })
  return cells
}

export interface PearlLevelNeeds {
  size: number
  /** Least share of the board's squares the necklace threads. */
  cover: number
  rules: PearlRules
  /** Refuse boards these steps alone finish. */
  beyond?: PearlRules | null
  /** The fewest pearls a board of the level prints. */
  minPearls: number
}

/** True when the level's own steps finish the board on exactly this necklace. */
function finishes(puzzle: PearlPuzzle, links: readonly number[], rules: PearlRules): boolean {
  const done = (r: PearlRules) => {
    const solve = solvePearl(puzzle, r)
    return solve.solved && pearlAnswerKey(solve.links) === pearlAnswerKey(links)
  }
  // "What if" only adds to the other steps: a board they finish, it finishes too — and far sooner.
  if (rules === 'probe' && done('loop')) return true
  return done(rules)
}

/** True when the board is one the level's steps finish on exactly this necklace, and no easier. */
export function pearlMeetsLevel(puzzle: PearlPuzzle, links: readonly number[], needs: Pick<PearlLevelNeeds, 'rules' | 'beyond'>): boolean {
  if (!isPearlSolution(puzzle, links)) return false
  if (!finishes(puzzle, links, needs.rules)) return false
  return !(needs.beyond && solvePearl(puzzle, needs.beyond).solved)
}

/**
 * One board built for the level, kept only when the level's steps solve it
 * to exactly its necklace (and, when `beyond` is given, those steps alone
 * do not). Null when this draw does not.
 */
export function drawPearlCandidate(options: PearlLevelNeeds & { rng: StudioRng }): PearlBuilt | null {
  const { size: n, rng } = options
  const links = drawPearlLoop(n, rng, options.cover)
  if (!links) return null
  const cells = pearlSpots(n, links)
  if (!finishes({ size: n, cells }, links, options.rules)) return null

  // Take pearls away while the level's steps still finish the board, keeping at least one of each colour.
  let pearls = cells.filter(isPearl).length
  const left = { [PEARL_WHITE]: cells.filter((v) => v === PEARL_WHITE).length, [PEARL_BLACK]: cells.filter((v) => v === PEARL_BLACK).length }
  if (left[PEARL_WHITE] === 0 || left[PEARL_BLACK] === 0) return null
  for (const i of rng.shuffle(cells.flatMap((v, k) => (isPearl(v) ? [k] : [])))) {
    if (pearls <= options.minPearls) break
    const keep = cells[i]! as typeof PEARL_WHITE | typeof PEARL_BLACK
    if (left[keep] <= 1) continue
    cells[i] = PEARL_NONE
    if (finishes({ size: n, cells }, links, options.rules)) {
      pearls--
      left[keep]--
    } else cells[i] = keep
  }
  const puzzle: PearlPuzzle = { size: n, cells }
  if (!pearlMeetsLevel(puzzle, links, options)) return null
  return { puzzle, links, signature: pearlSignature(puzzle) }
}

/**
 * A board for the level from this stream: boards built until one is solved
 * by exactly the level's steps, or null when none is within the budget.
 */
export function buildPearlBoard(
  options: PearlLevelNeeds & {
    rng: StudioRng
    /** Boards already refused for this page (by signature). */
    exclude?: ReadonlySet<string>
  },
): PearlBuilt | null {
  const { exclude, ...needs } = options
  for (let k = 0; k < PEARL_CANDIDATES; k++) {
    const built = drawPearlCandidate(needs)
    if (built && !exclude?.has(built.signature)) return built
  }
  return null
}

/** Pearls of each colour on a board. */
export function pearlCounts(puzzle: PearlPuzzle): { white: number; black: number } {
  let white = 0
  let black = 0
  for (const v of puzzle.cells) {
    if (v === PEARL_WHITE) white++
    else if (v === PEARL_BLACK) black++
  }
  return { white, black }
}
