/**
 * Lamplighter (Light Up, also called Akari): the rules, and a reader's way
 * of solving.
 *
 * A square house of N × N squares is floor (white squares) and walls (black
 * squares), some walls carrying a number. The reader puts lamps on floor
 * squares. A lamp lights its own square and shines along its row and its
 * column, both ways, until a wall or the house's edge stops it. A finished
 * house obeys:
 *
 * - every floor square is lit;
 * - no lamp shines on another lamp;
 * - a wall with a number has exactly that many lamps on the squares that
 *   share a side with it (a wall with no number may have any).
 *
 * The solver works the way a reader does, one sure step at a time, and never
 * guesses. It marks each floor square as a lamp, as dark (a dot: no lamp
 * here), or leaves it open. Every step follows from the rules alone, so a
 * house the solver finishes has exactly one answer. What it may use depends
 * on the level:
 *
 * - `basic` — count and cross off: a square a lamp shines on gets a dot; a
 *   number with all its lamps gets dots on its other sides; a number with
 *   just enough open sides left gets lamps on all of them; a square only one
 *   place can still light gets its lamp there.
 * - `shine` — adds "wherever the light comes from": when every place that
 *   could light some square also shines on another square, that other
 *   square gets a dot; and when a number's lamps must fall on enough of the
 *   squares some square sees, that square gets a dot.
 * - `probe` — adds "what if": a lamp on a square that leads, by the basic
 *   steps, straight to a broken rule is crossed off.
 */

/** A floor square. */
export const LAMP_FLOOR = -1
/** A wall with no number. */
export const LAMP_WALL = -2

export interface LampPuzzle {
  /** Squares across and down. */
  size: number
  /** Every square in reading order: LAMP_FLOOR, LAMP_WALL, or a wall's number 0–4. */
  cells: readonly number[]
}

export type LampRules = 'basic' | 'shine' | 'probe'

const RANK: Record<LampRules, number> = { basic: 0, shine: 1, probe: 2 }

export const isLampWall = (value: number) => value !== LAMP_FLOOR
export const isLampNumber = (value: number) => value >= 0

/** True when the house is well formed: every square floor, a plain wall, or a wall numbered 0–4. */
export function lampWellFormed(p: LampPuzzle): boolean {
  const n = p.size
  if (!Number.isInteger(n) || n < 3 || p.cells.length !== n * n) return false
  return p.cells.every((v) => v === LAMP_FLOOR || v === LAMP_WALL || (Number.isInteger(v) && v >= 0 && v <= 4))
}

/* ------------------------------------------------------------------ *
 * What each square sees
 * ------------------------------------------------------------------ */

interface Geometry {
  n: number
  /** Per floor square: every other floor square in its row and column, up to the walls. */
  sight: number[][]
  /** Per square: the floor squares that share a side with it. */
  around: number[][]
  /** The numbered walls. */
  numbered: number[]
  /** The floor squares. */
  floor: number[]
}

const geometryCache = new WeakMap<LampPuzzle, Geometry>()

function geometry(p: LampPuzzle): Geometry {
  const cached = geometryCache.get(p)
  if (cached) return cached
  const n = p.size
  const sight: number[][] = Array.from({ length: n * n }, () => [])
  const around: number[][] = Array.from({ length: n * n }, () => [])
  const numbered: number[] = []
  const floor: number[] = []
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n)
    const c = i % n
    if (isLampNumber(p.cells[i]!)) numbered.push(i)
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const rr = r + dr
      const cc = c + dc
      if (rr >= 0 && rr < n && cc >= 0 && cc < n && p.cells[rr * n + cc] === LAMP_FLOOR) around[i]!.push(rr * n + cc)
    }
    if (p.cells[i] !== LAMP_FLOOR) continue
    floor.push(i)
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < n && cc >= 0 && cc < n; rr += dr, cc += dc) {
        if (p.cells[rr * n + cc] !== LAMP_FLOOR) break
        sight[i]!.push(rr * n + cc)
      }
    }
  }
  const g = { n, sight, around, numbered, floor }
  geometryCache.set(p, g)
  return g
}

/** The floor squares a lamp on `i` shines on (its row and column, up to the walls). */
export function lampSight(p: LampPuzzle, i: number): readonly number[] {
  return geometry(p).sight[i] ?? []
}

/** The floor squares sharing a side with square `i`. */
export function lampAround(p: LampPuzzle, i: number): readonly number[] {
  return geometry(p).around[i] ?? []
}

