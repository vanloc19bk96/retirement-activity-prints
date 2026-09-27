/**
 * Skyline Tour (Skyscrapers, also called Towers): the rules, and a reader's
 * way of solving.
 *
 * A square city of N × N plots. Every plot holds one building, 1 to N
 * floors tall, and every row and every column holds each height exactly
 * once. Round the city stand the clues: a number beside a row or a column
 * is how many buildings a visitor standing there sees, looking along it —
 * a taller building hides every shorter one behind it. A few plots may be
 * given. A finished city obeys:
 *
 * - every plot holds a height 1 to N, each once in its row and its column;
 * - every clue counts exactly the buildings seen from it;
 * - every given plot holds its given height.
 *
 * The solver works the way a reader does, one sure step at a time, and never
 * guesses. It keeps each plot's pencil marks (the heights still possible
 * there) and crosses them off. Every step follows from the rules alone, so a
 * city the solver finishes has exactly one answer. What it may use depends
 * on the level:
 *
 * - `basic` — the first things a reader learns: the tallest building stands
 *   beside a 1, a clue of N sees the heights climbing 1, 2, 3…, and a clue
 *   of k leaves no room near it for the tallest few (the "edge" count); a
 *   plot with one height left takes it, and a height with one plot left in
 *   its row or column goes there; and a row or column with only two plots
 *   left open is tried both ways round against its clues.
 * - `line` — adds "try the orders": every order a row or column could still
 *   take is tried against its clues (a line with no clue, against its
 *   pencil marks alone), and a height no order puts on a plot is crossed
 *   off there.
 * - `probe` — adds "what if": on a plot with two heights left, or for a
 *   height with two plots left in its row or column, a choice that leads,
 *   by the Classic steps, straight to a broken rule is crossed off.
 */

export interface SkyPuzzle {
  /** Plots across and down. */
  size: number
  /**
   * The clues, 4N of them: along the top (left to right), down the right
   * side (top to bottom), along the bottom (left to right), down the left
   * side (top to bottom). 0 where no clue stands.
   */
  clues: readonly number[]
  /** Every plot in reading order: its given height, or 0. */
  givens: readonly number[]
}

export type SkyRules = 'basic' | 'line' | 'probe'

const RANK: Record<SkyRules, number> = { basic: 0, line: 1, probe: 2 }

export type SkySide = 'top' | 'right' | 'bottom' | 'left'
export const SKY_SIDES: readonly SkySide[] = ['top', 'right', 'bottom', 'left']

/** Which side clue `k` stands on, and its place along that side. */
export function skyClueSide(n: number, k: number): { side: SkySide; along: number } {
  return { side: SKY_SIDES[Math.floor(k / n)]!, along: k % n }
}

/** The plots clue `k` looks along, nearest first. */
export function skyClueCells(n: number, k: number): number[] {
  const { side, along: j } = skyClueSide(n, k)
  return Array.from({ length: n }, (_, d) => {
    if (side === 'top') return d * n + j
    if (side === 'right') return j * n + (n - 1 - d)
    if (side === 'bottom') return (n - 1 - d) * n + j
    return j * n + d
  })
}

/** How many buildings are seen looking along `heights`, nearest first. */
export function skySeen(heights: readonly number[]): number {
  let tallest = 0
  let seen = 0
  for (const h of heights) {
    if (h > tallest) {
      tallest = h
      seen++
    }
  }
  return seen
}

/** Every clue a finished city shows, in clue order. */
export function skyCluesFor(n: number, grid: readonly number[]): number[] {
  return Array.from({ length: 4 * n }, (_, k) => skySeen(skyClueCells(n, k).map((i) => grid[i]!)))
}

/** True when the city is well formed: its size, 4N clues of 0–N, and givens of 0–N. */
export function skyWellFormed(p: SkyPuzzle): boolean {
  const n = p.size
  if (!Number.isInteger(n) || n < 3 || n > 9) return false
  if (p.clues.length !== 4 * n || p.givens.length !== n * n) return false
  const ok = (v: number) => Number.isInteger(v) && v >= 0 && v <= n
  return p.clues.every(ok) && p.givens.every(ok)
}

/** True when `grid` is a finished city for the clues and givens. */
export function isSkySolution(p: SkyPuzzle, grid: readonly number[]): boolean {
  const n = p.size
  if (grid.length !== n * n) return false
  if (grid.some((v) => !Number.isInteger(v) || v < 1 || v > n)) return false
  for (let a = 0; a < n; a++) {
    const row = new Set<number>()
    const col = new Set<number>()
    for (let b = 0; b < n; b++) {
      row.add(grid[a * n + b]!)
      col.add(grid[b * n + a]!)
    }
    if (row.size !== n || col.size !== n) return false
  }
  if (p.givens.some((v, i) => v > 0 && grid[i] !== v)) return false
  const seen = skyCluesFor(n, grid)
  return p.clues.every((c, k) => c === 0 || seen[k] === c)
}

