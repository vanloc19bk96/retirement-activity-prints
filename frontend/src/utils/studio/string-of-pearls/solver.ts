/**
 * String of Pearls (Masyu): the rules, and a reader's way of solving.
 *
 * A square board of N × N squares, some holding a white or a black pearl.
 * The reader threads one necklace: a single closed loop through the centres
 * of squares, running side to side between neighbours, never crossing or
 * touching itself (it visits a square at most once). A finished necklace
 * obeys:
 *
 * - it passes through every pearl;
 * - at a white pearl it runs straight through, and turns in the square just
 *   before or just after (or both);
 * - at a black pearl it turns, and runs straight through the next square on
 *   both sides.
 *
 * The solver works the way a reader does, one sure step at a time, and never
 * guesses. It marks every link between two neighbouring squares as thread,
 * as crossed (no thread here), or leaves it open. Every step follows from
 * the rules alone, so a board the solver finishes has exactly one necklace.
 * What it may use depends on the level:
 *
 * - `local` — the pearls and the squares: a square takes two threads or
 *   none (a pearl, always two); a white pearl runs straight and must turn
 *   next door; a black pearl turns and runs two squares straight each way;
 *   a finished necklace crosses off every link left.
 * - `loop` — adds "don't close it early": a link that would close a thread
 *   into a loop while other thread or pearls lie outside it is crossed off.
 * - `probe` — adds "what if": a link where thread (or no thread) leads, by
 *   the `loop` steps, straight to a broken rule is decided the other way.
 */

/** A square with no pearl. */
export const PEARL_NONE = 0
export const PEARL_WHITE = 1
export const PEARL_BLACK = 2

export interface PearlPuzzle {
  /** Squares across and down. */
  size: number
  /** Every square in reading order: PEARL_NONE, PEARL_WHITE or PEARL_BLACK. */
  cells: readonly number[]
}

export type PearlRules = 'local' | 'loop' | 'probe'

const RANK: Record<PearlRules, number> = { local: 0, loop: 1, probe: 2 }

export const isPearl = (value: number) => value === PEARL_WHITE || value === PEARL_BLACK

/** True when the board is well formed: every square empty, a white pearl or a black pearl. */
export function pearlWellFormed(p: PearlPuzzle): boolean {
  const n = p.size
  if (!Number.isInteger(n) || n < 3 || p.cells.length !== n * n) return false
  return p.cells.every((v) => v === PEARL_NONE || v === PEARL_WHITE || v === PEARL_BLACK)
}

/* ------------------------------------------------------------------ *
 * The board's links
 * ------------------------------------------------------------------ */

/** Up, right, down, left. */
export const PEARL_DIRS = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
] as const

const opposite = (d: number) => (d + 2) % 4

export interface PearlGeometry {
  n: number
  /** How many links the board has. */
  links: number
  /** Per square and direction: the link that way, or -1 at the edge. */
  linkOf: Int32Array
  /** Per square and direction: the square that way, or -1 at the edge. */
  step: Int32Array
  /** Per link: its two squares (the lower-numbered first). */
  ends: Int32Array
}

const geometryCache = new Map<number, PearlGeometry>()

/**
 * The links of an N × N board. Link `r·(n−1) + c` joins square (r, c) to
 * the square on its right; after all of those, link `n(n−1) + r·n + c`
 * joins (r, c) to the square below.
 */
export function pearlGeometry(n: number): PearlGeometry {
  const cached = geometryCache.get(n)
  if (cached) return cached
  const across = n * (n - 1)
  const links = 2 * across
  const linkOf = new Int32Array(n * n * 4).fill(-1)
  const step = new Int32Array(n * n * 4).fill(-1)
  const ends = new Int32Array(links * 2)
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c
      if (c < n - 1) {
        const e = r * (n - 1) + c
        linkOf[i * 4 + 1] = e
        linkOf[(i + 1) * 4 + 3] = e
        ends[e * 2] = i
        ends[e * 2 + 1] = i + 1
      }
      if (r < n - 1) {
        const e = across + r * n + c
        linkOf[i * 4 + 2] = e
        linkOf[(i + n) * 4] = e
        ends[e * 2] = i
        ends[e * 2 + 1] = i + n
      }
      PEARL_DIRS.forEach(([dr, dc], d) => {
        const rr = r + dr
        const cc = c + dc
        if (rr >= 0 && rr < n && cc >= 0 && cc < n) step[i * 4 + d] = rr * n + cc
      })
    }
  }
  const g = { n, links, linkOf, step, ends }
  geometryCache.set(n, g)
  return g
}