/** True when the lamps light a finished house. */
export function isLampSolution(p: LampPuzzle, lamps: readonly number[]): boolean {
  const g = geometry(p)
  const n = p.size
  const on = new Uint8Array(n * n)
  for (const i of lamps) {
    if (!Number.isInteger(i) || i < 0 || i >= n * n || p.cells[i] !== LAMP_FLOOR || on[i]) return false
    on[i] = 1
  }
  const lit = new Uint8Array(n * n)
  for (const i of lamps) {
    lit[i] = 1
    for (const j of g.sight[i]!) {
      if (on[j]) return false
      lit[j] = 1
    }
  }
  if (g.floor.some((i) => !lit[i])) return false
  return g.numbered.every((w) => g.around[w]!.filter((j) => on[j]).length === p.cells[w])
}

/** Every square the lamps light, as a mask. */
export function lampLitMask(p: LampPuzzle, lamps: readonly number[]): Uint8Array {
  const g = geometry(p)
  const lit = new Uint8Array(p.size * p.size)
  for (const i of lamps) {
    lit[i] = 1
    for (const j of g.sight[i]!) lit[j] = 1
  }
  return lit
}

/** A whole answer as one comparable string. */
export const lampAnswerKey = (lamps: readonly number[]) => [...lamps].sort((a, b) => a - b).join(',')

/* ------------------------------------------------------------------ *
 * The solver's pencil marks
 * ------------------------------------------------------------------ */

const OPEN = 0
const LAMP = 1
const DARK = 2

type Step = 'changed' | 'same' | 'broken'

export interface LampTally {
  basic: number
  shine: number
  probe: number
}

interface State {
  /** Per square: OPEN, LAMP or DARK (walls stay OPEN and are never read). */
  mark: Int8Array
  /** Per square: lit by a lamp. */
  lit: Uint8Array
}

export interface LampSolveResult {
  solved: boolean
  /** The lamps placed, in reading order. */
  lamps: number[]
  /** Floor squares still undecided. */
  open: number
  /** How many times each kind of step moved the house on. */
  tally: LampTally
}

const copy = (s: State): State => ({ mark: s.mark.slice(), lit: s.lit.slice() })

/** A lamp on `i`: its square and all it shines on are lit, and get dots. */
function place(g: Geometry, s: State, i: number): Step {
  if (s.mark[i] === LAMP) return 'same'
  if (s.mark[i] === DARK || s.lit[i]) return 'broken'
  s.mark[i] = LAMP
  s.lit[i] = 1
  for (const j of g.sight[i]!) {
    if (s.mark[j] === LAMP) return 'broken'
    s.lit[j] = 1
    s.mark[j] = DARK
  }
  return 'changed'
}

/** The places that could still light square `i`: itself, and what it sees, where still open. */
function lighters(g: Geometry, s: State, i: number): number[] {
  const out: number[] = []
  if (s.mark[i] === OPEN) out.push(i)
  for (const j of g.sight[i]!) if (s.mark[j] === OPEN) out.push(j)
  return out
}

/** Counting round the numbers, and squares only one place can light, until nothing moves. */
function runBasic(p: LampPuzzle, g: Geometry, s: State): Step {
  let any = false
  for (let again = true; again; ) {
    again = false
    for (const w of g.numbered) {
      const want = p.cells[w]!
      let lamps = 0
      let open = 0
      for (const j of g.around[w]!) {
        if (s.mark[j] === LAMP) lamps++
        else if (s.mark[j] === OPEN) open++
      }
      if (lamps > want || lamps + open < want) return 'broken'
      if (open === 0) continue
      if (lamps === want) {
        for (const j of g.around[w]!) if (s.mark[j] === OPEN) s.mark[j] = DARK
        again = true
      } else if (lamps + open === want) {
        for (const j of g.around[w]!) if (s.mark[j] === OPEN && place(g, s, j) === 'broken') return 'broken'
        again = true
      }
    }
    for (const i of g.floor) {
      if (s.lit[i]) continue
      const can = lighters(g, s, i)
      if (can.length === 0) return 'broken'
      if (can.length === 1) {
        if (place(g, s, can[0]!) === 'broken') return 'broken'
        again = true
      }
    }
    if (again) any = true
  }
  return any ? 'changed' : 'same'
}

/**
 * "Wherever the light comes from": a square every possible lighter of some
 * dark square would shine on gets a dot; and a square that sees more of a
 * number's open sides than the number can leave dark gets a dot.
 */