/** A whole answer as one comparable string. */
export const skyAnswerKey = (grid: readonly number[]) => grid.join('')

/* ------------------------------------------------------------------ *
 * The city's lines
 * ------------------------------------------------------------------ */

interface Line {
  /** Plots in order from the start clue. */
  cells: number[]
  /** The clue at the start of the line, and at its end (0 for none). */
  start: number
  end: number
}

interface Geometry {
  n: number
  full: number
  /** Every row (left to right, left clue first) and every column (top to bottom, top clue first). */
  lines: Line[]
  /** Per plot: the two lines through it. */
  through: number[][]
}

const geometryCache = new WeakMap<SkyPuzzle, Geometry>()

function geometry(p: SkyPuzzle): Geometry {
  const cached = geometryCache.get(p)
  if (cached) return cached
  const n = p.size
  const lines: Line[] = []
  const through: number[][] = Array.from({ length: n * n }, () => [])
  for (let r = 0; r < n; r++) {
    lines.push({ cells: skyClueCells(n, 3 * n + r), start: p.clues[3 * n + r]!, end: p.clues[n + r]! })
  }
  for (let c = 0; c < n; c++) {
    lines.push({ cells: skyClueCells(n, c), start: p.clues[c]!, end: p.clues[2 * n + c]! })
  }
  lines.forEach((line, li) => line.cells.forEach((i) => through[i]!.push(li)))
  const g: Geometry = { n, full: (1 << n) - 1, lines, through }
  geometryCache.set(p, g)
  return g
}

/* ------------------------------------------------------------------ *
 * The solver's pencil marks
 * ------------------------------------------------------------------ */

type Step = 'changed' | 'same' | 'broken'

export interface SkyTally {
  basic: number
  line: number
  probe: number
}

export interface SkySolveResult {
  solved: boolean
  /** Every plot's height where decided, 0 where not, in reading order. */
  grid: number[]
  /** Plots still undecided. */
  open: number
  /** How many times each kind of step moved the city on. */
  tally: SkyTally
}

const bit = (v: number) => 1 << (v - 1)
const single = (mask: number) => mask !== 0 && (mask & (mask - 1)) === 0
const heightOf = (mask: number) => 31 - Math.clz32(mask) + 1
const count = (mask: number) => {
  let k = 0
  for (let m = mask; m; m &= m - 1) k++
  return k
}

/** Crosses off the heights outside `keep` at plot `i`; a plot with nothing left is a broken rule. */
function keepOnly(s: Uint16Array, i: number, keep: number): Step {
  const next = s[i]! & keep
  if (next === s[i]) return 'same'
  if (next === 0) return 'broken'
  s[i] = next
  return 'changed'
}

/**
 * The edge count: a clue of k sees k buildings, so the plot d steps from it
 * (0 nearest) can be no taller than N − k + 1 + d. A 1 puts the tallest
 * beside it; a clue of N sets the heights climbing.
 */
function edges(p: SkyPuzzle, g: Geometry, s: Uint16Array): Step {
  const n = g.n
  let any = false
  for (let k = 0; k < 4 * n; k++) {
    const clue = p.clues[k]!
    if (clue === 0) continue
    const cells = skyClueCells(n, k)
    for (let d = 0; d < n; d++) {
      const most = n - clue + 1 + d
      if (most >= n) break
      const step = keepOnly(s, cells[d]!, (1 << most) - 1)
      if (step === 'broken') return 'broken'
      if (step === 'changed') any = true
    }
    // A 1 sees only the tallest: it stands right beside the clue.
    if (clue === 1) {
      const step = keepOnly(s, cells[0]!, bit(n))
      if (step === 'broken') return 'broken'
      if (step === 'changed') any = true
    }
  }
  return any ? 'changed' : 'same'
}

/**
 * Singles until nothing moves: a decided plot crosses its height off the
 * rest of its row and column; a height with one plot left in a line goes
 * there.
 */
function singles(g: Geometry, s: Uint16Array): Step {
  let any = false
  for (let again = true; again; ) {
    again = false
    for (const line of g.lines) {
      let placed = 0
      for (const i of line.cells) {
        const m = s[i]!
        if (!single(m)) continue
        if (placed & m) return 'broken'
        placed |= m
      }
      if (placed) {
        for (const i of line.cells) {
          const m = s[i]!
          if (single(m) || !(m & placed)) continue
          const next = m & ~placed
          if (next === 0) return 'broken'
          s[i] = next
          again = true
        }
      }
      for (let v = 1; v <= g.n; v++) {
        const b = bit(v)
        let where = -1
        let places = 0
        for (const i of line.cells) {
          if (s[i]! & b) {
            places++
            where = i
          }
        }
        if (places === 0) return 'broken'
        if (places === 1 && s[where] !== b) {
          s[where] = b
          again = true
        }
      }
    }
    if (again) any = true
  }
  return any ? 'changed' : 'same'
}

