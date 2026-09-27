/**
 * Game Night (the math-cage number grid known in puzzle books as Calcudoku):
 * the rules, and a reader's way of solving.
 *
 * A square grid of N × N squares is split by bold lines into boxes of one to
 * four squares. Every box carries a target number and a sign (+ − × ÷); a
 * box of one square carries its number alone. A finished grid obeys:
 *
 * - every row and every column holds 1 to N, once each;
 * - the numbers in every box make its target with its sign: added (+),
 *   multiplied (×), or — in a box of two — the smaller taken from the larger
 *   (−) or the larger divided by the smaller (÷); a box of one holds its
 *   target.
 *
 * A number may show twice in one box when the two squares are in different
 * rows and columns (an L-shaped box, say). The solver allows it, as the
 * rules do, although the builder never prints an answer that needs it.
 *
 * The solver works the way a reader does, one sure step at a time, and never
 * guesses. It keeps a pencil list on every square (the numbers still
 * possible). Every step follows from the rules alone, so a grid the solver
 * finishes has exactly one answer. What it may use depends on the level:
 *
 * - `basic` — the first steps: a box's possible fills ("what can make 12×
 *   in two squares?") trim its squares' lists ("boxes"); a number known in a
 *   square leaves the rest of its row and column ("taken"); a number with
 *   one place left in a row or column goes there ("only place").
 * - `lines` — adds "must be here": a box whose every fill puts a number in
 *   the same row (or column) keeps it out of the rest of that row, and two
 *   squares of a row sharing the same two numbers (or three sharing three)
 *   keep them out of the rest ("pairs").
 * - `probe` — adds "what if": in a square down to two numbers, one whose
 *   pencilling in leads, by the earlier steps, straight to a broken rule is
 *   crossed off, and the square takes the other.
 */

export type GnOp = '+' | '-' | '*' | '/' | '='

export interface GnCage {
  /** Squares, flat (row × size + col), in reading order. */
  cells: readonly number[]
  op: GnOp
  target: number
}

export interface GnPuzzle {
  /** Squares across and down; the numbers run 1 to size. */
  size: number
  cages: readonly GnCage[]
}

export type GnRules = 'basic' | 'lines' | 'probe'

const RANK: Record<GnRules, number> = { basic: 0, lines: 1, probe: 2 }

/** The most squares a box may hold. */
export const GN_MAX_CAGE = 4

type Step = 'changed' | 'same' | 'broken'

const bit = (v: number) => 1 << v
function popcount(m: number): number {
  let c = 0
  while (m) {
    m &= m - 1
    c++
  }
  return c
}
/** The one number a single-bit mask holds. */
const only = (m: number) => 31 - Math.clz32(m)

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

interface CagePart {
  /** Line index (rows 0..n-1, then columns n..2n-1). */
  line: number
  /** Positions within the cage's cells that lie on this line. */
  at: number[]
}

interface CageGeometry {
  cells: number[]
  op: GnOp
  target: number
  /** Per position: earlier positions sharing its row or column (must differ). */
  clash: number[][]
  /** Every line the cage touches, with the positions of its squares on it. */
  parts: CagePart[]
}

interface Geometry {
  n: number
  full: number
  lines: number[][]
  /** Per square: the lines it lies on ([row, n + col]). */
  linesOf: number[][]
  /** Per square: its cage. */
  cageOf: Int32Array
  cages: CageGeometry[]
}

const geometryCache = new WeakMap<GnPuzzle, Geometry>()

function geometry(p: GnPuzzle): Geometry {
  const cached = geometryCache.get(p)
  if (cached) return cached
  const n = p.size
  const lines: number[][] = []
  for (let r = 0; r < n; r++) lines.push(Array.from({ length: n }, (_, k) => r * n + k))
  for (let c = 0; c < n; c++) lines.push(Array.from({ length: n }, (_, k) => k * n + c))
  const linesOf = Array.from({ length: n * n }, (_, i) => [Math.floor(i / n), n + (i % n)])
  const cageOf = new Int32Array(n * n).fill(-1)
  const cages: CageGeometry[] = p.cages.map((cage, ci) => {
    const cells = [...cage.cells]
    for (const i of cells) cageOf[i] = ci
    const clash = cells.map((a, k) => {
      const out: number[] = []
      for (let j = 0; j < k; j++) {
        const b = cells[j]!
        if (Math.floor(a / n) === Math.floor(b / n) || a % n === b % n) out.push(j)
      }
      return out
    })
    const byLine = new Map<number, number[]>()
    cells.forEach((i, k) => {
      for (const line of linesOf[i]!) byLine.set(line, [...(byLine.get(line) ?? []), k])
    })
    const parts = [...byLine.entries()].map(([line, at]) => ({ line, at }))
    return { cells, op: cage.op, target: cage.target, clash, parts }
  })
  let full = 0
  for (let v = 1; v <= n; v++) full |= bit(v)
  const g = { n, full, lines, linesOf, cageOf, cages }
  geometryCache.set(p, g)
  return g
}

