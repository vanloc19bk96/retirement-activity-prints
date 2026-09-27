/**
 * Garden Plots (Queens / one-star Star Battle): the rules, and a reader's way
 * of solving.
 *
 * A square garden of N × N squares is split into N garden beds. The reader
 * plants N flowers. A finished garden obeys:
 *
 * - exactly one flower in every row, every column and every bed;
 * - no two flowers touch, not even corner to corner.
 *
 * The solver works the way a reader does, one sure step at a time, and never
 * guesses. It keeps a pencil mark on every square (flower, crossed off, or
 * not yet known). Every step follows from the rules alone, so a garden the
 * solver finishes has exactly one answer. What it may use depends on the
 * level:
 *
 * - `basic` — crossing off and counting: a flower crosses off its row, its
 *   column, its bed and the eight squares round it; a row, column or bed
 *   with one open square left takes its flower there; a bed whose open
 *   squares all lie in one row (or column) owns that row, so the rest of the
 *   row is crossed off (and a row whose open squares all lie in one bed owns
 *   that bed); and a square that would, with a flower, cross off every open
 *   square of some row, column or bed is crossed off itself.
 * - `sets` — adds counting groups: when two beds (or three, or four) have
 *   every open square inside the same two rows (or three, or four), those
 *   rows' flowers all belong to those beds, so the rest of the rows is
 *   crossed off; the same for columns, and for rows (or columns) that lie
 *   inside as many beds.
 * - `probe` — adds "what if": a square where a flower would lead, by the
 *   basic steps, straight to a broken rule is crossed off.
 */

export interface GpPuzzle {
  /** Squares across and down; also the number of beds and flowers. */
  size: number
  /** Flat (row × size + col): the bed (0 … size − 1) each square belongs to. */
  beds: readonly number[]
}

export type GpRules = 'basic' | 'sets' | 'probe'

const RANK: Record<GpRules, number> = { basic: 0, sets: 1, probe: 2 }

export const UNKNOWN = -1
export const EMPTY = 0
export const FLOWER = 1

interface Geometry {
  /** Rows, then columns, then beds: each the squares it holds. */
  units: number[][]
  /** Each square's three units (its row, its column, its bed). */
  unitsOf: [number, number, number][]
  /** Each square's neighbours, corners included. */
  around: number[][]
}

const geometryCache = new WeakMap<GpPuzzle, Geometry>()

function geometry(p: GpPuzzle): Geometry {
  const cached = geometryCache.get(p)
  if (cached) return cached
  const n = p.size
  const units: number[][] = Array.from({ length: n * 3 }, () => [])
  const unitsOf: [number, number, number][] = []
  const around: number[][] = []
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n)
    const c = i % n
    const bed = p.beds[i]!
    units[r]!.push(i)
    units[n + c]!.push(i)
    units[2 * n + bed]?.push(i)
    unitsOf.push([r, n + c, 2 * n + bed])
    const near: number[] = []
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const rr = r + dr
        const cc = c + dc
        if (rr >= 0 && rr < n && cc >= 0 && cc < n) near.push(rr * n + cc)
      }
    }
    around.push(near)
  }
  const g = { units, unitsOf, around }
  geometryCache.set(p, g)
  return g
}

/** True when the garden is well formed: N beds numbered 0 up, every bed one connected patch. */
export function gpWellFormed(p: GpPuzzle): boolean {
  const n = p.size
  if (n < 4 || p.beds.length !== n * n) return false
  if (p.beds.some((b) => !Number.isInteger(b) || b < 0 || b >= n)) return false
  for (let bed = 0; bed < n; bed++) {
    const cells = p.beds.flatMap((b, i) => (b === bed ? [i] : []))
    if (cells.length === 0 || !gpConnected(cells, n)) return false
  }
  return true
}

