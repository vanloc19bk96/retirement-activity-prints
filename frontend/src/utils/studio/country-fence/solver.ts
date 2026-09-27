/**
 * Country Fence (Slitherlink): the rules, and a reader's way of solving.
 *
 * A square field of N × N squares, drawn as a lattice of (N+1) × (N+1)
 * posts (dots), some squares holding a number from 0 to 3. The reader
 * builds one fence: a single closed loop of rails, each rail joining two
 * neighbouring posts across or down, never crossing, branching or touching
 * itself (a post takes two rails or none). A finished fence obeys:
 *
 * - a number is how many of its square's four sides are rails;
 * - squares without a number may have any.
 *
 * The solver works the way a reader does, one sure step at a time, and never
 * guesses. It marks every rail between two neighbouring posts as fence, as
 * crossed (no fence here), or leaves it open. Every step follows from the
 * rules alone, so a field the solver finishes has exactly one fence. What it
 * may use depends on the level:
 *
 * - `local` — the numbers and the posts: a number's sides fill up or cross
 *   off once its count is reached or can only just be reached; a post takes
 *   two rails or none; a number read together with the posts at its four
 *   corners (a 3 in a corner fences both corner sides, a 1 in a corner
 *   crosses them, a rail arriving at a 3's corner fences the far sides…);
 *   a finished fence crosses off every rail left.
 * - `loop` — adds "don't close it early": a rail that would close a run of
 *   fence into a loop while other fence lies outside it, or while a number
 *   still wants more, is crossed off.
 * - `probe` — adds "what if": a rail at a number or at a loose end of fence
 *   where fence (or no fence) leads, by the `loop` steps, straight to a
 *   broken rule is decided the other way.
 */

/** A square with no number. */
export const FENCE_BLANK = -1

export interface FencePuzzle {
  /** Squares across and down. */
  size: number
  /** Every square in reading order: FENCE_BLANK, or how many of its sides are fence (0–3). */
  clues: readonly number[]
}

export type FenceRules = 'local' | 'loop' | 'probe'

const RANK: Record<FenceRules, number> = { local: 0, loop: 1, probe: 2 }

export const isClue = (value: number) => value >= 0 && value <= 3

/** True when the field is well formed: every square blank or a number from 0 to 3. */
export function fenceWellFormed(p: FencePuzzle): boolean {
  const n = p.size
  if (!Number.isInteger(n) || n < 2 || p.clues.length !== n * n) return false
  return p.clues.every((v) => v === FENCE_BLANK || (Number.isInteger(v) && isClue(v)))
}

/* ------------------------------------------------------------------ *
 * The field's rails
 * ------------------------------------------------------------------ */

/** Up, right, down, left. */
export const FENCE_DIRS = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
] as const

export interface FenceGeometry {
  /** Squares across and down. */
  n: number
  /** Posts across and down: n + 1. */
  posts: number
  /** How many rails the field has. */
  rails: number
  /** Per post and direction: the rail that way, or -1 at the edge. */
  railOf: Int32Array
  /** Per post and direction: the post that way, or -1 at the edge. */
  step: Int32Array
  /** Per rail: its two posts (the lower-numbered first). */
  ends: Int32Array
  /** Per square: its rails, top, right, bottom, left. */
  sides: Int32Array
  /** Per square: its posts, top left, top right, bottom right, bottom left. */
  corners: Int32Array
  /** Per rail: the squares beside it (one or two; -1 past the field's edge). */
  beside: Int32Array
  /**
   * Per square and corner (top left, top right, bottom right, bottom left):
   * the two rails at that post leading away from the square (-1 past the edge).
   */
  away: Int32Array
}

const geometryCache = new Map<number, FenceGeometry>()

/**
 * The rails of an N × N field. Post (r, c) is number `r·(n+1) + c`. Rail
 * `r·n + c` joins post (r, c) to the post on its right; after all of those,
 * rail `(n+1)·n + r·(n+1) + c` joins post (r, c) to the post below. So a
 * square's top is rail `r·n + c` and its left is `(n+1)·n + r·(n+1) + c`.
 */