/** The link between two neighbouring squares, or -1. */
export function pearlLinkBetween(n: number, a: number, b: number): number {
  const g = pearlGeometry(n)
  for (let d = 0; d < 4; d++) if (g.step[a * 4 + d] === b) return g.linkOf[a * 4 + d]!
  return -1
}

/**
 * The squares a set of links threads, in order round the loop: from the
 * lowest-numbered square, first towards its lower-numbered neighbour on the
 * loop. Null unless the links make exactly one closed loop.
 */
export function pearlLoopOrder(n: number, links: readonly number[]): number[] | null {
  const g = pearlGeometry(n)
  if (links.length < 4) return null
  const on = new Uint8Array(g.links)
  for (const e of links) {
    if (!Number.isInteger(e) || e < 0 || e >= g.links || on[e]) return null
    on[e] = 1
  }
  const degree = new Uint8Array(n * n)
  for (const e of links) {
    degree[g.ends[e * 2]!]!++
    degree[g.ends[e * 2 + 1]!]!++
  }
  let start = -1
  for (let i = 0; i < n * n; i++) {
    if (degree[i] !== 0 && degree[i] !== 2) return null
    if (degree[i] === 2 && start < 0) start = i
  }
  const nextOf = (cell: number, prev: number) => {
    const out: number[] = []
    for (let d = 0; d < 4; d++) {
      const e = g.linkOf[cell * 4 + d]!
      if (e >= 0 && on[e]) out.push(g.step[cell * 4 + d]!)
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
    // A 2-long "loop" would step back; a loop needs at least four squares.
    if (next.length !== 1) return null
    prev = cur
    cur = next[0]!
    if (order.length > n * n) return null
  }
  return order.length === links.length ? order : null
}

/** A necklace as one comparable string. */
export const pearlAnswerKey = (links: readonly number[]) => [...links].sort((a, b) => a - b).join(',')

/** True when the links thread a finished necklace for the board. */
export function isPearlSolution(p: PearlPuzzle, links: readonly number[]): boolean {
  const n = p.size
  const g = pearlGeometry(n)
  const order = pearlLoopOrder(n, links)
  if (!order) return false
  const on = new Uint8Array(g.links)
  for (const e of links) on[e] = 1
  const thread = (cell: number, d: number) => {
    const e = g.linkOf[cell * 4 + d]!
    return e >= 0 && on[e] === 1
  }
  const visited = new Uint8Array(n * n)
  for (const i of order) visited[i] = 1
  for (let i = 0; i < n * n; i++) {
    const v = p.cells[i]!
    if (!isPearl(v)) continue
    if (!visited[i]) return false
    const straightH = thread(i, 1) && thread(i, 3)
    const straightV = thread(i, 0) && thread(i, 2)
    if (v === PEARL_WHITE) {
      if (!straightH && !straightV) return false
      const [d1, d2] = straightH ? [1, 3] : [0, 2]
      const q1 = g.step[i * 4 + d1]!
      const q2 = g.step[i * 4 + d2]!
      if (thread(q1, d1) && thread(q2, d2)) return false
    } else {
      if (straightH || straightV) return false
      for (let d = 0; d < 4; d++) {
        if (!thread(i, d)) continue
        if (!thread(g.step[i * 4 + d]!, d)) return false
      }
    }
  }
  return true
}

/* ------------------------------------------------------------------ *
 * The solver's pencil marks
 * ------------------------------------------------------------------ */

const OPEN = 0
const LINE = 1
const CROSS = 2

type Step = 'changed' | 'same' | 'broken'

export interface PearlTally {
  local: number
  loop: number
  probe: number
}

export interface PearlSolveResult {
  solved: boolean
  /** The links threaded, in order. */
  links: number[]
  /** Links still undecided. */
  open: number
  /** How many times each kind of step moved the board on. */
  tally: PearlTally
}

class Broken extends Error {}
const BROKEN = new Broken()

interface Ctx {
  p: PearlPuzzle
  g: PearlGeometry
  mark: Int8Array
  changed: boolean
}

/** A link's mark; the board's edge reads as crossed. */
const at = (x: Ctx, cell: number, d: number): number => {
  const e = x.g.linkOf[cell * 4 + d]!
  return e < 0 ? CROSS : x.mark[e]!
}

function setLink(x: Ctx, cell: number, d: number, to: number): void {
  const e = x.g.linkOf[cell * 4 + d]!
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

/** A square takes two threads or none; a pearl, always two. */
function squareStep(x: Ctx, i: number): void {
  let lines = 0
  let open = 0
  for (let d = 0; d < 4; d++) {
    const m = at(x, i, d)
    if (m === LINE) lines++
    else if (m === OPEN) open++
  }
  if (lines > 2) throw BROKEN
  if (open === 0) {
    if (lines === 1 || (lines === 0 && isPearl(x.p.cells[i]!))) throw BROKEN
    return
  }
  if (lines === 2) {
    for (let d = 0; d < 4; d++) if (at(x, i, d) === OPEN) setLink(x, i, d, CROSS)
  } else if (lines === 1) {
    if (open === 1) for (let d = 0; d < 4; d++) if (at(x, i, d) === OPEN) setLink(x, i, d, LINE)
  } else if (isPearl(x.p.cells[i]!)) {
    if (open < 2) throw BROKEN
    if (open === 2) for (let d = 0; d < 4; d++) if (at(x, i, d) === OPEN) setLink(x, i, d, LINE)
  } else if (open === 1) {
    for (let d = 0; d < 4; d++) if (at(x, i, d) === OPEN) setLink(x, i, d, CROSS)
  }
}

/** A white pearl: straight through, and a turn in the square before or after. */
function whiteStep(x: Ctx, i: number): void {
  const { g } = x
  for (const [d1, d2] of [
    [1, 3],
    [0, 2],
  ] as const) {
    const a = at(x, i, d1)
    const b = at(x, i, d2)
    if ((a === LINE && b === CROSS) || (a === CROSS && b === LINE)) throw BROKEN
    if (a === LINE) setLink(x, i, d2, LINE)
    else if (b === LINE) setLink(x, i, d1, LINE)
    else if (a === CROSS) setLink(x, i, d2, CROSS)
    else if (b === CROSS) setLink(x, i, d1, CROSS)
    if (at(x, i, d1) === CROSS) continue
    // Both sides of the pearl exist here (an edge would have crossed the pair).
    const q1 = g.step[i * 4 + d1]!
    const q2 = g.step[i * 4 + d2]!
    const on1 = at(x, q1, d1) === LINE
    const on2 = at(x, q2, d2) === LINE
    if (on1 && on2) {
      // Straight on both sides: this way through breaks the turn.
      setLink(x, i, d1, CROSS)
      setLink(x, i, d2, CROSS)
    } else if (at(x, i, d1) === LINE) {
      if (on1) setLink(x, q2, d2, CROSS)
      if (on2) setLink(x, q1, d1, CROSS)
    }
  }
}

/** A black pearl: a turn, and two squares straight each way out. */
function blackStep(x: Ctx, i: number): void {
  const { g } = x
  for (let d = 0; d < 4; d++) {
    if (at(x, i, d) === CROSS) continue
    const q = g.step[i * 4 + d]!
    const side1 = (d + 1) % 4
    const side2 = (d + 3) % 4
    // Out through `q` the thread must run straight on: not past the edge, not into a turn, not through a black pearl (which must turn).
    const blocked = q < 0 || x.p.cells[q] === PEARL_BLACK || at(x, q, d) === CROSS || at(x, q, side1) === LINE || at(x, q, side2) === LINE
    if (blocked) {
      setLink(x, i, d, CROSS)
      continue
    }
    if (at(x, i, d) === LINE) {
      setLink(x, q, d, LINE)
      setLink(x, i, opposite(d), CROSS)
      setLink(x, q, side1, CROSS)
      setLink(x, q, side2, CROSS)
    }
  }
  // One thread across and one up or down.
  for (const [d1, d2] of [
    [1, 3],
    [0, 2],
  ] as const) {
    const a = at(x, i, d1)
    const b = at(x, i, d2)
    if (a === CROSS && b === CROSS) throw BROKEN
    if (a === CROSS) setLink(x, i, d2, LINE)
    else if (b === CROSS) setLink(x, i, d1, LINE)
  }
}

/**
 * The threads as paths: per square on a path, the path's id; per path end,
 * the square at its other end. A closed loop that is not everything breaks
 * the board; a closed loop that is everything crosses off every open link.
 * With `early` (the `loop` step), a link joining a path's two ends is
 * crossed off unless closing it would thread every line and every pearl.
 */
function loopStep(x: Ctx, early: boolean): void {
  const { g, p } = x
  const n = g.n
  const cells = n * n
  const pathOf = new Int32Array(cells).fill(-1)
  const other = new Int32Array(cells).fill(-1)
  const lengths: number[] = []
  let totalLines = 0
  for (let e = 0; e < g.links; e++) if (x.mark[e] === LINE) totalLines++
  if (totalLines === 0) return
  const lineDirs = (i: number) => {
    const out: number[] = []
    for (let d = 0; d < 4; d++) if (at(x, i, d) === LINE) out.push(d)
    return out
  }
  // A square with three threads is already broken (and would send the walks astray).
  for (let i = 0; i < cells; i++) if (lineDirs(i).length > 2) throw BROKEN
  // Open paths, walked from one end.
  for (let i = 0; i < cells; i++) {
    if (pathOf[i]! >= 0) continue
    const dirs = lineDirs(i)
    if (dirs.length !== 1) continue
    const id = lengths.length
    let prev = -1
    let cur = i
    let length = 0
    for (;;) {
      pathOf[cur] = id
      const next = lineDirs(cur)
        .map((d) => g.step[cur * 4 + d]!)
        .filter((j) => j !== prev)
      if (next.length === 0) break
      prev = cur
      cur = next[0]!
      length++
    }
    other[i] = cur
    other[cur] = i
    lengths.push(length)
  }
  // Closed loops: a square with two threads not on any open path.
  for (let i = 0; i < cells; i++) {
    if (pathOf[i]! >= 0 || lineDirs(i).length !== 2) continue
    const id = lengths.length
    let prev = -1
    let cur = i
    let length = 0
    do {
      pathOf[cur] = id
      const next = lineDirs(cur)
        .map((d) => g.step[cur * 4 + d]!)
        .filter((j) => j !== prev)
      prev = cur
      cur = next[0]!
      length++
    } while (cur !== i)
    lengths.push(length)
    const pearlOutside = p.cells.some((v, k) => isPearl(v) && pathOf[k] !== id)
    if (length !== totalLines || pearlOutside) throw BROKEN
    // The necklace is done: nothing else may be threaded.
    for (let e = 0; e < g.links; e++) {
      if (x.mark[e] === OPEN) {
        x.mark[e] = CROSS
        x.changed = true
      }
    }
    return
  }
  if (!early) return
  for (let a = 0; a < cells; a++) {
    const b = other[a]!
    if (b < a) continue
    for (let d = 0; d < 4; d++) {
      if (g.step[a * 4 + d] !== b || at(x, a, d) !== OPEN) continue
      const id = pathOf[a]!
      const everything = lengths[id]! === totalLines && !p.cells.some((v, k) => isPearl(v) && pathOf[k] !== id)
      if (!everything) setLink(x, a, d, CROSS)
    }
  }
}

/** The pearls and squares, then (at `loop` and up) the early-close rule, until nothing moves. */
function propagate(x: Ctx, rank: number, tally?: PearlTally): Step {
  const { p } = x
  const n = p.size
  let any = false
  try {
    for (;;) {
      x.changed = false
      for (let i = 0; i < n * n; i++) {
        const v = p.cells[i]!
        if (v === PEARL_WHITE) whiteStep(x, i)
        else if (v === PEARL_BLACK) blackStep(x, i)
        squareStep(x, i)
      }
      loopStep(x, false)
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

/** True when a square is where a reader looks first: a pearl, or the loose end of a thread. */
function lively(x: Ctx, i: number): boolean {
  if (isPearl(x.p.cells[i]!)) return true
  let lines = 0
  for (let d = 0; d < 4; d++) if (at(x, i, d) === LINE) lines++
  return lines === 1
}

/**
 * "What if": the next open link (from `from`, round the board) at a pearl
 * or a loose thread end where thread, or no thread, leads by the `loop`
 * steps to a broken rule is decided the other way. Returns the link
 * decided, or -1.
 */
function probe(x: Ctx, from: number): number {
  const total = x.g.links
  for (let k = 0; k < total; k++) {
    const e = (from + k) % total
    if (x.mark[e] !== OPEN) continue
    if (!lively(x, x.g.ends[e * 2]!) && !lively(x, x.g.ends[e * 2 + 1]!)) continue
    for (const guess of [LINE, CROSS]) {
      const trial: Ctx = { ...x, mark: x.mark.slice(), changed: false }
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
 * Solves the board with the level's steps only. `solved` is true only when
 * every link is decided and the threads make a finished necklace, which —
 * every step being sound — also proves it is the only one.
 */
export function solvePearl(p: PearlPuzzle, rules: PearlRules): PearlSolveResult {
  const g = pearlGeometry(p.size)
  const x: Ctx = { p, g, mark: new Int8Array(g.links), changed: false }
  const tally: PearlTally = { local: 0, loop: 0, probe: 0 }
  const rank = RANK[rules]
  const result = (): PearlSolveResult => {
    const links: number[] = []
    let open = 0
    for (let e = 0; e < g.links; e++) {
      if (x.mark[e] === LINE) links.push(e)
      else if (x.mark[e] === OPEN) open++
    }
    return { solved: open === 0 && isPearlSolution(p, links), links, open, tally }
  }
  // Where the next "what if" starts: just past the last one, so the reader works round the board.
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
 * The board's necklaces by plain search, up to `limit` of them, each as its
 * links in order — the tests' independent check on the solver. Squares are
 * taken in reading order, each deciding its links right and down; a square
 * must end with two threads or none (a pearl, two), a pearl is checked as
 * soon as every link round it and its neighbours is decided, and the first
 * loop to close must be the whole necklace.
 */
export function pearlSolutions(p: PearlPuzzle, limit = 2): number[][] {
  const n = p.size
  const g = pearlGeometry(n)
  const cells = n * n
  const on = new Uint8Array(g.links)
  const out: number[][] = []
  // A pearl is judged once the last link it depends on has been decided.
  const owner = (e: number) => g.ends[e * 2]!
  const readyAt = new Map<number, number[]>()
  for (let i = 0; i < cells; i++) {
    if (!isPearl(p.cells[i]!)) continue
    let ready = 0
    for (const s of [i, ...[0, 1, 2, 3].map((d) => g.step[i * 4 + d]!).filter((s) => s >= 0)]) {
      for (let d = 0; d < 4; d++) {
        const e = g.linkOf[s * 4 + d]!
        if (e >= 0) ready = Math.max(ready, owner(e))
      }
    }
    readyAt.set(ready, [...(readyAt.get(ready) ?? []), i])
  }
  const thread = (cell: number, d: number) => {
    const e = g.linkOf[cell * 4 + d]!
    return e >= 0 && on[e] === 1
  }
  const pearlOk = (i: number) => {
    const straightH = thread(i, 1) && thread(i, 3)
    const straightV = thread(i, 0) && thread(i, 2)
    if (p.cells[i] === PEARL_WHITE) {
      if (!straightH && !straightV) return false
      const [d1, d2] = straightH ? [1, 3] : [0, 2]
      return !(thread(g.step[i * 4 + d1]!, d1) && thread(g.step[i * 4 + d2]!, d2))
    }
    if (straightH || straightV) return false
    for (let d = 0; d < 4; d++) if (thread(i, d) && !thread(g.step[i * 4 + d]!, d)) return false
    return true
  }
  const degree = (i: number) => {
    let k = 0
    for (let d = 0; d < 4; d++) if (thread(i, d)) k++
    return k
  }
  /** The loop through square `i`, when its threads close one; its length, or 0. */
  const closedAt = (i: number) => {
    if (degree(i) !== 2) return 0
    let prev = i
    let cur = -1
    for (let d = 0; d < 4 && cur < 0; d++) if (thread(i, d)) cur = g.step[i * 4 + d]!
    let length = 1
    while (cur !== i) {
      let next = -1
      for (let d = 0; d < 4; d++) {
        const j = g.step[cur * 4 + d]!
        if (thread(cur, d) && j !== prev) next = j
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
    if (out.length >= limit || i >= cells) return
    const right = g.linkOf[i * 4 + 1]!
    const down = g.linkOf[i * 4 + 2]!
    for (const r of right >= 0 ? [0, 1] : [0]) {
      for (const dn of down >= 0 ? [0, 1] : [0]) {
        if (out.length >= limit) return
        if (r) on[right] = 1
        if (dn) on[down] = 1
        lines += r + dn
        const deg = degree(i)
        const ok = (deg === 0 && !isPearl(p.cells[i]!)) || deg === 2
        if (ok && (readyAt.get(i) ?? []).every(pearlOk)) {
          const loop = r || dn ? closedAt(i) : 0
          if (loop > 0) {
            // The first loop closed: it must be the whole necklace.
            const links: number[] = []
            for (let e = 0; e < g.links; e++) if (on[e]) links.push(e)
            if (loop === lines && isPearlSolution(p, links)) out.push(links)
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

/** How many necklaces the board has, counted up to `limit`. */
export const countPearlSolutions = (p: PearlPuzzle, limit = 2) => pearlSolutions(p, limit).length
