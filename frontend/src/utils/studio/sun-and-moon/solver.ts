/**
 * Sun & Moon (the balanced sun-and-moon grid made famous by the daily
 * "Tango" puzzle, known on paper as Binairo or Takuzu): the rules, and a
 * reader's way of solving.
 *
 * A square grid of N × N squares (N even) is filled with suns and moons. A
 * finished grid obeys:
 *
 * - every row and every column holds as many suns as moons;
 * - never three alike side by side, across or down;
 * - two squares joined by = are alike, two joined by × are opposite;
 * - the suns and moons printed on the page stay where they are.
 *
 * The solver works the way a reader does, one sure step at a time, and never
 * guesses. It keeps a pencil mark on every square (sun, moon, or not yet
 * known). Every step follows from the rules alone, so a grid the solver
 * finishes has exactly one answer. What it may use depends on the level:
 *
 * - `basic` — the four first steps: a square joined by = or × to a known
 *   square takes its sign's answer ("signs"); two alike side by side put the
 *   other at both ends ("pairs"); two alike with one square between put the
 *   other in the middle ("gaps"); a row or column with its half of one
 *   already fills the rest with the other ("counting").
 * - `lines` — adds "make the row fit": of every way to finish one row (or
 *   column) that keeps its own rules and signs, a square that comes out the
 *   same in all of them takes that answer ("the last sun cannot go there —
 *   three moons would meet").
 * - `probe` — adds "what if": a square where a sun (or a moon) would lead,
 *   by the earlier steps, straight to a broken rule takes the other.
 */

export interface SmPuzzle {
  /** Squares across and down (even). */
  size: number
  /** Flat (row × size + col): SM_SUN, SM_MOON, or SM_BLANK for a square the reader fills. */
  givens: readonly number[]
  /** Flat: the sign between a square and the one to its right (SM_NONE, SM_SAME or SM_OPPOSITE); the last column holds none. */
  across: readonly number[]
  /** Flat: the sign between a square and the one below it; the last row holds none. */
  down: readonly number[]
}

export type SmRules = 'basic' | 'lines' | 'probe'

const RANK: Record<SmRules, number> = { basic: 0, lines: 1, probe: 2 }

export const SM_BLANK = -1
export const SM_SUN = 0
export const SM_MOON = 1

export const SM_NONE = 0
export const SM_SAME = 1
export const SM_OPPOSITE = 2

/** Pencil marks: not yet known, or the square's answer. */
export const UNKNOWN = -1

type Step = 'changed' | 'same' | 'broken'

/* ------------------------------------------------------------------ *
 * Lines
 * ------------------------------------------------------------------ */

const patternCache = new Map<number, Int32Array>()

/**
 * Every way to fill one line of `n` squares on its own: as many moons (bit
 * set) as suns, never three alike in a row. Bit k is the line's k-th square.
 */
export function smLinePatterns(n: number): Int32Array {
  const cached = patternCache.get(n)
  if (cached) return cached
  const out: number[] = []
  const half = n / 2
  const walk = (k: number, bits: number, moons: number, run: number, last: number) => {
    if (moons > half || k - moons > half) return
    if (k === n) {
      out.push(bits)
      return
    }
    for (const v of [0, 1]) {
      const nextRun = v === last ? run + 1 : 1
      if (nextRun > 2) continue
      walk(k + 1, v ? bits | (1 << k) : bits, moons + v, nextRun, v)
    }
  }
  walk(0, 0, 0, 0, -1)
  const patterns = Int32Array.from(out)
  patternCache.set(n, patterns)
  return patterns
}

interface Line {
  /** The line's squares, in order. */
  cells: number[]
  /** The line's own signs: [position k, the sign between squares k and k + 1]. */
  signs: [number, number][]
  /** Every way to fill the line that keeps its own signs. */
  patterns: Int32Array
}

interface Geometry {
  n: number
  /** Rows, then columns. */
  lines: Line[]
  /** Every sign on the grid: [square, square, sign]. */
  links: [number, number, number][]
}

const geometryCache = new WeakMap<SmPuzzle, Geometry>()

function keepsSigns(bits: number, signs: readonly [number, number][]): boolean {
  for (const [k, sign] of signs) {
    const alike = ((bits >> k) & 1) === ((bits >> (k + 1)) & 1)
    if (sign === SM_SAME ? !alike : alike) return false
  }
  return true
}