export function fenceGeometry(n: number): FenceGeometry {
  const cached = geometryCache.get(n)
  if (cached) return cached
  const N = n + 1
  const across = N * n
  const rails = 2 * across
  const railOf = new Int32Array(N * N * 4).fill(-1)
  const step = new Int32Array(N * N * 4).fill(-1)
  const ends = new Int32Array(rails * 2)
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const i = r * N + c
      if (c < n) {
        const e = r * n + c
        railOf[i * 4 + 1] = e
        railOf[(i + 1) * 4 + 3] = e
        ends[e * 2] = i
        ends[e * 2 + 1] = i + 1
      }
      if (r < n) {
        const e = across + r * N + c
        railOf[i * 4 + 2] = e
        railOf[(i + N) * 4] = e
        ends[e * 2] = i
        ends[e * 2 + 1] = i + N
      }
      FENCE_DIRS.forEach(([dr, dc], d) => {
        const rr = r + dr
        const cc = c + dc
        if (rr >= 0 && rr < N && cc >= 0 && cc < N) step[i * 4 + d] = rr * N + cc
      })
    }
  }
  const sides = new Int32Array(n * n * 4)
  const corners = new Int32Array(n * n * 4)
  const beside = new Int32Array(rails * 2).fill(-1)
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const s = r * n + c
      const top = r * n + c
      const bottom = (r + 1) * n + c
      const left = across + r * N + c
      const right = across + r * N + c + 1
      sides.set([top, right, bottom, left], s * 4)
      corners.set([r * N + c, r * N + c + 1, (r + 1) * N + c + 1, (r + 1) * N + c], s * 4)
      for (const e of [top, right, bottom, left]) {
        if (beside[e * 2]! < 0) beside[e * 2] = s
        else beside[e * 2 + 1] = s
      }
    }
  }
  const away = new Int32Array(n * n * 8).fill(-1)
  for (let s = 0; s < n * n; s++) {
    for (let q = 0; q < 4; q++) {
      const post = corners[s * 4 + q]!
      // Corner q sits between side q − 1 and side q (top left: left and top; top right: top and right…).
      const own1 = sides[s * 4 + ((q + 3) % 4)]!
      const own2 = sides[s * 4 + q]!
      let k = 0
      for (let d = 0; d < 4; d++) {
        const e = railOf[post * 4 + d]!
        if (e === own1 || e === own2) continue
        away[s * 8 + q * 2 + k++] = e
      }
    }
  }
  const g = { n, posts: N, rails, railOf, step, ends, sides, corners, beside, away }
  geometryCache.set(n, g)
  return g
}

/** The rail between two neighbouring posts, or -1. */
export function fenceRailBetween(n: number, a: number, b: number): number {
  const g = fenceGeometry(n)
  for (let d = 0; d < 4; d++) if (g.step[a * 4 + d] === b) return g.railOf[a * 4 + d]!
  return -1
}

/**
 * The posts a set of rails runs through, in order round the loop: from the
 * lowest-numbered post, first towards its lower-numbered neighbour on the
 * loop. Null unless the rails make exactly one closed loop.
 */
export function fenceLoopOrder(n: number, rails: readonly number[]): number[] | null {
  const g = fenceGeometry(n)
  if (rails.length < 4) return null
  const on = new Uint8Array(g.rails)
  for (const e of rails) {
    if (!Number.isInteger(e) || e < 0 || e >= g.rails || on[e]) return null
    on[e] = 1
  }
  const posts = g.posts * g.posts
  const degree = new Uint8Array(posts)
  for (const e of rails) {
    degree[g.ends[e * 2]!]!++
    degree[g.ends[e * 2 + 1]!]!++
  }
  let start = -1
  for (let i = 0; i < posts; i++) {
    if (degree[i] !== 0 && degree[i] !== 2) return null
    if (degree[i] === 2 && start < 0) start = i
  }
  const nextOf = (post: number, prev: number) => {
    const out: number[] = []
    for (let d = 0; d < 4; d++) {
      const e = g.railOf[post * 4 + d]!
      if (e >= 0 && on[e]) out.push(g.step[post * 4 + d]!)
    }
    return out.filter((j) => j !== prev)
  }
  const first = nextOf(start, -1).sort((a, b) => a - b)[0]!
  const order = [start]
  let prev = start
  let cur = first
  while (cur !== start) {
    order.push(cur)
    const next = nextOf(cur, prev)
    if (next.length !== 1) return null
    prev = cur
    cur = next[0]!
    if (order.length > posts) return null
  }
  return order.length === rails.length ? order : null
}