/**
 * Orders already worked out, by a line's clues and pencil marks — all they
 * depend on. A "what if", and a city rebuilt clue by clue, meet the same
 * lines again and again.
 */
const orderMemo = new Map<string, number[] | null>()
const MEMO_LIMIT = 50_000

/**
 * Every order the line could still take, tried against its clues: the
 * heights some order puts on each plot. Null when no order fits.
 */
function lineOrders(g: Geometry, s: Uint16Array, line: Line): number[] | null {
  const n = g.n
  const cells = line.cells
  const allowed = new Array<number>(n).fill(0)
  const path = new Array<number>(n).fill(0)
  let found = false
  const walk = (d: number, used: number, tallest: number, seen: number) => {
    if (line.start && seen > line.start) return
    if (d === n) {
      if (line.start && seen !== line.start) return
      if (line.end && skySeenBack(path) !== line.end) return
      found = true
      for (let k = 0; k < n; k++) allowed[k]! |= bit(path[k]!)
      return
    }
    // Buildings still to come that could be seen: at most the heights left taller than the tallest so far.
    if (line.start) {
      let taller = 0
      for (let v = tallest + 1; v <= n; v++) if (!(used & bit(v))) taller++
      if (seen + taller < line.start) return
    }
    for (let m = s[cells[d]!]! & ~used; m; m &= m - 1) {
      const low = m & -m
      const v = heightOf(low)
      path[d] = v
      walk(d + 1, used | low, Math.max(tallest, v), v > tallest ? seen + 1 : seen)
    }
  }
  walk(0, 0, 0, 0)
  return found ? allowed : null
}

function skySeenBack(path: readonly number[]): number {
  let tallest = 0
  let seen = 0
  for (let k = path.length - 1; k >= 0; k--) {
    if (path[k]! > tallest) {
      tallest = path[k]!
      seen++
    }
  }
  return seen
}

/**
 * The orders of every line with at most `most` plots open. A line without
 * a clue is tried too: its orders are the reader's pairs and triples (two
 * plots that can only hold 3 and 5 keep 3 and 5 off the rest of the line).
 */
function orders(g: Geometry, s: Uint16Array, most: number): Step {
  let any = false
  for (const line of g.lines) {
    const open = line.cells.filter((i) => !single(s[i]!)).length
    if (open === 0 || open > most) continue
    const key = `${g.n}:${line.start}:${line.end}:${line.cells.map((i) => s[i]).join(',')}`
    let allowed = orderMemo.get(key)
    if (allowed === undefined) {
      allowed = lineOrders(g, s, line)
      if (orderMemo.size >= MEMO_LIMIT) orderMemo.clear()
      orderMemo.set(key, allowed)
    }
    if (!allowed) return 'broken'
    for (let d = 0; d < g.n; d++) {
      const step = keepOnly(s, line.cells[d]!, allowed[d]!)
      if (step === 'broken') return 'broken'
      if (step === 'changed') any = true
    }
  }
  return any ? 'changed' : 'same'
}

/** The basic steps until nothing moves. */
function runBasic(g: Geometry, s: Uint16Array): Step {
  let any = false
  for (;;) {
    const a = singles(g, s)
    if (a === 'broken') return 'broken'
    const b = orders(g, s, 2)
    if (b === 'broken') return 'broken'
    if (a === 'same' && b === 'same') break
    any = true
  }
  return any ? 'changed' : 'same'
}

/** The Classic steps until nothing moves. */
function runLine(g: Geometry, s: Uint16Array): Step {
  let any = false
  for (;;) {
    const basic = runBasic(g, s)
    if (basic === 'broken') return 'broken'
    const line = orders(g, s, g.n)
    if (line === 'broken') return 'broken'
    if (basic === 'same' && line === 'same') break
    any = true
  }
  return any ? 'changed' : 'same'
}

/** True when setting plot `i` to the heights in `mask` leads, by the Classic steps, to a broken rule. */
function breaks(g: Geometry, s: Uint16Array, i: number, mask: number): boolean {
  const trial = s.slice()
  trial[i] = mask
  return runLine(g, trial) === 'broken'
}

/**
 * "What if", the way a reader tries it: on a plot with two heights left,
 * or for a height with two plots left in its row or column, one choice is
 * tried; when it leads by the Classic steps to a broken rule, the other is
 * the answer.
 */