function geometry(p: SmPuzzle): Geometry {
  const cached = geometryCache.get(p)
  if (cached) return cached
  const n = p.size
  const all = smLinePatterns(n)
  const lines: Line[] = []
  const links: [number, number, number][] = []
  for (let r = 0; r < n; r++) {
    const cells = Array.from({ length: n }, (_, k) => r * n + k)
    const signs: [number, number][] = []
    for (let k = 0; k < n - 1; k++) {
      const sign = p.across[r * n + k] ?? SM_NONE
      if (sign !== SM_NONE) {
        signs.push([k, sign])
        links.push([r * n + k, r * n + k + 1, sign])
      }
    }
    lines.push({ cells, signs, patterns: all.filter((bits) => keepsSigns(bits, signs)) })
  }
  for (let c = 0; c < n; c++) {
    const cells = Array.from({ length: n }, (_, k) => k * n + c)
    const signs: [number, number][] = []
    for (let k = 0; k < n - 1; k++) {
      const sign = p.down[k * n + c] ?? SM_NONE
      if (sign !== SM_NONE) {
        signs.push([k, sign])
        links.push([k * n + c, (k + 1) * n + c, sign])
      }
    }
    lines.push({ cells, signs, patterns: all.filter((bits) => keepsSigns(bits, signs)) })
  }
  const g = { n, lines, links }
  geometryCache.set(p, g)
  return g
}

/* ------------------------------------------------------------------ *
 * The rules
 * ------------------------------------------------------------------ */

/** True when the grid is well formed: an even size of at least 4, a given or blank on every square, signs only between neighbours. */
export function smWellFormed(p: SmPuzzle): boolean {
  const n = p.size
  if (n < 4 || n % 2 !== 0) return false
  if (p.givens.length !== n * n || p.across.length !== n * n || p.down.length !== n * n) return false
  if (p.givens.some((v) => v !== SM_BLANK && v !== SM_SUN && v !== SM_MOON)) return false
  const signOk = (v: number) => v === SM_NONE || v === SM_SAME || v === SM_OPPOSITE
  for (let i = 0; i < n * n; i++) {
    if (!signOk(p.across[i]!) || !signOk(p.down[i]!)) return false
    if (i % n === n - 1 && p.across[i] !== SM_NONE) return false
    if (i >= n * (n - 1) && p.down[i] !== SM_NONE) return false
  }
  return true
}

/** True when the answer (a sun or a moon on every square) finishes the grid. */
export function isSmSolution(p: SmPuzzle, answer: ArrayLike<number>): boolean {
  const n = p.size
  if (answer.length !== n * n) return false
  for (let i = 0; i < n * n; i++) {
    const v = answer[i]!
    if (v !== SM_SUN && v !== SM_MOON) return false
    if (p.givens[i] !== SM_BLANK && p.givens[i] !== v) return false
    const r = Math.floor(i / n)
    const c = i % n
    if (c + 1 < n && !signHolds(p.across[i]!, v, answer[i + 1]!)) return false
    if (r + 1 < n && !signHolds(p.down[i]!, v, answer[i + n]!)) return false
  }
  for (let a = 0; a < n; a++) {
    let rowMoons = 0
    let colMoons = 0
    for (let k = 0; k < n; k++) {
      rowMoons += answer[a * n + k]!
      colMoons += answer[k * n + a]!
      if (k >= 2) {
        const row = [answer[a * n + k - 2], answer[a * n + k - 1], answer[a * n + k]]
        const col = [answer[(k - 2) * n + a], answer[(k - 1) * n + a], answer[k * n + a]]
        if (row[0] === row[1] && row[1] === row[2]) return false
        if (col[0] === col[1] && col[1] === col[2]) return false
      }
    }
    if (rowMoons !== n / 2 || colMoons !== n / 2) return false
  }
  return true
}

function signHolds(sign: number, a: number, b: number): boolean {
  if (sign === SM_SAME) return a === b
  if (sign === SM_OPPOSITE) return a !== b
  return true
}

/** The answer as one comparable string: S for a sun, M for a moon, . for a square not known. */
export const smAnswerText = (answer: ArrayLike<number>) => Array.from(answer, (v) => (v === SM_SUN ? 'S' : v === SM_MOON ? 'M' : '.')).join('')