/* ------------------------------------------------------------------ *
 * The rules
 * ------------------------------------------------------------------ */

/** True when the numbers make the target with the sign. */
export function gnCageHolds(op: GnOp, target: number, values: readonly number[]): boolean {
  if (values.length === 0) return false
  switch (op) {
    case '=':
      return values.length === 1 && values[0] === target
    case '+':
      return values.reduce((a, b) => a + b, 0) === target
    case '*':
      return values.reduce((a, b) => a * b, 1) === target
    case '-':
      return values.length === 2 && Math.abs(values[0]! - values[1]!) === target
    case '/': {
      if (values.length !== 2) return false
      const hi = Math.max(values[0]!, values[1]!)
      const lo = Math.min(values[0]!, values[1]!)
      return hi % lo === 0 && hi / lo === target
    }
  }
}

/** True when the squares are joined side by side in one piece. */
export function gnCageJoined(n: number, cells: readonly number[]): boolean {
  if (cells.length === 0) return false
  const set = new Set(cells)
  const seen = new Set([cells[0]!])
  const stack = [cells[0]!]
  while (stack.length > 0) {
    const i = stack.pop()!
    const r = Math.floor(i / n)
    const c = i % n
    for (const j of [r > 0 ? i - n : -1, c > 0 ? i - 1 : -1, c + 1 < n ? i + 1 : -1, r + 1 < n ? i + n : -1]) {
      if (j >= 0 && set.has(j) && !seen.has(j)) {
        seen.add(j)
        stack.push(j)
      }
    }
  }
  return seen.size === cells.length
}

/**
 * True when the grid is well formed: a size from 3 to 9; boxes that cover
 * every square once, each joined, in reading order, of one to four squares;
 * a lone number only on a box of one, − and ÷ only on a box of two; and
 * whole targets above zero.
 */
export function gnWellFormed(p: GnPuzzle): boolean {
  const n = p.size
  if (!Number.isInteger(n) || n < 3 || n > 9) return false
  const seen = new Uint8Array(n * n)
  for (const cage of p.cages) {
    const m = cage.cells.length
    if (m < 1 || m > GN_MAX_CAGE) return false
    if (!Number.isInteger(cage.target) || cage.target < 1) return false
    if ((cage.op === '=') !== (m === 1)) return false
    if ((cage.op === '-' || cage.op === '/') && m !== 2) return false
    for (let k = 0; k < m; k++) {
      const i = cage.cells[k]!
      if (!Number.isInteger(i) || i < 0 || i >= n * n || seen[i]) return false
      if (k > 0 && i <= cage.cells[k - 1]!) return false
      seen[i] = 1
    }
    if (!gnCageJoined(n, cage.cells)) return false
  }
  return seen.every((v) => v === 1)
}

/** True when the numbers (square by square, reading order) finish the grid. */
export function isGnSolution(p: GnPuzzle, values: ArrayLike<number>): boolean {
  const n = p.size
  if (values.length !== n * n) return false
  for (let a = 0; a < n; a++) {
    let row = 0
    let col = 0
    for (let k = 0; k < n; k++) {
      const x = values[a * n + k]!
      const y = values[k * n + a]!
      if (!Number.isInteger(x) || x < 1 || x > n || !Number.isInteger(y) || y < 1 || y > n) return false
      row |= bit(x)
      col |= bit(y)
    }
    const full = (bit(n + 1) - 1) & ~1
    if (row !== full || col !== full) return false
  }
  return p.cages.every((cage) =>
    gnCageHolds(
      cage.op,
      cage.target,
      cage.cells.map((i) => values[i]!),
    ),
  )
}