function shine(p: LampPuzzle, g: Geometry, s: State): Step {
  let any = false
  const seen = new Int16Array(p.size * p.size)
  const dot = (j: number) => {
    if (s.mark[j] !== OPEN) return
    s.mark[j] = DARK
    any = true
  }
  // Every lighter of an unlit square shines on these.
  for (const i of g.floor) {
    if (s.lit[i]) continue
    const can = lighters(g, s, i)
    if (can.length < 2) continue
    seen.fill(0)
    for (const k of can) for (const j of g.sight[k]!) seen[j]!++
    for (const j of g.floor) if (seen[j] === can.length && !can.includes(j)) dot(j)
  }
  // A number's lamps: at most `open - need` of its open sides stay dark.
  for (const w of g.numbered) {
    const open: number[] = []
    let lamps = 0
    for (const j of g.around[w]!) {
      if (s.mark[j] === LAMP) lamps++
      else if (s.mark[j] === OPEN) open.push(j)
    }
    const need = p.cells[w]! - lamps
    if (need <= 0 || open.length <= need) continue
    const spare = open.length - need
    seen.fill(0)
    for (const k of open) for (const j of g.sight[k]!) seen[j]!++
    for (const j of g.floor) if (seen[j]! > spare && !open.includes(j)) dot(j)
  }
  return any ? 'changed' : 'same'
}

/** "What if": the first open square where a lamp leads, by the basic steps, to a broken rule gets a dot. */
function probe(p: LampPuzzle, g: Geometry, s: State): Step {
  for (const i of g.floor) {
    if (s.mark[i] !== OPEN) continue
    const trial = copy(s)
    if (place(g, trial, i) === 'broken' || runBasic(p, g, trial) === 'broken') {
      s.mark[i] = DARK
      return 'changed'
    }
  }
  return 'same'
}

function decided(g: Geometry, s: State): boolean {
  return g.floor.every((i) => s.mark[i] !== OPEN)
}

/**
 * Solves the house with the level's steps only. `solved` is true only when
 * every floor square is decided and the lamps light a finished house, which
 * — every step being sound — also proves it is the only answer.
 */
export function solveLamp(p: LampPuzzle, rules: LampRules): LampSolveResult {
  const g = geometry(p)
  const n = p.size
  const s: State = { mark: new Int8Array(n * n), lit: new Uint8Array(n * n) }
  const tally: LampTally = { basic: 0, shine: 0, probe: 0 }
  const rank = RANK[rules]
  const result = (solved: boolean): LampSolveResult => {
    const lamps = g.floor.filter((i) => s.mark[i] === LAMP)
    return { solved, lamps, open: g.floor.filter((i) => s.mark[i] === OPEN).length, tally }
  }
  for (;;) {
    const basic = runBasic(p, g, s)
    if (basic === 'broken') return result(false)
    if (basic === 'changed') tally.basic++
    if (decided(g, s)) break
    if (rank >= RANK.shine) {
      const shone = shine(p, g, s)
      if (shone === 'changed') {
        tally.shine++
        continue
      }
    }
    if (rank >= RANK.probe) {
      if (probe(p, g, s) === 'changed') {
        tally.probe++
        continue
      }
    }
    return result(false)
  }
  const out = result(false)
  return { ...out, solved: isLampSolution(p, out.lamps) }
}

/**
 * The house's answers by plain search, up to `limit` of them, each as its
 * lamps in reading order — the tests' independent check on the solver. The
 * search takes the unlit square with fewest places left to light it and
 * tries each place in turn, crossing off the ones already tried, so every
 * answer is met exactly once.
 */
export function lampSolutions(p: LampPuzzle, limit = 2): number[][] {
  const g = geometry(p)
  const n = p.size
  const out: number[][] = []
  const fits = (s: State) => {
    for (const w of g.numbered) {
      let lamps = 0
      let open = 0
      for (const j of g.around[w]!) {
        if (s.mark[j] === LAMP) lamps++
        else if (s.mark[j] === OPEN && !s.lit[j]) open++
      }
      if (lamps > p.cells[w]! || lamps + open < p.cells[w]!) return false
    }
    return true
  }
  const walk = (s: State) => {
    if (out.length >= limit || !fits(s)) return
    let best: number[] | null = null
    for (const i of g.floor) {
      if (s.lit[i]) continue
      const can = lighters(g, s, i)
      if (!best || can.length < best.length) best = can
      if (best.length === 0) return
    }
    if (!best) {
      // Everything is lit, so no more lamps can go down: the numbers must already be met.
      if (g.numbered.every((w) => g.around[w]!.filter((j) => s.mark[j] === LAMP).length === p.cells[w])) {
        out.push(g.floor.filter((i) => s.mark[i] === LAMP))
      }
      return
    }
    const tried = copy(s)
    for (const k of best) {
      if (out.length >= limit) return
      const next = copy(tried)
      if (place(g, next, k) !== 'broken') walk(next)
      tried.mark[k] = DARK
    }
  }
  walk({ mark: new Int8Array(n * n), lit: new Uint8Array(n * n) })
  return out
}

/** How many answers the house has, counted up to `limit`. */
export const countLampSolutions = (p: LampPuzzle, limit = 2) => lampSolutions(p, limit).length