/** A fence as one comparable string. */
export const fenceAnswerKey = (rails: readonly number[]) => [...rails].sort((a, b) => a - b).join(',')

/** How many of each square's sides the rails fence. */
export function fenceCounts(n: number, rails: readonly number[]): number[] {
  const g = fenceGeometry(n)
  const out = new Array<number>(n * n).fill(0)
  for (const e of rails) {
    for (const s of [g.beside[e * 2]!, g.beside[e * 2 + 1]!]) if (s >= 0) out[s]!++
  }
  return out
}

/** True when the rails make a finished fence for the field. */
export function isFenceSolution(p: FencePuzzle, rails: readonly number[]): boolean {
  const n = p.size
  if (!fenceLoopOrder(n, rails)) return false
  const counts = fenceCounts(n, rails)
  return p.clues.every((v, s) => v === FENCE_BLANK || counts[s] === v)
}

/**
 * The squares inside a finished fence (1 inside, 0 out), by walking in from
 * the field's edge: a square is outside when it reaches the edge without
 * crossing a rail.
 */
export function fenceInside(n: number, rails: readonly number[]): Uint8Array {
  const g = fenceGeometry(n)
  const on = new Uint8Array(g.rails)
  for (const e of rails) on[e] = 1
  const out = new Uint8Array(n * n)
  const stack: number[] = []
  const reach = (s: number) => {
    if (out[s]) return
    out[s] = 1
    stack.push(s)
  }
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const s = r * n + c
      for (let d = 0; d < 4; d++) {
        const e = g.sides[s * 4 + d]!
        // A side on the field's edge, with no rail on it, lets the outside in.
        if (g.beside[e * 2 + 1]! < 0 && !on[e]) reach(s)
      }
    }
  }
  while (stack.length > 0) {
    const s = stack.pop()!
    for (let d = 0; d < 4; d++) {
      const e = g.sides[s * 4 + d]!
      if (on[e]) continue
      const a = g.beside[e * 2]!
      const b = g.beside[e * 2 + 1]!
      const t = a === s ? b : a
      if (t >= 0) reach(t)
    }
  }
  return out.map((v) => 1 - v)
}


/* ------------------------------------------------------------------ *
 * The solver's pencil marks
 * ------------------------------------------------------------------ */

const OPEN = 0
const LINE = 1
const CROSS = 2

type Step = 'changed' | 'same' | 'broken'

export interface FenceTally {
  local: number
  loop: number
  probe: number
}

export interface FenceSolveResult {
  solved: boolean
  /** The rails fenced. */
  rails: number[]
  /** Rails still undecided. */
  open: number
  /** How many times each kind of step moved the field on. */
  tally: FenceTally
}

class Broken extends Error {}
const BROKEN = new Broken()

interface Ctx {
  p: FencePuzzle
  g: FenceGeometry
  /** The numbered squares. */
  numbered: Int32Array
  mark: Int8Array
  changed: boolean
}

/** A rail's mark by post and direction; past the field's edge reads as crossed. */
const at = (x: Ctx, post: number, d: number): number => {
  const e = x.g.railOf[post * 4 + d]!
  return e < 0 ? CROSS : x.mark[e]!
}

