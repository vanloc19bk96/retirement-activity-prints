/**
 * Yard Sale (the shade-the-repeats number grid known in puzzle books as
 * Hitori): the rules, and a reader's way of solving.
 *
 * A square grid of N × N squares holds a number in every square. The reader
 * shades some of the repeated numbers. A finished grid obeys:
 *
 * - no number shows twice in any row or column among the white squares;
 * - only a repeated number is shaded (one that shows more than once in its
 *   row or its column as printed);
 * - two shaded squares never touch side by side (corners may meet);
 * - the white squares all stay joined, side by side, in one piece.
 *
 * The solver works the way a reader does, one sure step at a time, and never
 * guesses. It keeps a pencil mark on every square (white, shaded, or not yet
 * known). Every step follows from the rules alone, so a grid the solver
 * finishes has exactly one answer. What it may use depends on the level:
 *
 * - `basic` — the first steps: a number that is not repeated stays white
 *   ("singles"); two alike with one square between keep the middle white
 *   ("sandwich"); two alike side by side leave every other one of that
 *   number in the line shaded ("pairs"); a white number shades its twins in
 *   its row and column ("repeats"); a shaded square's neighbours are white
 *   ("neighbours").
 * - `walls` — adds "never wall off": a square whose shading would cut the
 *   white squares in two stays white.
 * - `probe` — adds "what if": a square whose shading (or whose staying white)
 *   leads, by the earlier steps, straight to a broken rule takes the other.
 */

export interface YsPuzzle {
  /** Squares across and down. */
  size: number
  /** Flat (row × size + col): the number printed in every square, 1 to size. */
  numbers: readonly number[]
}

export type YsRules = 'basic' | 'walls' | 'probe'

const RANK: Record<YsRules, number> = { basic: 0, walls: 1, probe: 2 }

export const YS_WHITE = 0
export const YS_SHADED = 1
/** Pencil marks: not yet known, or the square's answer. */
export const UNKNOWN = -1

type Step = 'changed' | 'same' | 'broken'

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

interface Geometry {
  n: number
  /** Rows, then columns: each line's squares in order. */
  lines: number[][]
  /** Every square's side-by-side neighbours. */
  neighbours: number[][]
  /** Per square: the other squares of its row and column with the same number. */
  twins: number[][]
  /** Squares whose number shows once in its row and once in its column. */
  singles: number[]
  /** Squares between two alike in a line. */
  sandwiched: number[]
  /** Squares a pair of alike side by side in their line leaves shaded. */
  paired: number[]
  /** Working space the steps reuse, so solving a grid a thousand times allocates nothing. */
  scratch: {
    work: Int32Array
    disc: Int32Array
    low: Int32Array
    cut: Uint8Array
    stackAt: Int32Array
    stackParent: Int32Array
    stackNext: Int32Array
  }
}

const geometryCache = new WeakMap<YsPuzzle, Geometry>()

