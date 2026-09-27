/**
 * Stepping Stones (a number path): the rules, and a reader's way of solving.
 *
 * A square path of N × N stepping stones, some holding a number. The reader
 * writes every number from 1 to N² on the stones, one to a stone, so the
 * numbers make one walk: each number sits on a stone next to the one before
 * it, across or down, never diagonally. A finished path obeys:
 *
 * - every stone holds one number, every number from 1 to N² is used once;
 * - k and k + 1 are always on neighbouring stones;
 * - the numbers printed on the page stay where they are.
 *
 * The solver works the way a reader does, one sure step at a time, and never
 * guesses. It keeps a pencil list on every empty stone of the numbers that
 * could still go there, and crosses numbers off it. Every step follows from
 * the rules alone, so a path the solver finishes is the only one. What it
 * may use depends on the level:
 *
 * - `reach` — "count the steps": between two numbers on the page, say 5 and
 *   9, the numbers 6, 7, 8 fill a walk exactly that long, so 7 sits no more
 *   than two steps from either, counted round the stones already filled —
 *   and, as a walk colours a checkerboard black, white, black…, only on a
 *   stone of the right colour. A number with one stone left goes there; a
 *   stone with one number left takes it.
 * - `link` — adds "no dead ends": a number in the middle of the path needs
 *   the number before it on one neighbour and the one after it on another,
 *   so a stone whose neighbours cannot give it both is crossed off that
 *   number (a stone with one open neighbour can only be the start or the
 *   finish).
 * - `probe` — adds "what if": a number on a stone that leads, by the `link`
 *   steps, straight to a broken rule is crossed off it.
 */

/** A stone with no number. */
export const STONES_BLANK = 0

export interface StonesPuzzle {
  /** Stones across and down. */
  size: number
  /** Every stone in reading order: STONES_BLANK, or the number printed on it (1 … size²). */
  clues: readonly number[]
}

export type StonesRules = 'reach' | 'link' | 'probe'

const RANK: Record<StonesRules, number> = { reach: 0, link: 1, probe: 2 }

/** True when the path is well formed: every stone blank or a number from 1 to N², none twice. */
export function stonesWellFormed(p: StonesPuzzle): boolean {
  const n = p.size
  if (!Number.isInteger(n) || n < 2 || p.clues.length !== n * n) return false
  const N = n * n
  const seen = new Set<number>()
  for (const v of p.clues) {
    if (v === STONES_BLANK) continue
    if (!Number.isInteger(v) || v < 1 || v > N || seen.has(v)) return false
    seen.add(v)
  }
  return true
}

/* ------------------------------------------------------------------ *
 * The stones
 * ------------------------------------------------------------------ */

const neighbourCache = new Map<number, Int32Array>()

/** Per stone, its neighbours up, right, down, left (-1 past the edge), four to a stone. */
export function stonesNeighbours(n: number): Int32Array {
  const cached = neighbourCache.get(n)
  if (cached) return cached
  const out = new Int32Array(n * n * 4).fill(-1)
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const s = r * n + c
      if (r > 0) out[s * 4] = s - n
      if (c < n - 1) out[s * 4 + 1] = s + 1
      if (r < n - 1) out[s * 4 + 2] = s + n
      if (c > 0) out[s * 4 + 3] = s - 1
    }
  }
  neighbourCache.set(n, out)
  return out
}

/** True when two stones share a side. */
export function stonesTouch(n: number, a: number, b: number): boolean {
  const ra = Math.floor(a / n)
  const rb = Math.floor(b / n)
  return (ra === rb && Math.abs(a - b) === 1) || (a % n === b % n && Math.abs(ra - rb) === 1)
}

/** The stones in walking order, 1 first; null unless `values` holds every number once. */
export function stonesPathOrder(n: number, values: readonly number[]): number[] | null {
  const N = n * n
  if (values.length !== N) return null
  const order = new Array<number>(N).fill(-1)
  for (let s = 0; s < N; s++) {
    const v = values[s]!
    if (!Number.isInteger(v) || v < 1 || v > N || order[v - 1] !== -1) return null
    order[v - 1] = s
  }
  return order
}

/** True when the numbers make one walk: every number once, each beside the one before. */
export function stonesIsPath(n: number, values: readonly number[]): boolean {
  const order = stonesPathOrder(n, values)
  if (!order) return false
  for (let k = 1; k < order.length; k++) if (!stonesTouch(n, order[k - 1]!, order[k]!)) return false
  return true
}

/** A finished path as one comparable string. */
export const stonesAnswerKey = (values: readonly number[]) => values.join(',')