function setRail(x: Ctx, e: number, to: number): void {
  if (e < 0) {
    if (to === LINE) throw BROKEN
    return
  }
  const now = x.mark[e]!
  if (now === to) return
  if (now !== OPEN) throw BROKEN
  x.mark[e] = to
  x.changed = true
}

/** A post takes two rails or none. */
function postStep(x: Ctx, i: number): void {
  let lines = 0
  let open = 0
  for (let d = 0; d < 4; d++) {
    const m = at(x, i, d)
    if (m === LINE) lines++
    else if (m === OPEN) open++
  }
  if (lines > 2) throw BROKEN
  if (open === 0) {
    if (lines === 1) throw BROKEN
    return
  }
  let to = -1
  if (lines === 2) to = CROSS
  else if (lines === 1 && open === 1) to = LINE
  else if (lines === 0 && open === 1) to = CROSS
  if (to < 0) return
  for (let d = 0; d < 4; d++) if (at(x, i, d) === OPEN) setRail(x, x.g.railOf[i * 4 + d]!, to)
}

/** A number's sides: all the rest crossed once it is reached, all fenced once it can only just be. */
function sidesStep(x: Ctx, s: number): void {
  const k = x.p.clues[s]!
  const { sides } = x.g
  let lines = 0
  let open = 0
  for (let d = 0; d < 4; d++) {
    const m = x.mark[sides[s * 4 + d]!]!
    if (m === LINE) lines++
    else if (m === OPEN) open++
  }
  if (lines > k || lines + open < k) throw BROKEN
  if (open === 0) return
  let to = -1
  if (lines === k) to = CROSS
  else if (lines + open === k) to = LINE
  if (to < 0) return
  for (let d = 0; d < 4; d++) {
    const e = sides[s * 4 + d]!
    if (x.mark[e] === OPEN) setRail(x, e, to)
  }
}

const SCRATCH_RAILS = new Int32Array(12)
const SCRATCH_MARKS = new Int8Array(12)
const SCRATCH_SEEN = new Uint8Array(12)
/** How many sides each of the sixteen ways to fence a square uses. */
const BITS = Array.from({ length: 16 }, (_, m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1))

/**
 * A number read with the posts at its corners: every way its sides can be
 * fenced to its count, each corner post then taking two rails or none from
 * the two rails leading away from the square. A rail that comes out the
 * same in every way that works is decided.
 */
function cornersStep(x: Ctx, s: number): void {
  const { g, mark } = x
  const k = x.p.clues[s]!
  // The twelve rails in play: four sides, then two away from each corner.
  const rails = SCRATCH_RAILS
  const marks = SCRATCH_MARKS
  const seen = SCRATCH_SEEN
  let open = 0
  for (let j = 0; j < 12; j++) {
    const e = j < 4 ? g.sides[s * 4 + j]! : g.away[s * 8 + j - 4]!
    rails[j] = e
    marks[j] = e < 0 ? CROSS : mark[e]!
    if (marks[j] === OPEN) open++
    seen[j] = 0
  }
  if (open === 0) return
  let ways = 0
  for (let mask = 0; mask < 16; mask++) {
    if (BITS[mask] !== k) continue
    let fits = true
    for (let j = 0; j < 4 && fits; j++) {
      const on = (mask >> j) & 1
      if ((on && marks[j] === CROSS) || (!on && marks[j] === LINE)) fits = false
    }
    if (!fits) continue
    // Each corner on its own: which pairs of rails away (bit a + 2b) bring its post to two or none.
    let options = 0
    for (let q = 0; q < 4 && fits; q++) {
      const fromSides = ((mask >> ((q + 3) % 4)) & 1) + ((mask >> q) & 1)
      const ma = marks[4 + q * 2]!
      const mb = marks[5 + q * 2]!
      let ok = 0
      for (let a = 0; a < 2; a++) {
        if ((a && ma === CROSS) || (!a && ma === LINE)) continue
        for (let b = 0; b < 2; b++) {
          if ((b && mb === CROSS) || (!b && mb === LINE)) continue
          const deg = fromSides + a + b
          if (deg === 0 || deg === 2) ok |= 1 << (a + 2 * b)
        }
      }
      if (ok === 0) fits = false
      options |= ok << (q * 4)
    }
    if (!fits) continue
    ways++
    for (let j = 0; j < 4; j++) seen[j] |= (mask >> j) & 1 ? 1 : 2
    for (let q = 0; q < 4; q++) {
      const ok = (options >> (q * 4)) & 15
      for (let ab = 0; ab < 4; ab++) {
        if (!((ok >> ab) & 1)) continue
        seen[4 + q * 2] |= ab & 1 ? 1 : 2
        seen[5 + q * 2] |= ab & 2 ? 1 : 2
      }
    }
  }
  if (ways === 0) throw BROKEN
  for (let j = 0; j < 12; j++) {
    const e = rails[j]!
    if (e < 0 || mark[e] !== OPEN) continue
    if (seen[j] === 1) setRail(x, e, LINE)
    else if (seen[j] === 2) setRail(x, e, CROSS)
  }
}