function geometry(p: YsPuzzle): Geometry {
  const cached = geometryCache.get(p)
  if (cached) return cached
  const n = p.size
  const lines: number[][] = []
  for (let r = 0; r < n; r++) lines.push(Array.from({ length: n }, (_, k) => r * n + k))
  for (let c = 0; c < n; c++) lines.push(Array.from({ length: n }, (_, k) => k * n + c))
  const neighbours = Array.from({ length: n * n }, (_, i) => {
    const r = Math.floor(i / n)
    const c = i % n
    const out: number[] = []
    if (r > 0) out.push(i - n)
    if (c > 0) out.push(i - 1)
    if (c + 1 < n) out.push(i + 1)
    if (r + 1 < n) out.push(i + n)
    return out
  })
  const twins: number[][] = Array.from({ length: n * n }, () => [])
  const sandwiched = new Set<number>()
  const paired = new Set<number>()
  for (const cells of lines) {
    for (let a = 0; a < cells.length; a++) {
      for (let b = 0; b < cells.length; b++) {
        if (a !== b && p.numbers[cells[a]!] === p.numbers[cells[b]!]) twins[cells[a]!]!.push(cells[b]!)
      }
      if (a >= 2 && p.numbers[cells[a]!] === p.numbers[cells[a - 2]!]) sandwiched.add(cells[a - 1]!)
      if (a >= 1 && p.numbers[cells[a]!] === p.numbers[cells[a - 1]!]) {
        for (let k = 0; k < cells.length; k++) {
          if (k !== a && k !== a - 1 && p.numbers[cells[k]!] === p.numbers[cells[a]!]) paired.add(cells[k]!)
        }
      }
    }
  }
  const singles = twins.flatMap((t, i) => (t.length === 0 ? [i] : []))
  const cells = n * n
  const scratch = {
    work: new Int32Array(cells),
    disc: new Int32Array(cells),
    low: new Int32Array(cells),
    cut: new Uint8Array(cells),
    stackAt: new Int32Array(cells),
    stackParent: new Int32Array(cells),
    stackNext: new Int32Array(cells),
  }
  const g = { n, lines, neighbours, twins, singles, sandwiched: [...sandwiched], paired: [...paired], scratch }
  geometryCache.set(p, g)
  return g
}

/* ------------------------------------------------------------------ *
 * The rules
 * ------------------------------------------------------------------ */

/** True when the grid is well formed: a size of at least 4 and a number from 1 to size in every square. */
export function ysWellFormed(p: YsPuzzle): boolean {
  const n = p.size
  if (!Number.isInteger(n) || n < 4 || p.numbers.length !== n * n) return false
  return p.numbers.every((v) => Number.isInteger(v) && v >= 1 && v <= n)
}

/** True when square i's number shows more than once in its row or its column as printed. */
export function ysRepeated(p: YsPuzzle, i: number): boolean {
  return geometry(p).twins[i]!.length > 0
}

/** True when the squares not shaded (`open` true) are all joined side by side, in one piece. */
export function ysJoined(n: number, open: ArrayLike<boolean>): boolean {
  let start = -1
  let total = 0
  for (let i = 0; i < n * n; i++) {
    if (!open[i]) continue
    total++
    if (start < 0) start = i
  }
  if (start < 0) return false
  const seen = new Uint8Array(n * n)
  const stack = [start]
  seen[start] = 1
  let reached = 0
  while (stack.length > 0) {
    const i = stack.pop()!
    reached++
    const r = Math.floor(i / n)
    const c = i % n
    for (const j of [r > 0 ? i - n : -1, c > 0 ? i - 1 : -1, c + 1 < n ? i + 1 : -1, r + 1 < n ? i + n : -1]) {
      if (j >= 0 && open[j] && !seen[j]) {
        seen[j] = 1
        stack.push(j)
      }
    }
  }
  return reached === total
}

/** True when the shading (1 shaded, 0 white, square by square) finishes the grid. */
export function isYsSolution(p: YsPuzzle, shade: ArrayLike<number>): boolean {
  const n = p.size
  if (shade.length !== n * n) return false
  const g = geometry(p)
  for (let i = 0; i < n * n; i++) {
    const v = shade[i]
    if (v !== YS_WHITE && v !== YS_SHADED) return false
    if (v === YS_SHADED) {
      if (g.twins[i]!.length === 0) return false
      if (g.neighbours[i]!.some((j) => shade[j] === YS_SHADED)) return false
    } else if (g.twins[i]!.some((j) => shade[j] === YS_WHITE)) return false
  }
  return ysJoined(n, Array.from(shade, (v) => v === YS_WHITE))
}

/** The shading as one comparable string: # shaded, o white, . not known. */
export const ysShadeText = (shade: ArrayLike<number>) => Array.from(shade, (v) => (v === YS_SHADED ? '#' : v === YS_WHITE ? 'o' : '.')).join('')

/* ------------------------------------------------------------------ *
 * The solver's steps
 * ------------------------------------------------------------------ */

export interface YsTally {
  basic: number
  walls: number
  probe: number
}