/** True when the squares form one patch, joined across or down. */
export function gpConnected(cells: readonly number[], n: number): boolean {
  if (cells.length === 0) return false
  const own = new Set(cells)
  const seen = new Set([cells[0]!])
  const stack = [cells[0]!]
  while (stack.length > 0) {
    const i = stack.pop()!
    const r = Math.floor(i / n)
    const c = i % n
    for (const [rr, cc] of [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ] as const) {
      if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue
      const j = rr * n + cc
      if (own.has(j) && !seen.has(j)) {
        seen.add(j)
        stack.push(j)
      }
    }
  }
  return seen.size === own.size
}

/** Squares that touch, corners included (a square does not touch itself). */
export function gpTouching(a: number, b: number, n: number): boolean {
  if (a === b) return false
  return Math.abs(Math.floor(a / n) - Math.floor(b / n)) <= 1 && Math.abs((a % n) - (b % n)) <= 1
}

/** True when the flowers (one square each) are a finished garden. */
export function isGpSolution(p: GpPuzzle, flowers: readonly number[]): boolean {
  const n = p.size
  if (flowers.length !== n) return false
  const rows = new Set<number>()
  const cols = new Set<number>()
  const beds = new Set<number>()
  for (const i of flowers) {
    if (!Number.isInteger(i) || i < 0 || i >= n * n) return false
    rows.add(Math.floor(i / n))
    cols.add(i % n)
    beds.add(p.beds[i]!)
  }
  if (rows.size !== n || cols.size !== n || beds.size !== n) return false
  for (let a = 0; a < flowers.length; a++) {
    for (let b = a + 1; b < flowers.length; b++) if (gpTouching(flowers[a]!, flowers[b]!, n)) return false
  }
  return true
}

/** The flowers as one comparable string, in reading order. */
export const gpFlowerList = (flowers: readonly number[]) => [...flowers].sort((a, b) => a - b).join('.')

/* ------------------------------------------------------------------ *
 * The solver's pencil marks
 * ------------------------------------------------------------------ */

type Step = 'changed' | 'same' | 'broken'

export interface GpTally {
  basic: number
  sets: number
  /** Group steps that needed three or more beds (or lines) at once. */
  bigSets: number
  probe: number
}

export interface GpSolveResult {
  solved: boolean
  /** Per square: -1 not known, 0 crossed off, 1 flower. */
  state: Int8Array
  /** How many times each kind of step moved the garden on. */
  tally: GpTally
}

/** The flowers a state has planted, in reading order. */
export function gpFlowersOf(state: Int8Array): number[] {
  const out: number[] = []
  state.forEach((v, i) => {
    if (v === FLOWER) out.push(i)
  })
  return out
}

/** Plants a flower and crosses off everything it rules out. */
function plant(g: Geometry, s: Int8Array, i: number): Step {
  if (s[i] === EMPTY) return 'broken'
  if (s[i] === FLOWER) return 'same'
  s[i] = FLOWER
  for (const u of g.unitsOf[i]!) {
    for (const j of g.units[u]!) {
      if (j === i) continue
      if (s[j] === FLOWER) return 'broken'
      s[j] = EMPTY
    }
  }
  for (const j of g.around[i]!) {
    if (s[j] === FLOWER) return 'broken'
    s[j] = EMPTY
  }
  return 'changed'
}

/**
 * Crossing off and counting until nothing moves: a unit with one open square
 * and no flower plants it; a unit with nothing open and no flower is broken.
 */
function settle(g: Geometry, s: Int8Array): Step {
  let any = false
  for (let again = true; again; ) {
    again = false
    for (const unit of g.units) {
      let flowers = 0
      let open = 0
      let last = -1
      for (const j of unit) {
        if (s[j] === FLOWER) flowers++
        else if (s[j] === UNKNOWN) {
          open++
          last = j
        }
      }
      if (flowers > 1) return 'broken'
      if (flowers === 1) continue
      if (open === 0) return 'broken'
      if (open === 1) {
        if (plant(g, s, last) === 'broken') return 'broken'
        again = true
        any = true
      }
    }
  }
  return any ? 'changed' : 'same'
}