/** True when the numbers make a finished path for the puzzle. */
export function isStonesSolution(p: StonesPuzzle, values: readonly number[]): boolean {
  if (!stonesIsPath(p.size, values)) return false
  return p.clues.every((v, s) => v === STONES_BLANK || values[s] === v)
}

/* ------------------------------------------------------------------ *
 * The solver's pencil lists
 * ------------------------------------------------------------------ */

export interface StonesTally {
  reach: number
  link: number
  probe: number
}

export interface StonesSolveResult {
  solved: boolean
  /** The number on every stone (STONES_BLANK where none is known). */
  values: number[]
  /** Stones still empty. */
  open: number
  /** A rule was found broken: the puzzle has no path. */
  broken: boolean
  /** How many times each kind of step moved the path on. */
  tally: StonesTally
}

class Broken extends Error {}
const BROKEN = new Broken()

interface State {
  n: number
  /** Numbers on the path: n². */
  N: number
  nb: Int32Array
  /** The number on each stone, or 0. */
  val: Int16Array
  /** The stone of each number (1 … N), or -1. */
  pos: Int16Array
  /** Pencil marks: stone s may take number v when `cand[s·(N+1) + v]`. */
  cand: Uint8Array
  /** Pencil marks left per stone, and stones left per number. */
  cellLeft: Int16Array
  valueLeft: Int16Array
  /** Empty stones. */
  open: number
  changed: boolean
  tally: StonesTally
}

function freshState(p: StonesPuzzle): State {
  const n = p.size
  const N = n * n
  const x: State = {
    n,
    N,
    nb: stonesNeighbours(n),
    val: new Int16Array(N),
    pos: new Int16Array(N + 1).fill(-1),
    cand: new Uint8Array(N * (N + 1)),
    cellLeft: new Int16Array(N),
    valueLeft: new Int16Array(N + 1),
    open: N,
    changed: false,
    tally: { reach: 0, link: 0, probe: 0 },
  }
  for (let s = 0; s < N; s++) {
    for (let v = 1; v <= N; v++) x.cand[s * (N + 1) + v] = 1
    x.cellLeft[s] = N
  }
  for (let v = 1; v <= N; v++) x.valueLeft[v] = N
  p.clues.forEach((v, s) => {
    if (v !== STONES_BLANK) place(x, s, v)
  })
  x.changed = false
  return x
}

function cloneState(x: State): State {
  return {
    ...x,
    val: x.val.slice(),
    pos: x.pos.slice(),
    cand: x.cand.slice(),
    cellLeft: x.cellLeft.slice(),
    valueLeft: x.valueLeft.slice(),
    changed: false,
    tally: { ...x.tally },
  }
}

function cross(x: State, s: number, v: number): void {
  const k = s * (x.N + 1) + v
  if (!x.cand[k]) return
  x.cand[k] = 0
  x.cellLeft[s]!--
  x.valueLeft[v]!--
  x.changed = true
}

function place(x: State, s: number, v: number): void {
  if (x.val[s] === v && x.pos[v] === s) return
  if (x.val[s] !== 0 || x.pos[v] !== -1) throw BROKEN
  if (!x.cand[s * (x.N + 1) + v]) throw BROKEN
  for (let w = 1; w <= x.N; w++) cross(x, s, w)
  for (let t = 0; t < x.N; t++) cross(x, t, v)
  x.val[s] = v
  x.pos[v] = s
  x.open--
  x.changed = true
}

/** Walking distance from stone `from` to every stone, stepping only over empty stones (a filled stone is reached, never walked through). */
function distances(x: State, from: number): Int16Array {
  const d = new Int16Array(x.N).fill(-1)
  d[from] = 0
  const queue = [from]
  for (let q = 0; q < queue.length; q++) {
    const s = queue[q]!
    if (s !== from && x.val[s] !== 0) continue
    for (let k = 0; k < 4; k++) {
      const t = x.nb[s * 4 + k]!
      if (t < 0 || d[t] >= 0) continue
      d[t] = d[s]! + 1
      queue.push(t)
    }
  }
  return d
}

/** True when stone `s` is `steps` or fewer steps from where `d` was measured, on the right colour of the checkerboard. */
const within = (d: Int16Array, s: number, steps: number) => {
  const k = d[s]!
  return k >= 0 && k <= steps && (steps - k) % 2 === 0
}

/**
 * "Count the steps": every number between two on the page must lie within
 * reach of both, on the right colour; two numbers on the page must be
 * reachable from each other in exactly their difference.
 */