/** The numbers as one comparable string: a digit, or . where not yet known. */
export const gnValuesText = (values: ArrayLike<number>) => Array.from(values, (v) => (v >= 1 && v <= 9 ? String(v) : '.')).join('')

/* ------------------------------------------------------------------ *
 * The solver's steps
 * ------------------------------------------------------------------ */

export interface GnTally {
  basic: number
  lines: number
  probe: number
}

export interface GnSolveResult {
  solved: boolean
  /** Per square: its number, or 0 when not yet known. */
  values: number[]
  /** Per square: the pencil list left (bit v set when v is still possible). */
  masks: Uint16Array
  /** How many times each kind of step moved the grid on. */
  tally: GnTally
  /** Pencil marks beyond one per square: 0 when solved. */
  open: number
}

/**
 * The pencil lists being worked on, and which boxes and lines have lost a
 * number since each step last looked at them — a step only looks again
 * where something has changed.
 */
interface Work {
  g: Geometry
  s: Uint16Array
  /** Boxes to fill afresh ("boxes"). */
  boxes: Uint8Array
  /** Boxes to look at for "must be here". */
  musts: Uint8Array
  /** Lines to look at for "pairs". */
  pairs: Uint8Array
}

function startWork(g: Geometry, s: Uint16Array): Work {
  const cages = g.cages.length
  return { g, s, boxes: new Uint8Array(cages).fill(1), musts: new Uint8Array(cages).fill(1), pairs: new Uint8Array(2 * g.n).fill(1) }
}

/** Work on a copy of these lists, where only square i has just changed. */
function workAfter(base: Work, s: Uint16Array, i: number): Work {
  const { g } = base
  const w: Work = { g, s, boxes: new Uint8Array(g.cages.length), musts: new Uint8Array(g.cages.length), pairs: new Uint8Array(2 * g.n) }
  touched(w, i)
  return w
}

function touched(w: Work, i: number): void {
  const ci = w.g.cageOf[i]!
  w.boxes[ci] = 1
  w.musts[ci] = 1
  for (const line of w.g.linesOf[i]!) w.pairs[line] = 1
}

/** Crosses numbers off a square's list; broken when none is left. */
function narrow(w: Work, i: number, mask: number): Step {
  const next = w.s[i]! & mask
  if (next === w.s[i]) return 'same'
  if (next === 0) return 'broken'
  w.s[i] = next
  touched(w, i)
  return 'changed'
}

/** One box's fills, worked out square by square with the sums and products pruned early. */
interface Fill {
  s: Uint16Array
  n: number
  cage: CageGeometry
  vals: number[]
  union: number[]
  must: number[]
  found: boolean
}

function fillFrom(f: Fill, k: number, acc: number): void {
  const { cage } = f
  const m = cage.cells.length
  const { op, target } = cage
  if (k === m) {
    if (op === '-' || op === '/' || op === '=') {
      if (!gnCageHolds(op, target, f.vals)) return
    } else if (acc !== target) return
    f.found = true
    for (let j = 0; j < m; j++) f.union[j] = f.union[j]! | bit(f.vals[j]!)
    for (let pi = 0; pi < cage.parts.length; pi++) {
      let mask = 0
      for (const j of cage.parts[pi]!.at) mask |= bit(f.vals[j]!)
      f.must[pi] = f.must[pi]! & mask
    }
    return
  }
  const left = m - k - 1
  let mask = f.s[cage.cells[k]!]!
  for (const j of cage.clash[k]!) mask &= ~bit(f.vals[j]!)
  while (mask) {
    const low = mask & -mask
    mask &= ~low
    const v = only(low)
    let next = acc
    if (op === '+') {
      next = acc + v
      if (next + left > target || next + left * f.n < target) continue
    } else if (op === '*') {
      next = acc * v
      if (target % next !== 0) continue
    }
    f.vals[k] = v
    fillFrom(f, k + 1, next)
  }
}

/**
 * Every fill of a box from its squares' pencil lists: what each square may
 * hold (`union`), and per line the box touches, the numbers every fill puts
 * on it (`must`). Null when no fill fits.
 */
function scanCage(w: Work, cage: CageGeometry): { union: number[]; must: number[] } | null {
  const m = cage.cells.length
  const f: Fill = { s: w.s, n: w.g.n, cage, vals: new Array<number>(m).fill(0), union: new Array<number>(m).fill(0), must: cage.parts.map(() => -1), found: false }
  fillFrom(f, 0, cage.op === '*' ? 1 : 0)
  return f.found ? { union: f.union, must: f.must } : null
}