/** Scratch for walking the runs of fence, per field size. */
const runScratch = new Map<number, { pathOf: Int32Array; other: Int32Array; lengths: Int32Array }>()

/** The next post along the fence from `cur`, not back to `prev`; -1 at a loose end. */
function onward(x: Ctx, cur: number, prev: number): number {
  for (let d = 0; d < 4; d++) {
    if (at(x, cur, d) !== LINE) continue
    const j = x.g.step[cur * 4 + d]!
    if (j !== prev) return j
  }
  return -1
}

/** How many rails meet at a post. */
function railsAt(x: Ctx, i: number): number {
  let k = 0
  for (let d = 0; d < 4; d++) if (at(x, i, d) === LINE) k++
  return k
}

/**
 * The fence as runs: per post on a run, the run's id; per run end, the post
 * at its other end. A closed loop that is not all the fence breaks the
 * field; a closed loop that is all of it crosses off every open rail (the
 * numbers then check it). With `early` (the `loop` step), a rail joining a
 * run's two ends is crossed off unless closing it would take in all the
 * fence and give every number its count.
 */
function loopStep(x: Ctx, early: boolean): void {
  const { g, p } = x
  const posts = g.posts * g.posts
  let scratch = runScratch.get(posts)
  if (!scratch) {
    scratch = { pathOf: new Int32Array(posts), other: new Int32Array(posts), lengths: new Int32Array(posts) }
    runScratch.set(posts, scratch)
  }
  const { pathOf, other, lengths } = scratch
  pathOf.fill(-1)
  other.fill(-1)
  let runs = 0
  let totalLines = 0
  for (let e = 0; e < g.rails; e++) if (x.mark[e] === LINE) totalLines++
  if (totalLines === 0) return
  for (let i = 0; i < posts; i++) {
    const k = railsAt(x, i)
    if (k > 2) throw BROKEN
    if (k !== 1 || pathOf[i]! >= 0) continue
    const id = runs++
    let prev = -1
    let cur = i
    let length = 0
    for (;;) {
      pathOf[cur] = id
      const next = onward(x, cur, prev)
      if (next < 0) break
      prev = cur
      cur = next
      length++
    }
    other[i] = cur
    other[cur] = i
    lengths[id] = length
  }
  for (let i = 0; i < posts; i++) {
    if (pathOf[i]! >= 0 || railsAt(x, i) !== 2) continue
    let prev = -1
    let cur = i
    let length = 0
    do {
      pathOf[cur] = runs
      const next = onward(x, cur, prev)
      prev = cur
      cur = next
      length++
    } while (cur !== i && cur >= 0)
    if (length !== totalLines) throw BROKEN
    for (let e = 0; e < g.rails; e++) {
      if (x.mark[e] === OPEN) {
        x.mark[e] = CROSS
        x.changed = true
      }
    }
    return
  }
  if (!early) return
  for (let a = 0; a < posts; a++) {
    const b = other[a]!
    if (b < a) continue
    for (let d = 0; d < 4; d++) {
      if (g.step[a * 4 + d] !== b || at(x, a, d) !== OPEN) continue
      const e = g.railOf[a * 4 + d]!
      let everything = lengths[pathOf[a]!]! === totalLines
      if (everything) {
        const s1 = g.beside[e * 2]!
        const s2 = g.beside[e * 2 + 1]!
        for (let j = 0; j < x.numbered.length && everything; j++) {
          const s = x.numbered[j]!
          let k = s === s1 || s === s2 ? 1 : 0
          for (let q = 0; q < 4; q++) if (x.mark[g.sides[s * 4 + q]!] === LINE) k++
          if (k !== p.clues[s]) everything = false
        }
      }
      if (!everything) setRail(x, e, CROSS)
    }
  }
}