/* ------------------------------------------------------------------ *
 * The solver's steps
 * ------------------------------------------------------------------ */

export interface SmTally {
  basic: number
  lines: number
  probe: number
}

export interface SmSolveResult {
  solved: boolean
  /** Per square: -1 not known, 0 sun, 1 moon. */
  state: Int8Array
  /** How many times each kind of step moved the grid on. */
  tally: SmTally
}

/** Writes an answer in a square; broken when the square already holds the other. */
function mark(s: Int8Array, i: number, v: number): Step {
  if (s[i] === v) return 'same'
  if (s[i] !== UNKNOWN) return 'broken'
  s[i] = v
  return 'changed'
}

/**
 * The four first steps until nothing moves: signs, pairs, gaps and counting.
 * Also notices any broken rule: three alike, a line over its half, a sign
 * not kept.
 */
function runBasic(g: Geometry, s: Int8Array): Step {
  const half = g.n / 2
  let any = false
  for (let again = true; again; ) {
    again = false
    const put = (i: number, v: number): boolean => {
      const step = mark(s, i, v)
      if (step === 'broken') return false
      if (step === 'changed') again = any = true
      return true
    }
    // Signs.
    for (const [a, b, sign] of g.links) {
      const va = s[a]!
      const vb = s[b]!
      if (va !== UNKNOWN && vb !== UNKNOWN) {
        if (!signHolds(sign, va, vb)) return 'broken'
      } else if (va !== UNKNOWN) {
        if (!put(b, sign === SM_SAME ? va : 1 - va)) return 'broken'
      } else if (vb !== UNKNOWN) {
        if (!put(a, sign === SM_SAME ? vb : 1 - vb)) return 'broken'
      }
    }
    for (const { cells } of g.lines) {
      // Pairs and gaps: any three in a row with two alike put the other in the third.
      for (let k = 2; k < cells.length; k++) {
        const a = cells[k - 2]!
        const b = cells[k - 1]!
        const c = cells[k]!
        const va = s[a]!
        const vb = s[b]!
        const vc = s[c]!
        if (va !== UNKNOWN && va === vb && vb === vc) return 'broken'
        if (va !== UNKNOWN && va === vb && vc === UNKNOWN && !put(c, 1 - va)) return 'broken'
        if (vb !== UNKNOWN && vb === vc && va === UNKNOWN && !put(a, 1 - vb)) return 'broken'
        if (va !== UNKNOWN && va === vc && vb === UNKNOWN && !put(b, 1 - va)) return 'broken'
      }
      // Counting.
      let suns = 0
      let moons = 0
      for (const i of cells) {
        if (s[i] === 0) suns++
        else if (s[i] === 1) moons++
      }
      if (suns > half || moons > half) return 'broken'
      if (suns + moons < cells.length && (suns === half || moons === half)) {
        const fill = suns === half ? 1 : 0
        for (const i of cells) if (s[i] === UNKNOWN && !put(i, fill)) return 'broken'
      }
    }
  }
  return any ? 'changed' : 'same'
}

/**
 * "Make the row fit": every line's ways to finish that agree with what is
 * already known; a square they all agree on takes that answer. Broken when
 * a line has no way left.
 */
function fitLines(g: Geometry, s: Int8Array): Step {
  let any = false
  for (const line of g.lines) {
    let moons = 0
    let suns = 0
    let open = 0
    line.cells.forEach((i, k) => {
      if (s[i] === 1) moons |= 1 << k
      else if (s[i] === 0) suns |= 1 << k
      else open++
    })
    if (open === 0) continue
    let all = -1
    let some = 0
    let found = false
    for (const bits of line.patterns) {
      if ((bits & suns) !== 0 || (bits & moons) !== moons) continue
      all &= bits
      some |= bits
      found = true
    }
    if (!found) return 'broken'
    for (let k = 0; k < line.cells.length; k++) {
      const i = line.cells[k]!
      if (s[i] !== UNKNOWN) continue
      if ((all >> k) & 1) {
        s[i] = 1
        any = true
      } else if (!((some >> k) & 1)) {
        s[i] = 0
        any = true
      }
    }
  }
  return any ? 'changed' : 'same'
}