/** A unit's open squares (none when it already has its flower). */
function openOf(g: Geometry, s: Int8Array, u: number): number[] {
  const unit = g.units[u]!
  const out: number[] = []
  for (const j of unit) {
    if (s[j] === FLOWER) return []
    if (s[j] === UNKNOWN) out.push(j)
  }
  return out
}

/**
 * One unit confined to one other: a bed whose open squares all lie in one
 * row owns that row (the rest of the row is crossed off), and so on for
 * every pairing of a row or column with a bed.
 */
function confine(p: GpPuzzle, g: Geometry, s: Int8Array): Step {
  const n = p.size
  let any = false
  for (let u = 0; u < 3 * n; u++) {
    const open = openOf(g, s, u)
    if (open.length < 2) continue
    // Which kinds of unit to look for: beds look at rows and columns, lines at beds.
    const kinds = u >= 2 * n ? [0, 1] : [2]
    for (const kind of kinds) {
      const home = g.unitsOf[open[0]!]![kind]!
      if (home === u || !open.every((j) => g.unitsOf[j]![kind] === home)) continue
      const mine = new Set(open)
      for (const j of g.units[home]!) {
        if (s[j] === UNKNOWN && !mine.has(j)) {
          s[j] = EMPTY
          any = true
        }
      }
    }
  }
  return any ? 'changed' : 'same'
}

/**
 * A square that, holding a flower, would cross off every open square of
 * some other unit cannot hold one.
 */
function crowd(p: GpPuzzle, g: Geometry, s: Int8Array): Step {
  const n = p.size
  let any = false
  const opens = Array.from({ length: 3 * n }, (_, u) => openOf(g, s, u))
  for (let i = 0; i < n * n; i++) {
    if (s[i] !== UNKNOWN) continue
    const mine = g.unitsOf[i]!
    const near = new Set(g.around[i]!)
    for (let u = 0; u < 3 * n; u++) {
      const open = opens[u]!
      if (open.length === 0 || mine.includes(u)) continue
      const wiped = open.every((j) => near.has(j) || mine.includes(g.unitsOf[j]![0]!) || mine.includes(g.unitsOf[j]![1]!) || mine.includes(g.unitsOf[j]![2]!))
      if (wiped) {
        s[i] = EMPTY
        any = true
        break
      }
    }
  }
  return any ? 'changed' : 'same'
}

/** Every way to choose k of the numbers 0 … n − 1. */
function* choose(n: number, k: number): Generator<number[]> {
  const pick: number[] = []
  function* from(start: number): Generator<number[]> {
    if (pick.length === k) {
      yield [...pick]
      return
    }
    for (let x = start; x <= n - (k - pick.length); x++) {
      pick.push(x)
      yield* from(x + 1)
      pick.pop()
    }
  }
  yield* from(0)
}

/**
 * Counting groups: k beds whose open squares all sit in the same k rows own
 * those rows (the rest of them is crossed off); the same for columns, and
 * for k rows or columns whose open squares sit inside k beds. Groups of two
 * to four, the most a reader keeps in their head.
 */
function groups(p: GpPuzzle, g: Geometry, s: Int8Array): number {
  const n = p.size
  let any = false
  // [the units grouped, the kind of unit they must fit inside]
  const pairings: [number, number][] = [
    [2, 0],
    [2, 1],
    [0, 2],
    [1, 2],
  ]
  const most = Math.min(4, Math.floor(n / 2))
  for (const [from, into] of pairings) {
    const open = Array.from({ length: n }, (_, k) => openOf(g, s, from * n + k))
    const live = open.flatMap((cells, k) => (cells.length > 0 ? [k] : []))
    for (let k = 2; k <= most; k++) {
      if (live.length <= k) break
      for (const chosen of choose(live.length, k)) {
        const members = chosen.map((x) => live[x]!)
        const inside = new Set<number>()
        for (const m of members) for (const j of open[m]!) inside.add(g.unitsOf[j]![into]!)
        if (inside.size !== k) continue
        const mine = new Set(members.map((m) => from * n + m))
        for (const home of inside) {
          for (const j of g.units[home]!) {
            if (s[j] !== UNKNOWN || mine.has(g.unitsOf[j]![from]!)) continue
            s[j] = EMPTY
            any = true
          }
        }
        if (any) return k
      }
    }
  }
  return 0
}