function probe(g: Geometry, s: Uint16Array): Step {
  for (let i = 0; i < g.n * g.n; i++) {
    const m = s[i]!
    if (count(m) !== 2) continue
    for (let rest = m; rest; rest &= rest - 1) {
      const low = rest & -rest
      if (breaks(g, s, i, low)) {
        s[i] = m & ~low
        return 'changed'
      }
    }
  }
  for (const line of g.lines) {
    for (let v = 1; v <= g.n; v++) {
      const b = bit(v)
      const places = line.cells.filter((i) => s[i]! & b)
      if (places.length !== 2) continue
      for (const i of places) {
        if (breaks(g, s, i, b)) {
          s[i] = s[i]! & ~b
          return 'changed'
        }
      }
    }
  }
  return 'same'
}

/** The pencil marks a city starts from: every height everywhere, the givens in. */
function start(p: SkyPuzzle, g: Geometry): Uint16Array | null {
  const s = new Uint16Array(g.n * g.n).fill(g.full)
  for (let i = 0; i < g.n * g.n; i++) {
    const v = p.givens[i]!
    if (v > 0) s[i] = bit(v)
  }
  return edges(p, g, s) === 'broken' ? null : s
}

/**
 * Solves the city with the level's steps only. `solved` is true only when
 * every plot is decided and the heights make a finished city, which — every
 * step being sound — also proves it is the only answer.
 */
export function solveSky(p: SkyPuzzle, rules: SkyRules): SkySolveResult {
  const g = geometry(p)
  const n = g.n
  const tally: SkyTally = { basic: 0, line: 0, probe: 0 }
  const s = start(p, g)
  const result = (marks: Uint16Array | null, solved: boolean): SkySolveResult => {
    const grid = Array.from({ length: n * n }, (_, i) => (marks && single(marks[i]!) ? heightOf(marks[i]!) : 0))
    return { solved, grid, open: grid.filter((v) => v === 0).length, tally }
  }
  if (!s) return result(null, false)
  const rank = RANK[rules]
  for (;;) {
    const basic = runBasic(g, s)
    if (basic === 'broken') return result(s, false)
    if (basic === 'changed') tally.basic++
    if (s.every(single)) break
    if (rank >= RANK.line) {
      const line = orders(g, s, n)
      if (line === 'broken') return result(s, false)
      if (line === 'changed') {
        tally.line++
        continue
      }
    }
    if (rank >= RANK.probe && probe(g, s) === 'changed') {
      tally.probe++
      continue
    }
    return result(s, false)
  }
  const out = result(s, true)
  return { ...out, solved: isSkySolution(p, out.grid) }
}

/**
 * The city's answers by plain search, up to `limit` of them — the tests'
 * independent check on the solver. Plots fill in reading order with every
 * height their row and column still allow. A row or column part-way filled
 * from its left or top clue must not already see too many, nor have too few
 * heights left to see enough; a finished one is held to both its clues.
 */
export function skySolutions(p: SkyPuzzle, limit = 2): number[][] {
  const n = p.size
  const out: number[][] = []
  const grid = new Array<number>(n * n).fill(0)
  const rowUsed = new Array<number>(n).fill(0)
  const colUsed = new Array<number>(n).fill(0)
  /** Clue `k` against the first `filled` plots it looks along. */
  const clueOk = (k: number, filled: number) => {
    const clue = p.clues[k]!
    if (clue === 0) return true
    const heights = skyClueCells(n, k)
      .slice(0, filled)
      .map((i) => grid[i]!)
    const seen = skySeen(heights)
    if (filled === n) return seen === clue
    const tallest = Math.max(0, ...heights)
    return seen <= clue && seen + (n - tallest) >= clue
  }
  const walk = (i: number) => {
    if (out.length >= limit) return
    if (i === n * n) {
      out.push([...grid])
      return
    }
    const r = Math.floor(i / n)
    const c = i % n
    for (let v = 1; v <= n; v++) {
      const b = bit(v)
      if (rowUsed[r]! & b || colUsed[c]! & b) continue
      if (p.givens[i]! > 0 && p.givens[i] !== v) continue
      grid[i] = v
      rowUsed[r]! |= b
      colUsed[c]! |= b
      const rowDone = c === n - 1
      const colDone = r === n - 1
      const ok =
        clueOk(3 * n + r, c + 1) &&
        clueOk(c, r + 1) &&
        (!rowDone || clueOk(n + r, n)) &&
        (!colDone || clueOk(2 * n + c, n))
      if (ok) walk(i + 1)
      grid[i] = 0
      rowUsed[r]! &= ~b
      colUsed[c]! &= ~b
    }
  }
  walk(0)
  return out
}

/** How many answers the city has, counted up to `limit`. */
export const countSkySolutions = (p: SkyPuzzle, limit = 2) => skySolutions(p, limit).length