export interface YsSolveResult {
  solved: boolean
  /** Per square: -1 not known, 0 white, 1 shaded. */
  state: Int8Array
  /** How many times each kind of step moved the grid on. */
  tally: YsTally
  /** Squares left not known. */
  open: number
}

/** Writes an answer in a square; broken when the square already holds the other. */
function mark(s: Int8Array, i: number, v: number): Step {
  if (s[i] === v) return 'same'
  if (s[i] !== UNKNOWN) return 'broken'
  s[i] = v
  return 'changed'
}

/**
 * The first steps until nothing moves: singles, sandwiches and pairs (which
 * only read the printed numbers), repeats and neighbours. Also notices any
 * broken rule: two whites alike in a line, two shaded side by side.
 */
function runBasic(g: Geometry, s: Int8Array): Step {
  let any = false
  const put = (i: number, v: number): boolean => {
    const step = mark(s, i, v)
    if (step === 'broken') return false
    if (step === 'changed') any = true
    return true
  }
  for (const i of g.singles) if (!put(i, YS_WHITE)) return 'broken'
  for (const i of g.sandwiched) if (!put(i, YS_WHITE)) return 'broken'
  for (const i of g.paired) if (!put(i, YS_SHADED)) return 'broken'
  // Repeats and neighbours from every known square, then from each square they decide, until none is left.
  const work = g.scratch.work
  let size = 0
  for (let i = 0; i < s.length; i++) if (s[i] !== UNKNOWN) work[size++] = i
  while (size > 0) {
    const i = work[--size]!
    const white = s[i] === YS_WHITE
    for (const j of white ? g.twins[i]! : g.neighbours[i]!) {
      const step = mark(s, j, white ? YS_SHADED : YS_WHITE)
      if (step === 'broken') return 'broken'
      if (step === 'changed') {
        any = true
        work[size++] = j
      }
    }
  }
  return any ? 'changed' : 'same'
}

/**
 * "Never wall off": the squares not shaded must stay one piece, so a square
 * whose shading would cut them in two (a cut point of what is not shaded)
 * stays white. Broken when they are already cut in two.
 */
function runWalls(g: Geometry, s: Int8Array): Step {
  const n = g.n
  const total = n * n
  const { disc, low, cut } = g.scratch
  disc.fill(-1)
  cut.fill(0)
  let start = -1
  let open = 0
  for (let i = 0; i < total; i++) {
    if (s[i] === YS_SHADED) continue
    open++
    if (start < 0) start = i
  }
  if (start < 0) return 'broken'
  // Tarjan's cut points, without recursion: a stack of squares, each with its parent and the next neighbour to look at.
  const { stackAt, stackParent, stackNext } = g.scratch
  let time = 0
  let reached = 0
  let rootChildren = 0
  stackAt[0] = start
  stackParent[0] = -1
  stackNext[0] = 0
  let depth = 1
  disc[start] = low[start] = time++
  reached++
  while (depth > 0) {
    const top = depth - 1
    const u = stackAt[top]!
    const parent = stackParent[top]!
    const around = g.neighbours[u]!
    if (stackNext[top]! < around.length) {
      const v = around[stackNext[top]!++]!
      if (s[v] === YS_SHADED || v === parent) continue
      if (disc[v]! < 0) {
        disc[v] = low[v] = time++
        reached++
        stackAt[depth] = v
        stackParent[depth] = u
        stackNext[depth] = 0
        depth++
      } else low[u] = Math.min(low[u]!, disc[v]!)
      continue
    }
    depth--
    if (parent < 0) continue
    low[parent] = Math.min(low[parent]!, low[u]!)
    if (parent === start) rootChildren++
    else if (low[u]! >= disc[parent]!) cut[parent] = 1
  }
  if (reached !== open) return 'broken'
  if (rootChildren > 1) cut[start] = 1
  let any = false
  for (let i = 0; i < total; i++) {
    if (!cut[i]) continue
    const step = mark(s, i, YS_WHITE)
    if (step === 'broken') return 'broken'
    if (step === 'changed') any = true
  }
  return any ? 'changed' : 'same'
}