/**
 * The first steps until nothing moves: every box's fills trim its squares
 * ("boxes"); a known number leaves the rest of its row and column
 * ("taken"); a number with one place left in a line goes there ("only
 * place"). Broken when a square's list runs dry, a box has no fill, or a
 * line has no place for a number.
 */
function runBasic(w: Work): Step {
  const { g, s } = w
  let any = false
  for (;;) {
    let moved = false
    for (let ci = 0; ci < g.cages.length; ci++) {
      if (!w.boxes[ci]) continue
      w.boxes[ci] = 0
      const cage = g.cages[ci]!
      const scan = scanCage(w, cage)
      if (!scan) return 'broken'
      for (let k = 0; k < cage.cells.length; k++) {
        const step = narrow(w, cage.cells[k]!, scan.union[k]!)
        if (step === 'broken') return 'broken'
        if (step === 'changed') moved = true
      }
      // Trimmed to its own fills: that alone does not call for another look.
      w.boxes[ci] = 0
    }
    for (const line of g.lines) {
      // Taken: known numbers leave the rest of the line.
      let known = 0
      for (const i of line) {
        const m = s[i]!
        if (m & (m - 1)) continue
        if (known & m) return 'broken'
        known |= m
      }
      for (const i of line) {
        if (!(s[i]! & (s[i]! - 1))) continue
        const step = narrow(w, i, ~known)
        if (step === 'broken') return 'broken'
        if (step === 'changed') moved = true
      }
      // Only place: a number with one square left in the line goes there.
      for (let v = 1; v <= g.n; v++) {
        let at = -1
        let count = 0
        for (const i of line) {
          if (s[i]! & bit(v)) {
            count++
            at = i
          }
        }
        if (count === 0) return 'broken'
        if (count === 1 && narrow(w, at, bit(v)) === 'changed') moved = true
      }
    }
    if (!moved) return any ? 'changed' : 'same'
    any = true
  }
}

/**
 * "Must be here" and "pairs": a number every fill of a box puts on one line
 * leaves the rest of that line; two squares of a line sharing the same two
 * numbers (three sharing three) keep them from the rest of it.
 */
function runLines(w: Work): Step {
  const { g, s } = w
  let any = false
  const sweep = (line: readonly number[], skip: (i: number) => boolean, mask: number): Step => {
    for (const i of line) {
      if (skip(i)) continue
      const step = narrow(w, i, ~mask)
      if (step === 'broken') return 'broken'
      if (step === 'changed') any = true
    }
    return 'same'
  }
  for (let ci = 0; ci < g.cages.length; ci++) {
    if (!w.musts[ci]) continue
    w.musts[ci] = 0
    const cage = g.cages[ci]!
    const scan = scanCage(w, cage)
    if (!scan) return 'broken'
    for (let pi = 0; pi < cage.parts.length; pi++) {
      const must = scan.must[pi]!
      if (must && sweep(g.lines[cage.parts[pi]!.line]!, (i) => g.cageOf[i] === ci, must) === 'broken') return 'broken'
    }
  }
  for (let li = 0; li < g.lines.length; li++) {
    if (!w.pairs[li]) continue
    w.pairs[li] = 0
    const line = g.lines[li]!
    const open = line.filter((i) => s[i]! & (s[i]! - 1))
    for (let a = 0; a < open.length; a++) {
      for (let b = a + 1; b < open.length; b++) {
        const pair = s[open[a]!]! | s[open[b]!]!
        if (popcount(pair) === 2 && sweep(line, (i) => i === open[a] || i === open[b], pair) === 'broken') return 'broken'
        for (let c = b + 1; c < open.length; c++) {
          const triple = pair | s[open[c]!]!
          if (popcount(triple) === 3 && sweep(line, (i) => i === open[a] || i === open[b] || i === open[c], triple) === 'broken') return 'broken'
        }
      }
    }
  }
  return any ? 'changed' : 'same'
}

const isDone = (s: Uint16Array) => s.every((m) => !(m & (m - 1)))