/** The basic steps, over and over, until nothing moves. */
function runBasic(p: GpPuzzle, g: Geometry, s: Int8Array, tally: GpTally | null): Step {
  let any = false
  for (;;) {
    const settled = settle(g, s)
    if (settled === 'broken') return 'broken'
    if (settled === 'changed') any = true
    const confined = confine(p, g, s)
    if (confined === 'changed') {
      any = true
      if (tally) tally.basic++
      continue
    }
    const crowded = crowd(p, g, s)
    if (crowded === 'changed') {
      any = true
      if (tally) tally.basic++
      continue
    }
    if (settled === 'changed' && tally) tally.basic++
    return any ? 'changed' : 'same'
  }
}

function done(s: Int8Array): boolean {
  return !s.includes(UNKNOWN)
}

/** A flower on the square leads, by the basic steps, to a broken rule. */
function flowerFails(p: GpPuzzle, g: Geometry, s: Int8Array, i: number): boolean {
  const trial = s.slice()
  if (plant(g, trial, i) === 'broken') return true
  return runBasic(p, g, trial, null) === 'broken'
}

function probe(p: GpPuzzle, g: Geometry, s: Int8Array): Step {
  for (let i = 0; i < p.size * p.size; i++) {
    if (s[i] !== UNKNOWN) continue
    if (flowerFails(p, g, s, i)) {
      s[i] = EMPTY
      return 'changed'
    }
  }
  return 'same'
}

/**
 * Solves the garden with the level's steps only. `solved` is true only when
 * every square is decided and the rules hold, which — every step being sound
 * — also proves it is the only answer.
 */
export function solveGp(p: GpPuzzle, rules: GpRules): GpSolveResult {
  const g = geometry(p)
  const s = new Int8Array(p.size * p.size).fill(UNKNOWN)
  const tally: GpTally = { basic: 0, sets: 0, bigSets: 0, probe: 0 }
  const rank = RANK[rules]
  const fail = (): GpSolveResult => ({ solved: false, state: s, tally })
  for (;;) {
    if (runBasic(p, g, s, tally) === 'broken') return fail()
    if (done(s)) break
    if (rank >= RANK.sets) {
      const grouped = groups(p, g, s)
      if (grouped > 0) {
        tally.sets++
        if (grouped >= 3) tally.bigSets++
        continue
      }
    }
    if (rank >= RANK.probe) {
      const probed = probe(p, g, s)
      if (probed === 'changed') {
        tally.probe++
        continue
      }
    }
    return fail()
  }
  const flowers = gpFlowersOf(s)
  return { solved: isGpSolution(p, flowers), state: s, tally }
}

/**
 * The garden's answers by plain search, up to `limit` of them, each as its
 * flowers row by row — the generator's measure of how far a garden is from
 * one answer, and the tests' independent check on the solver.
 */
export function gpSolutions(p: GpPuzzle, limit = 2): number[][] {
  const n = p.size
  const usedCol = new Array<boolean>(n).fill(false)
  const usedBed = new Array<boolean>(n).fill(false)
  const out: number[][] = []
  const row: number[] = []
  const walk = (r: number, prevCol: number) => {
    if (r === n) {
      out.push([...row])
      return
    }
    for (let c = 0; c < n && out.length < limit; c++) {
      if (usedCol[c] || (prevCol >= 0 && Math.abs(c - prevCol) <= 1)) continue
      const bed = p.beds[r * n + c]!
      if (usedBed[bed]) continue
      usedCol[c] = true
      usedBed[bed] = true
      row.push(r * n + c)
      walk(r + 1, c)
      row.pop()
      usedCol[c] = false
      usedBed[bed] = false
    }
  }
  walk(0, -1)
  return out
}

/** How many answers the garden has, counted up to `limit`. */
export const countGpSolutions = (p: GpPuzzle, limit = 2) => gpSolutions(p, limit).length