function reachStep(x: State): void {
  const { N } = x
  const placed: number[] = []
  for (let v = 1; v <= N; v++) if (x.pos[v]! >= 0) placed.push(v)
  if (placed.length === 0) return
  const dist = new Map<number, Int16Array>()
  const from = (v: number) => {
    let d = dist.get(v)
    if (!d) {
      d = distances(x, x.pos[v]!)
      dist.set(v, d)
    }
    return d
  }
  const before = x.changed
  x.changed = false
  // Between neighbours in number order.
  for (let i = 0; i + 1 < placed.length; i++) {
    const a = placed[i]!
    const b = placed[i + 1]!
    const da = from(a)
    if (!within(da, x.pos[b]!, b - a)) throw BROKEN
    if (b - a === 1) continue
    const db = from(b)
    for (let v = a + 1; v < b; v++) {
      for (let s = 0; s < N; s++) {
        if (!x.cand[s * (N + 1) + v]) continue
        if (!within(da, s, v - a) || !within(db, s, b - v)) cross(x, s, v)
      }
    }
  }
  // Before the first number on the page, and after the last.
  const first = placed[0]!
  const last = placed[placed.length - 1]!
  if (first > 1) {
    const d = from(first)
    for (let v = 1; v < first; v++) for (let s = 0; s < N; s++) if (x.cand[s * (N + 1) + v] && !within(d, s, first - v)) cross(x, s, v)
  }
  if (last < N) {
    const d = from(last)
    for (let v = last + 1; v <= N; v++) for (let s = 0; s < N; s++) if (x.cand[s * (N + 1) + v] && !within(d, s, v - last)) cross(x, s, v)
  }
  if (x.changed) x.tally.reach++
  x.changed = x.changed || before
}

/** A number with one stone left goes there; a stone with one number left takes it; none left is a broken rule. */
function singlesStep(x: State): void {
  const { N } = x
  for (let v = 1; v <= N; v++) {
    if (x.pos[v]! >= 0) continue
    if (x.valueLeft[v] === 0) throw BROKEN
    if (x.valueLeft[v] === 1) {
      for (let s = 0; s < N; s++) {
        if (x.cand[s * (N + 1) + v]) {
          place(x, s, v)
          break
        }
      }
    }
  }
  for (let s = 0; s < N; s++) {
    if (x.val[s] !== 0) continue
    if (x.cellLeft[s] === 0) throw BROKEN
    if (x.cellLeft[s] === 1) {
      for (let v = 1; v <= N; v++) {
        if (x.cand[s * (N + 1) + v]) {
          place(x, s, v)
          break
        }
      }
    }
  }
}

/** True when stone `t` holds number `w`, or still may. */
const holds = (x: State, t: number, w: number) => x.val[t] === w || (x.val[t] === 0 && x.cand[t * (x.N + 1) + w] === 1)

/**
 * "No dead ends": a number on an empty stone needs the number before it on
 * one neighbour and the number after it on another.
 */
function linkStep(x: State): void {
  const { N, nb } = x
  const before = x.changed
  x.changed = false
  for (let s = 0; s < N; s++) {
    if (x.val[s] !== 0) continue
    for (let v = 1; v <= N; v++) {
      if (!x.cand[s * (N + 1) + v]) continue
      let down = -1
      let downs = 0
      let up = -1
      let ups = 0
      for (let k = 0; k < 4; k++) {
        const t = nb[s * 4 + k]!
        if (t < 0) continue
        if (v > 1 && holds(x, t, v - 1)) {
          downs++
          down = t
        }
        if (v < N && holds(x, t, v + 1)) {
          ups++
          up = t
        }
      }
      const needDown = v > 1
      const needUp = v < N
      const ok = (!needDown || downs > 0) && (!needUp || ups > 0) && !(needDown && needUp && downs === 1 && ups === 1 && down === up)
      if (!ok) cross(x, s, v)
    }
  }
  if (x.changed) x.tally.link++
  x.changed = x.changed || before
}

/** The level's steps short of "what if", until nothing more follows. Throws BROKEN on a broken rule. */
function settle(x: State, rules: StonesRules): void {
  for (let guard = 0; guard < 10_000; guard++) {
    x.changed = false
    reachStep(x)
    singlesStep(x)
    if (!x.changed && RANK[rules] >= RANK.link) {
      linkStep(x)
      singlesStep(x)
    }
    if (!x.changed) return
  }
}

/**
 * "What if": a number on an empty stone with few pencil marks that, placed
 * there, leads by the `link` steps straight to a broken rule is crossed off
 * that stone. Returns true when anything was crossed.
 */