/** The numbers and posts, then the corners, then the runs (and at `loop` and up the early-close rule), until nothing moves. */
function propagate(x: Ctx, rank: number, tally?: FenceTally): Step {
  const posts = x.g.posts * x.g.posts
  const { numbered } = x
  let any = false
  try {
    for (;;) {
      x.changed = false
      for (let j = 0; j < numbered.length; j++) sidesStep(x, numbered[j]!)
      for (let i = 0; i < posts; i++) postStep(x, i)
      if (!x.changed) for (let j = 0; j < numbered.length; j++) cornersStep(x, numbered[j]!)
      if (!x.changed) loopStep(x, false)
      if (x.changed) {
        any = true
        continue
      }
      if (rank >= RANK.loop) {
        loopStep(x, true)
        if (x.changed) {
          any = true
          if (tally) tally.loop++
          continue
        }
      }
      break
    }
  } catch (err) {
    if (err instanceof Broken) return 'broken'
    throw err
  }
  return any ? 'changed' : 'same'
}

/** True when a rail is where a reader looks first: beside a number, or at the loose end of a run. */
function lively(x: Ctx, e: number): boolean {
  const { g, p } = x
  const s1 = g.beside[e * 2]!
  const s2 = g.beside[e * 2 + 1]!
  if ((s1 >= 0 && p.clues[s1] !== FENCE_BLANK) || (s2 >= 0 && p.clues[s2] !== FENCE_BLANK)) return true
  return railsAt(x, g.ends[e * 2]!) === 1 || railsAt(x, g.ends[e * 2 + 1]!) === 1
}

/**
 * "What if": the next open rail (from `from`, round the field) beside a
 * number or at a loose end where fence, or no fence, leads by the `loop`
 * steps to a broken rule is decided the other way. Returns the rail
 * decided, or -1.
 */
function probe(x: Ctx, from: number): number {
  const total = x.g.rails
  const trial: Ctx = { ...x, mark: new Int8Array(total), changed: false }
  for (let k = 0; k < total; k++) {
    const e = (from + k) % total
    if (x.mark[e] !== OPEN || !lively(x, e)) continue
    for (const guess of [LINE, CROSS]) {
      trial.mark.set(x.mark)
      trial.mark[e] = guess
      if (propagate(trial, RANK.loop) === 'broken') {
        x.mark[e] = guess === LINE ? CROSS : LINE
        return e
      }
    }
  }
  return -1
}

/**
 * Solves the field with the level's steps only. `solved` is true only when
 * every rail is decided and they make a finished fence, which — every step
 * being sound — also proves it is the only one.
 */
export function solveFence(p: FencePuzzle, rules: FenceRules): FenceSolveResult {
  const g = fenceGeometry(p.size)
  const numbered = Int32Array.from(p.clues.flatMap((v, s) => (v === FENCE_BLANK ? [] : [s])))
  const x: Ctx = { p, g, numbered, mark: new Int8Array(g.rails), changed: false }
  const tally: FenceTally = { local: 0, loop: 0, probe: 0 }
  const rank = RANK[rules]
  const result = (): FenceSolveResult => {
    const rails: number[] = []
    let open = 0
    for (let e = 0; e < g.rails; e++) {
      if (x.mark[e] === LINE) rails.push(e)
      else if (x.mark[e] === OPEN) open++
    }
    return { solved: open === 0 && isFenceSolution(p, rails), rails, open, tally }
  }
  // Where the next "what if" starts: just past the last one, so the reader works round the field.
  let from = 0
  for (;;) {
    const step = propagate(x, rank, tally)
    if (step === 'broken') return { ...result(), solved: false }
    if (step === 'changed') tally.local++
    if (!x.mark.includes(OPEN)) break
    if (rank >= RANK.probe) {
      const decided = probe(x, from)
      if (decided >= 0) {
        tally.probe++
        from = decided + 1
        continue
      }
    }
    break
  }
  return result()
}