/** The steps up to and including `rank`, short of "what if", until nothing moves. */
function runTo(w: Work, rank: number, tally: GnTally | null): Step {
  let any = false
  for (;;) {
    const basic = runBasic(w)
    if (basic === 'broken') return 'broken'
    if (basic === 'changed') {
      any = true
      if (tally) tally.basic++
    }
    if (rank < RANK.lines || isDone(w.s)) return any ? 'changed' : 'same'
    const lined = runLines(w)
    if (lined === 'broken') return 'broken'
    if (lined === 'same') return any ? 'changed' : 'same'
    any = true
    if (tally) tally.lines++
  }
}

/**
 * "What if": the first square (in reading order) down to two numbers where
 * pencilling one in leads, by the earlier steps, straight to a broken rule
 * takes the other — the way a reader tries a two-way square. Called only
 * once the earlier steps have nothing left to do, so a trial need only look
 * again around the square it tries.
 */
function probe(w: Work): Step {
  const { s } = w
  for (let i = 0; i < s.length; i++) {
    const m = s[i]!
    if (popcount(m) !== 2) continue
    let rest = m
    while (rest) {
      const low = rest & -rest
      rest &= ~low
      const trial = s.slice()
      trial[i] = low
      if (runTo(workAfter(w, trial, i), RANK.lines, null) === 'broken') {
        narrow(w, i, ~low)
        return 'changed'
      }
    }
  }
  return 'same'
}

/** The pencil lists a grid starts with: every number everywhere. */
export const gnStartState = (p: GnPuzzle): Uint16Array => new Uint16Array(p.size * p.size).fill(geometry(p).full)

/**
 * Carries on solving from pencil lists already made (sound for any lists the
 * grid's own rules lead to), with the level's steps only. True when every
 * square is known.
 */
export function gnAdvance(p: GnPuzzle, s: Uint16Array, rules: GnRules, tally: GnTally): boolean {
  const w = startWork(geometry(p), s)
  const rank = RANK[rules]
  for (;;) {
    if (runTo(w, Math.min(rank, RANK.lines), tally) === 'broken') return false
    if (isDone(s)) return true
    if (rank < RANK.probe) return false
    if (probe(w) === 'same') return false
    tally.probe++
  }
}

/**
 * Solves the grid with the level's steps only. `solved` is true only when
 * every square is decided and the rules hold, which — every step being sound
 * — also proves it is the only answer.
 */
export function solveGn(p: GnPuzzle, rules: GnRules): GnSolveResult {
  const s = gnStartState(p)
  const tally: GnTally = { basic: 0, lines: 0, probe: 0 }
  const finished = gnAdvance(p, s, rules, tally)
  const values = Array.from(s, (m) => (m && !(m & (m - 1)) ? only(m) : 0))
  let open = 0
  for (const m of s) open += Math.max(0, popcount(m) - 1)
  return { solved: finished && isGnSolution(p, values), values, masks: s, tally, open }
}

/**
 * The grid's answers by plain search, up to `limit` of them — the tests'
 * independent check on the solver. Square by square in reading order, each
 * taking a number not yet in its row or column; a box is checked the moment
 * its last square is filled.
 */
export function gnSolutions(p: GnPuzzle, limit = 2): number[][] {
  const n = p.size
  const g = geometry(p)
  const values = new Array<number>(n * n).fill(0)
  const rows = new Array<number>(n).fill(0)
  const cols = new Array<number>(n).fill(0)
  const lastOf = g.cages.map((c) => Math.max(...c.cells))
  const out: number[][] = []
  const walk = (i: number) => {
    if (out.length >= limit) return
    if (i === n * n) {
      out.push([...values])
      return
    }
    const r = Math.floor(i / n)
    const c = i % n
    const ci = g.cageOf[i]!
    const cage = g.cages[ci]!
    for (let v = 1; v <= n; v++) {
      if ((rows[r]! | cols[c]!) & bit(v)) continue
      values[i] = v
      if (lastOf[ci] === i && !gnCageHolds(cage.op, cage.target, cage.cells.map((j) => values[j]!))) continue
      rows[r]! |= bit(v)
      cols[c]! |= bit(v)
      walk(i + 1)
      rows[r]! &= ~bit(v)
      cols[c]! &= ~bit(v)
    }
    values[i] = 0
  }
  walk(0)
  return out
}

/** How many answers the grid has, counted up to `limit`. */
export const countGnSolutions = (p: GnPuzzle, limit = 2) => gnSolutions(p, limit).length