function probeStep(x: State): boolean {
  const { N } = x
  for (let most = 2; most <= 3; most++) {
    for (let s = 0; s < N; s++) {
      if (x.val[s] !== 0 || x.cellLeft[s]! > most) continue
      for (let v = 1; v <= N; v++) {
        if (!x.cand[s * (N + 1) + v]) continue
        const trial = cloneState(x)
        try {
          place(trial, s, v)
          settle(trial, 'link')
        } catch (e) {
          if (e !== BROKEN) throw e
          cross(x, s, v)
          x.tally.probe++
          return true
        }
      }
    }
  }
  return false
}

function finish(x: State, broken: boolean): StonesSolveResult {
  const values = Array.from(x.val)
  const solved = !broken && x.open === 0 && stonesIsPath(x.n, values)
  return { solved, values, open: x.open, broken, tally: { ...x.tally } }
}

/**
 * Solve the way a reader would, with only the level's steps. `solved` is
 * true only when every stone is filled and the numbers make one walk;
 * because every step is sound, that walk is then the puzzle's only path.
 */
export function solveStones(p: StonesPuzzle, rules: StonesRules): StonesSolveResult {
  if (!stonesWellFormed(p)) return { solved: false, values: [...p.clues], open: p.clues.filter((v) => v === STONES_BLANK).length, broken: true, tally: { reach: 0, link: 0, probe: 0 } }
  let x: State
  try {
    x = freshState(p)
  } catch (e) {
    if (e !== BROKEN) throw e
    return { solved: false, values: [...p.clues], open: p.clues.filter((v) => v === STONES_BLANK).length, broken: true, tally: { reach: 0, link: 0, probe: 0 } }
  }
  try {
    settle(x, rules)
    if (RANK[rules] >= RANK.probe) {
      while (x.open > 0 && probeStep(x)) {
        singlesStep(x)
        settle(x, rules)
      }
    }
  } catch (e) {
    if (e !== BROKEN) throw e
    return finish(x, true)
  }
  return finish(x, false)
}

/* ------------------------------------------------------------------ *
 * Plain search (for tests): how many paths a puzzle has
 * ------------------------------------------------------------------ */

/**
 * How many finished paths the puzzle has, counting no further than `limit`.
 * A plain walk from 1 upward, trying every free neighbour, cut short only
 * when the next printed number is out of reach. Slow, but it cannot be
 * fooled: the solver is checked against it.
 */
export function countStonesSolutions(p: StonesPuzzle, limit = 2): number {
  if (!stonesWellFormed(p)) return 0
  const n = p.size
  const N = n * n
  const nb = stonesNeighbours(n)
  const at = new Int32Array(N + 2).fill(-1)
  p.clues.forEach((v, s) => {
    if (v !== STONES_BLANK) at[v] = s
  })
  // The next printed number at or after each number.
  const nextGiven = new Int32Array(N + 2).fill(0)
  for (let v = N; v >= 1; v--) nextGiven[v] = at[v]! >= 0 ? v : v === N ? 0 : nextGiven[v + 1]!
  const used = new Int16Array(N)
  p.clues.forEach((v, s) => {
    if (v !== STONES_BLANK) used[s] = v
  })
  const taken = new Uint8Array(N)
  let found = 0
  const manhattan = (a: number, b: number) => Math.abs(Math.floor(a / n) - Math.floor(b / n)) + Math.abs((a % n) - (b % n))
  const fits = (s: number, v: number) => {
    const g = nextGiven[v + 1] ?? 0
    if (!g) return true
    const d = manhattan(s, at[g]!)
    return d <= g - v && (g - v - d) % 2 === 0
  }
  const walk = (s: number, v: number) => {
    if (found >= limit) return
    if (v === N) {
      found++
      return
    }
    const w = v + 1
    for (let k = 0; k < 4; k++) {
      const t = nb[s * 4 + k]!
      if (t < 0 || taken[t]) continue
      if (at[w]! >= 0 ? t !== at[w] : used[t] !== 0) continue
      if (!fits(t, w)) continue
      taken[t] = 1
      walk(t, w)
      taken[t] = 0
    }
  }
  const starts = at[1]! >= 0 ? [at[1]!] : Array.from({ length: N }, (_, s) => s).filter((s) => used[s] === 0)
  for (const s of starts) {
    if (!fits(s, 1)) continue
    taken[s] = 1
    walk(s, 1)
    taken[s] = 0
  }
  return found
}