/** The steps up to and including `rank`, short of "what if", until nothing moves. */
function runTo(g: Geometry, s: Int8Array, rank: number, tally: YsTally | null): Step {
  let any = false
  for (;;) {
    const basic = runBasic(g, s)
    if (basic === 'broken') return 'broken'
    if (basic === 'changed') {
      any = true
      if (tally) tally.basic++
    }
    if (rank < RANK.walls) return any ? 'changed' : 'same'
    // Walls also notice a grid already cut in two, so they run even when every square is known.
    const walled = runWalls(g, s)
    if (walled === 'broken') return 'broken'
    if (walled === 'same') return any ? 'changed' : 'same'
    any = true
    if (tally) tally.walls++
  }
}

/**
 * "What if": the first open square (in reading order) where shading it, or
 * leaving it white, leads by the earlier steps to a broken rule takes the
 * other.
 */
function probe(g: Geometry, s: Int8Array): Step {
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== UNKNOWN) continue
    for (const v of [YS_SHADED, YS_WHITE]) {
      const trial = s.slice()
      trial[i] = v
      if (runTo(g, trial, RANK.walls, null) === 'broken') {
        s[i] = 1 - v
        return 'changed'
      }
    }
  }
  return 'same'
}

/** The pencil marks a grid starts with: nothing known. */
export const ysStartState = (p: YsPuzzle): Int8Array => new Int8Array(p.size * p.size).fill(UNKNOWN)

/**
 * Carries on solving from pencil marks already made (sound for any marks the
 * grid's own numbers lead to), with the level's steps only. True when every
 * square is known.
 */
export function ysAdvance(p: YsPuzzle, s: Int8Array, rules: YsRules, tally: YsTally): boolean {
  const g = geometry(p)
  const rank = RANK[rules]
  for (;;) {
    if (runTo(g, s, Math.min(rank, RANK.walls), tally) === 'broken') return false
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
export function solveYs(p: YsPuzzle, rules: YsRules): YsSolveResult {
  const s = ysStartState(p)
  const tally: YsTally = { basic: 0, walls: 0, probe: 0 }
  const finished = ysAdvance(p, s, rules, tally)
  let open = 0
  for (const v of s) if (v === UNKNOWN) open++
  return { solved: finished && isYsSolution(p, s), state: s, tally, open }
}

/**
 * The grid's answers by plain search, up to `limit` of them — the tests'
 * independent check on the solver. Square by square in reading order: a
 * square may be shaded only when its number repeats and the square above and
 * to its left are white; it may stay white only when no white twin sits
 * above it or to its left; the white squares are checked joined at the end.
 */
export function ysSolutions(p: YsPuzzle, limit = 2): Int8Array[] {
  const n = p.size
  const g = geometry(p)
  const s = new Int8Array(n * n).fill(UNKNOWN)
  const out: Int8Array[] = []
  const walk = (i: number) => {
    if (out.length >= limit) return
    if (i === n * n) {
      if (ysJoined(n, Array.from(s, (v) => v === YS_WHITE))) out.push(s.slice())
      return
    }
    const r = Math.floor(i / n)
    const c = i % n
    // Shaded.
    if (g.twins[i]!.length > 0 && !(r > 0 && s[i - n] === YS_SHADED) && !(c > 0 && s[i - 1] === YS_SHADED)) {
      s[i] = YS_SHADED
      walk(i + 1)
      s[i] = UNKNOWN
    }
    // White.
    if (!g.twins[i]!.some((j) => j < i && s[j] === YS_WHITE)) {
      s[i] = YS_WHITE
      walk(i + 1)
      s[i] = UNKNOWN
    }
  }
  walk(0)
  return out
}

/** How many answers the grid has, counted up to `limit`. */
export const countYsSolutions = (p: YsPuzzle, limit = 2) => ysSolutions(p, limit).length