/** The steps up to and including `rank`, short of "what if", until nothing moves. */
function runTo(g: Geometry, s: Int8Array, rank: number, tally: SmTally | null): Step {
  let any = false
  for (;;) {
    const basic = runBasic(g, s)
    if (basic === 'broken') return 'broken'
    if (basic === 'changed') {
      any = true
      if (tally) tally.basic++
    }
    if (rank < RANK.lines || !s.includes(UNKNOWN)) return any ? 'changed' : 'same'
    const fitted = fitLines(g, s)
    if (fitted === 'broken') return 'broken'
    if (fitted === 'same') return any ? 'changed' : 'same'
    any = true
    if (tally) tally.lines++
  }
}

/**
 * "What if": the first open square (in reading order) where one answer
 * leads, by the basic steps and "make the row fit", to a broken rule takes
 * the other.
 */
function probe(g: Geometry, s: Int8Array): Step {
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== UNKNOWN) continue
    for (const v of [0, 1]) {
      const trial = s.slice()
      trial[i] = v
      if (runTo(g, trial, RANK.lines, null) === 'broken') {
        s[i] = 1 - v
        return 'changed'
      }
    }
  }
  return 'same'
}

/** The pencil marks a grid starts with: its printed suns and moons. */
export function smStartState(p: SmPuzzle): Int8Array {
  return Int8Array.from(p.givens, (v) => (v === SM_BLANK ? UNKNOWN : v))
}

/**
 * Carries on solving from pencil marks already made (sound for any marks the
 * grid's own clues lead to), with the level's steps only.
 */
export function smAdvance(p: SmPuzzle, s: Int8Array, rules: SmRules, tally: SmTally): boolean {
  const g = geometry(p)
  const rank = RANK[rules]
  for (;;) {
    if (runTo(g, s, Math.min(rank, RANK.lines), tally) === 'broken') return false
    if (!s.includes(UNKNOWN)) return true
    if (rank < RANK.probe) return false
    if (probe(g, s) === 'same') return false
    tally.probe++
  }
}

/**
 * Solves the grid with the level's steps only. `solved` is true only when
 * every square is decided and the rules hold, which — every step being sound
 * — also proves it is the only answer.
 */
export function solveSm(p: SmPuzzle, rules: SmRules): SmSolveResult {
  const s = smStartState(p)
  const tally: SmTally = { basic: 0, lines: 0, probe: 0 }
  // A printed square that breaks a rule on its own is a broken grid.
  const finished = smAdvance(p, s, rules, tally)
  return { solved: finished && isSmSolution(p, s), state: s, tally }
}

/**
 * The grid's answers by plain search, up to `limit` of them — the tests'
 * independent check on the solver.
 */
export function smSolutions(p: SmPuzzle, limit = 2): Int8Array[] {
  const n = p.size
  const half = n / 2
  const s = new Int8Array(n * n).fill(UNKNOWN)
  const rowCount = [new Array<number>(n).fill(0), new Array<number>(n).fill(0)]
  const colCount = [new Array<number>(n).fill(0), new Array<number>(n).fill(0)]
  const out: Int8Array[] = []
  const walk = (i: number) => {
    if (out.length >= limit) return
    if (i === n * n) {
      out.push(s.slice())
      return
    }
    const r = Math.floor(i / n)
    const c = i % n
    for (const v of [0, 1]) {
      if (p.givens[i] !== SM_BLANK && p.givens[i] !== v) continue
      if (rowCount[v]![r]! >= half || colCount[v]![c]! >= half) continue
      if (c >= 2 && s[i - 1] === v && s[i - 2] === v) continue
      if (r >= 2 && s[i - n] === v && s[i - 2 * n] === v) continue
      if (c >= 1 && !signHolds(p.across[i - 1]!, s[i - 1]!, v)) continue
      if (r >= 1 && !signHolds(p.down[i - n]!, s[i - n]!, v)) continue
      s[i] = v
      rowCount[v]![r]!++
      colCount[v]![c]!++
      walk(i + 1)
      rowCount[v]![r]!--
      colCount[v]![c]!--
      s[i] = UNKNOWN
    }
  }
  walk(0)
  return out
}

/** How many answers the grid has, counted up to `limit`. */
export const countSmSolutions = (p: SmPuzzle, limit = 2) => smSolutions(p, limit).length