/* ------------------------------------------------------------------ *
 * Plain search, for the tests
 * ------------------------------------------------------------------ */

/**
 * The field's fences by plain search, up to `limit` of them, each as its
 * rails — the tests' independent check on the solver. Posts are taken in
 * reading order, each deciding its rails right and down; a post must end
 * with two rails or none, a number is checked as soon as its four sides are
 * decided, and the first loop to close must be the whole fence.
 */
export function fenceSolutions(p: FencePuzzle, limit = 2): number[][] {
  const n = p.size
  const g = fenceGeometry(n)
  const N = g.posts
  const posts = N * N
  const on = new Uint8Array(g.rails)
  const out: number[][] = []
  // A square's last side is decided at its bottom-left post (its bottom rail).
  const readyAt = new Map<number, number[]>()
  for (let s = 0; s < n * n; s++) {
    if (p.clues[s] === FENCE_BLANK) continue
    const post = g.corners[s * 4 + 3]!
    readyAt.set(post, [...(readyAt.get(post) ?? []), s])
  }
  const rail = (post: number, d: number) => {
    const e = g.railOf[post * 4 + d]!
    return e >= 0 && on[e] === 1
  }
  const degree = (i: number) => {
    let k = 0
    for (let d = 0; d < 4; d++) if (rail(i, d)) k++
    return k
  }
  const clueOk = (s: number) => {
    let k = 0
    for (let d = 0; d < 4; d++) if (on[g.sides[s * 4 + d]!]) k++
    return k === p.clues[s]
  }
  const closedAt = (i: number) => {
    if (degree(i) !== 2) return 0
    let prev = i
    let cur = -1
    for (let d = 0; d < 4 && cur < 0; d++) if (rail(i, d)) cur = g.step[i * 4 + d]!
    let length = 1
    while (cur !== i) {
      let next = -1
      for (let d = 0; d < 4; d++) {
        const j = g.step[cur * 4 + d]!
        if (rail(cur, d) && j !== prev) next = j
      }
      if (next < 0 || degree(cur) !== 2) return 0
      prev = cur
      cur = next
      length++
    }
    return length
  }
  let lines = 0
  const walk = (i: number) => {
    if (out.length >= limit || i >= posts) return
    const right = g.railOf[i * 4 + 1]!
    const down = g.railOf[i * 4 + 2]!
    for (const r of right >= 0 ? [0, 1] : [0]) {
      for (const dn of down >= 0 ? [0, 1] : [0]) {
        if (out.length >= limit) return
        if (r) on[right] = 1
        if (dn) on[down] = 1
        lines += r + dn
        const deg = degree(i)
        if ((deg === 0 || deg === 2) && (readyAt.get(i) ?? []).every(clueOk)) {
          const loop = r || dn ? closedAt(i) : 0
          if (loop > 0) {
            const rails: number[] = []
            for (let e = 0; e < g.rails; e++) if (on[e]) rails.push(e)
            if (loop === lines && isFenceSolution(p, rails)) out.push(rails)
          } else walk(i + 1)
        }
        if (r) on[right] = 0
        if (dn) on[down] = 0
        lines -= r + dn
      }
    }
  }
  walk(0)
  return out
}

/** How many fences the field has, counted up to `limit`. */
export const countFenceSolutions = (p: FencePuzzle, limit = 2) => fenceSolutions(p, limit).length
