/**
 * Train Tracks: the rules, and a reader's way of solving.
 *
 * A square board of N × N squares, a number beside every row and above
 * every column. One railway line enters the board through the side of an
 * edge square and leaves through the side of another. The reader lays it:
 * one track, square to square between neighbours, straight or turning,
 * never crossing or branching (it visits a square at most once). A finished
 * line obeys:
 *
 * - it runs from where it enters to where it leaves, all in one piece, and
 *   closes no loop;
 * - each row and column holds exactly as many track squares as its number;
 * - every piece of track printed on the board is part of it, as printed.
 *
 * The solver works the way a reader does, one sure step at a time, and never
 * guesses. It marks every square as track, empty or undecided, and every
 * link between two neighbouring squares as track, crossed (no track here)
 * or open. Every step follows from the rules alone, so a board the solver
 * finishes has exactly one line. What it may use depends on the level:
 *
 * - `local` — the squares and the numbers: a track square takes two links,
 *   an empty one none; a row or column whose number is reached is empty
 *   elsewhere, and one with just enough squares left is track in all of
 *   them; a finished line crosses off everything left.
 * - `loop` — adds "don't close it early": a link that would close a loop,
 *   or join the line end to end while track is still missing, is crossed.
 * - `probe` — adds "what if": a link or square where track (or none) leads,
 *   by the `loop` steps, straight to a broken rule is decided the other way.
 */

/** Up, right, down, left. */
export const TT_DIRS = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
] as const

export const ttOpposite = (d: number) => (d + 2) % 4

/** A piece of track, by the two sides of its square it joins. */
export type TtPiece = 'h' | 'v' | 'ne' | 'se' | 'sw' | 'nw'

export const TT_PIECE_DIRS: Readonly<Record<TtPiece, readonly [number, number]>> = {
  h: [1, 3],
  v: [0, 2],
  ne: [0, 1],
  se: [1, 2],
  sw: [2, 3],
  nw: [0, 3],
}

export const TT_PIECES = Object.keys(TT_PIECE_DIRS) as TtPiece[]

/** The piece joining two sides of a square. */
export function ttPieceOf(d1: number, d2: number): TtPiece {
  const [a, b] = d1 < d2 ? [d1, d2] : [d2, d1]
  const found = TT_PIECES.find((piece) => TT_PIECE_DIRS[piece][0] === a && TT_PIECE_DIRS[piece][1] === b)
  if (!found) throw new Error(`No piece joins sides ${d1} and ${d2}`)
  return found
}

/** Where the line crosses the board's edge: an edge square, and the side of it the line runs through. */
export interface TtPortal {
  at: number
  dir: number
}

/** A piece of track printed on the board. */
export interface TtGiven {
  at: number
  piece: TtPiece
}

export interface TtPuzzle {
  /** Squares across and down. */
  size: number
  /** Track squares in each row, top to bottom. */
  rows: readonly number[]
  /** Track squares in each column, left to right. */
  cols: readonly number[]
  /** Where the line enters and where it leaves. */
  portals: readonly [TtPortal, TtPortal]
  /** The pieces printed on the board (the two end squares always among them). */
  givens: readonly TtGiven[]
}

export type TtRules = 'local' | 'loop' | 'probe'

const RANK: Record<TtRules, number> = { local: 0, loop: 1, probe: 2 }

/* ------------------------------------------------------------------ *
 * The board's links
 * ------------------------------------------------------------------ */

export interface TtGeometry {
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

const geometryCache = new Map<number, TtGeometry>()

/**
 * The links of an N × N board. Link `r·(n−1) + c` joins square (r, c) to
 * the square on its right; after all of those, link `n(n−1) + r·n + c`
 * joins (r, c) to the square below.
 */
export function ttGeometry(n: number): TtGeometry {
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
      TT_DIRS.forEach(([dr, dc], d) => {
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

/** The side of square `a` that faces its neighbour `b`, or -1 when they are not neighbours. */
export function ttDirBetween(n: number, a: number, b: number): number {
  const g = ttGeometry(n)
  for (let d = 0; d < 4; d++) if (g.step[a * 4 + d] === b) return d
  return -1
}

/** True when a side of a square is on the board's edge. */
export const ttOnEdge = (n: number, at: number, dir: number) => ttGeometry(n).step[at * 4 + dir]! < 0

/* ------------------------------------------------------------------ *
 * A line, as the squares it runs through
 * ------------------------------------------------------------------ */

/** Every square's piece along a line, from where it enters to where it leaves. */
export function ttRoutePieces(n: number, route: readonly number[], portals: readonly [TtPortal, TtPortal]): Map<number, TtPiece> {
  const out = new Map<number, TtPiece>()
  const last = route.length - 1
  route.forEach((at, k) => {
    const inDir = k === 0 ? portals[0].dir : ttDirBetween(n, at, route[k - 1]!)
    const outDir = k === last ? portals[1].dir : ttDirBetween(n, at, route[k + 1]!)
    out.set(at, ttPieceOf(inDir, outDir))
  })
  return out
}

/** The row and column numbers a line makes. */
export function ttCounts(n: number, route: readonly number[]): { rows: number[]; cols: number[] } {
  const rows = new Array<number>(n).fill(0)
  const cols = new Array<number>(n).fill(0)
  for (const at of route) {
    rows[Math.floor(at / n)]!++
    cols[at % n]!++
  }
  return { rows, cols }
}

/** A line as one comparable string. */
export const ttRouteKey = (route: readonly number[]) => route.join('.')

/** How many times a line turns. */
export function ttTurns(n: number, route: readonly number[], portals: readonly [TtPortal, TtPortal]): number {
  let turns = 0
  for (const piece of ttRoutePieces(n, route, portals).values()) if (piece !== 'h' && piece !== 'v') turns++
  return turns
}

/**
 * True when a line answers the board: it enters and leaves where the board
 * says, runs neighbour to neighbour through each square once, matches every
 * number, and runs through every printed piece as printed.
 */
export function isTtSolution(p: TtPuzzle, route: readonly number[]): boolean {
  const n = p.size
  if (route.length < 1) return false
  const [entry, exit] = p.portals
  if (route[0] !== entry.at || route[route.length - 1] !== exit.at) return false
  if (!ttOnEdge(n, entry.at, entry.dir) || !ttOnEdge(n, exit.at, exit.dir)) return false
  if (route.length === 1 && entry.dir === exit.dir) return false
  const seen = new Set<number>()
  for (let k = 0; k < route.length; k++) {
    const at = route[k]!
    if (!Number.isInteger(at) || at < 0 || at >= n * n || seen.has(at)) return false
    seen.add(at)
    if (k > 0 && ttDirBetween(n, route[k - 1]!, at) < 0) return false
  }
  // The end squares cannot also leave through the sides the line enters or leaves by.
  if (route.length > 1 && (ttDirBetween(n, entry.at, route[1]!) === entry.dir || ttDirBetween(n, exit.at, route[route.length - 2]!) === exit.dir)) return false
  const { rows, cols } = ttCounts(n, route)
  for (let k = 0; k < n; k++) if (rows[k] !== p.rows[k] || cols[k] !== p.cols[k]) return false
  const pieces = ttRoutePieces(n, route, p.portals)
  return p.givens.every((g) => pieces.get(g.at) === g.piece)
}

/* ------------------------------------------------------------------ *
 * The solver
 * ------------------------------------------------------------------ */

const OPEN = 0
const LINE = 1
const CROSS = 2

/** A square's mark: undecided, track or empty. */
export const TT_OPEN = 0
export const TT_TRACK = 1
export const TT_EMPTY = 2

type Step = 'changed' | 'same' | 'broken'

export interface TtTally {
  local: number
  loop: number
  probe: number
}

export interface TtSolveResult {
  solved: boolean
  /** The line, from where it enters, as far as the solver has laid it. */
  route: number[]
  /** Squares the solver has not settled: undecided, or track with a link still open. */
  unsettled: number[]
  /** How many times each kind of step moved the board on. */
  tally: TtTally
}

class Broken extends Error {}
const BROKEN = new Broken()

interface Ctx {
  p: TtPuzzle
  g: TtGeometry
  mark: Int8Array
  cell: Int8Array
  /** Per square and direction: 1 where the line crosses the board's edge. */
  portal: Uint8Array
  /** Track squares in all: the sum of the row numbers. */
  total: number
  changed: boolean
}

/** A link's mark; the board's edge reads as crossed, except where the line enters or leaves. */
const at = (x: Ctx, cell: number, d: number): number => {
  const e = x.g.linkOf[cell * 4 + d]!
  if (e < 0) return x.portal[cell * 4 + d] ? LINE : CROSS
  return x.mark[e]!
}

function setLink(x: Ctx, cell: number, d: number, to: number): void {
  const e = x.g.linkOf[cell * 4 + d]!
  if (e < 0) {
    if ((to === LINE) !== (x.portal[cell * 4 + d] === 1)) throw BROKEN
    return
  }
  const now = x.mark[e]!
  if (now === to) return
  if (now !== OPEN) throw BROKEN
  x.mark[e] = to
  x.changed = true
}

function setCell(x: Ctx, i: number, to: number): void {
  const now = x.cell[i]!
  if (now === to) return
  if (now !== TT_OPEN) throw BROKEN
  x.cell[i] = to
  x.changed = true
}

/** A track square takes two links, an empty square none. */
function squareStep(x: Ctx, i: number): void {
  let lines = 0
  let open = 0
  for (let d = 0; d < 4; d++) {
    const m = at(x, i, d)
    if (m === LINE) lines++
    else if (m === OPEN) open++
  }
  if (lines > 2) throw BROKEN
  if (lines > 0) setCell(x, i, TT_TRACK)
  const state = x.cell[i]!
  if (state === TT_EMPTY) {
    for (let d = 0; d < 4; d++) if (at(x, i, d) === OPEN) setLink(x, i, d, CROSS)
  } else if (state === TT_TRACK) {
    if (lines + open < 2) throw BROKEN
    if (lines === 2) {
      for (let d = 0; d < 4; d++) if (at(x, i, d) === OPEN) setLink(x, i, d, CROSS)
    } else if (lines + open === 2) {
      for (let d = 0; d < 4; d++) if (at(x, i, d) === OPEN) setLink(x, i, d, LINE)
    }
  } else if (open < 2) {
    // No room for a track through here.
    setCell(x, i, TT_EMPTY)
    for (let d = 0; d < 4; d++) if (at(x, i, d) === OPEN) setLink(x, i, d, CROSS)
  }
}

/** A row or column whose number is reached is empty elsewhere; one with just enough squares left is track in all of them. */
function countStep(x: Ctx): void {
  const n = x.g.n
  for (let k = 0; k < n; k++) {
    for (const across of [true, false]) {
      const want = across ? x.p.rows[k]! : x.p.cols[k]!
      let track = 0
      let open = 0
      for (let j = 0; j < n; j++) {
        const s = x.cell[across ? k * n + j : j * n + k]!
        if (s === TT_TRACK) track++
        else if (s === TT_OPEN) open++
      }
      if (track > want || track + open < want) throw BROKEN
      if (open === 0) continue
      const to = track === want ? TT_EMPTY : track + open === want ? TT_TRACK : TT_OPEN
      if (to === TT_OPEN) continue
      for (let j = 0; j < n; j++) {
        const i = across ? k * n + j : j * n + k
        if (x.cell[i] === TT_OPEN) setCell(x, i, to)
      }
    }
  }
}

/**
 * The track laid so far, as pieces of line: per square on a piece, the
 * piece's id. A closed loop always breaks the board; a piece running from
 * where the line enters to where it leaves must be all the track there is,
 * and then everything else is crossed off. With `early` (the `loop` step),
 * a link joining two loose ends is crossed off when it would close a loop,
 * or join the line end to end while track is still missing.
 */
function loopStep(x: Ctx, early: boolean): void {
  const { g } = x
  const n = g.n
  const cells = n * n
  const pieceOf = new Int32Array(cells).fill(-1)
  const lengths: number[] = []
  const portalEnds: number[] = []
  const inner = (i: number) => {
    const out: number[] = []
    for (let d = 0; d < 4; d++) if (g.linkOf[i * 4 + d]! >= 0 && at(x, i, d) === LINE) out.push(d)
    return out
  }
  const portals = (i: number) => x.portal[i * 4]! + x.portal[i * 4 + 1]! + x.portal[i * 4 + 2]! + x.portal[i * 4 + 3]!
  const degree = (i: number) => inner(i).length + portals(i)
  for (let i = 0; i < cells; i++) if (degree(i) > 2) throw BROKEN
  // Open pieces, walked from one end.
  for (let i = 0; i < cells; i++) {
    if (pieceOf[i]! >= 0 || degree(i) === 0 || inner(i).length > 1) continue
    const id = lengths.length
    let prev = -1
    let cur = i
    let length = 0
    for (;;) {
      pieceOf[cur] = id
      length++
      const next = inner(cur)
        .map((d) => g.step[cur * 4 + d]!)
        .filter((j) => j !== prev)
      if (next.length === 0) break
      prev = cur
      cur = next[0]!
    }
    lengths.push(length)
    portalEnds.push(portals(i) + (cur !== i ? portals(cur) : 0))
  }
  // Closed loops: a square with two links on no open piece.
  for (let i = 0; i < cells; i++) if (pieceOf[i]! < 0 && inner(i).length === 2) throw BROKEN
  let trackCells = 0
  for (let i = 0; i < cells; i++) if (x.cell[i] === TT_TRACK || degree(i) > 0) trackCells++
  // A piece end to end across the board: the line is laid, or the board is broken.
  const whole = portalEnds.findIndex((k) => k === 2)
  if (whole >= 0) {
    if (lengths[whole] !== x.total || trackCells !== x.total) throw BROKEN
    for (let i = 0; i < cells; i++) {
      if (pieceOf[i] !== whole && x.cell[i] === TT_TRACK) throw BROKEN
      if (pieceOf[i] !== whole) setCell(x, i, TT_EMPTY)
    }
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
    if (degree(a) !== 1) continue
    for (let d = 0; d < 4; d++) {
      const b = g.step[a * 4 + d]!
      if (b < a || degree(b) !== 1 || at(x, a, d) !== OPEN) continue
      const pa = pieceOf[a]!
      const pb = pieceOf[b]!
      if (pa === pb) {
        setLink(x, a, d, CROSS)
        continue
      }
      if (portalEnds[pa]! + portalEnds[pb]! < 2) continue
      // Joining these two would lay the whole line: only if that is every track square.
      const joined = lengths[pa]! + lengths[pb]!
      if (joined !== x.total || trackCells !== joined) setLink(x, a, d, CROSS)
    }
  }
}

/** The squares and numbers, then (at `loop` and up) the early-close rule, until nothing moves. */
function propagate(x: Ctx, rank: number, tally?: TtTally): Step {
  const cells = x.g.n * x.g.n
  let any = false
  try {
    for (;;) {
      x.changed = false
      for (let i = 0; i < cells; i++) squareStep(x, i)
      countStep(x)
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

/** True when a square is where a reader looks first: the loose end of a piece of track. */
function lively(x: Ctx, i: number): boolean {
  let lines = 0
  for (let d = 0; d < 4; d++) if (at(x, i, d) === LINE) lines++
  return lines === 1
}

const trialOf = (x: Ctx): Ctx => ({ ...x, mark: x.mark.slice(), cell: x.cell.slice(), changed: false })

/**
 * "What if": the next open link at a loose end of track (from `from`, round
 * the board), then the next undecided square, where track or none leads by
 * the `loop` steps to a broken rule, is decided the other way. Returns
 * where to look next time, or -1 when nothing was decided.
 */
function probe(x: Ctx, from: number): number {
  const total = x.g.links
  for (let k = 0; k < total; k++) {
    const e = (from + k) % total
    if (x.mark[e] !== OPEN) continue
    if (!lively(x, x.g.ends[e * 2]!) && !lively(x, x.g.ends[e * 2 + 1]!)) continue
    for (const guess of [LINE, CROSS]) {
      const trial = trialOf(x)
      trial.mark[e] = guess
      if (propagate(trial, RANK.loop) === 'broken') {
        x.mark[e] = guess === LINE ? CROSS : LINE
        return e + 1
      }
    }
  }
  const cells = x.g.n * x.g.n
  for (let i = 0; i < cells; i++) {
    if (x.cell[i] !== TT_OPEN) continue
    for (const guess of [TT_TRACK, TT_EMPTY]) {
      const trial = trialOf(x)
      trial.cell[i] = guess
      if (propagate(trial, RANK.loop) === 'broken') {
        x.cell[i] = guess === TT_TRACK ? TT_EMPTY : TT_TRACK
        return from
      }
    }
  }
  return -1
}

/** The line as laid from where it enters, following track links until they stop. */
function laidRoute(x: Ctx): number[] {
  const { g, p } = x
  const route: number[] = []
  const seen = new Set<number>()
  let prev = -1
  let cur = p.portals[0].at
  while (cur >= 0 && !seen.has(cur)) {
    route.push(cur)
    seen.add(cur)
    let next = -1
    for (let d = 0; d < 4; d++) {
      const j = g.step[cur * 4 + d]!
      if (j >= 0 && j !== prev && at(x, cur, d) === LINE) next = j
    }
    prev = cur
    cur = next
  }
  return route
}

/**
 * Solves the board with the level's steps only. `solved` is true only when
 * every square and link is decided and the track makes a finished line,
 * which — every step being sound — also proves it is the only one.
 */
export function solveTt(p: TtPuzzle, rules: TtRules): TtSolveResult {
  const n = p.size
  const g = ttGeometry(n)
  const cells = n * n
  const x: Ctx = {
    p,
    g,
    mark: new Int8Array(g.links),
    cell: new Int8Array(cells),
    portal: new Uint8Array(cells * 4),
    total: p.rows.reduce((a, b) => a + b, 0),
    changed: false,
  }
  const tally: TtTally = { local: 0, loop: 0, probe: 0 }
  const rank = RANK[rules]
  const result = (solvedSoFar: boolean): TtSolveResult => {
    const unsettled: number[] = []
    for (let i = 0; i < cells; i++) {
      if (x.cell[i] === TT_OPEN) unsettled.push(i)
      else if (x.cell[i] === TT_TRACK) {
        for (let d = 0; d < 4; d++) {
          if (at(x, i, d) === OPEN) {
            unsettled.push(i)
            break
          }
        }
      }
    }
    const route = laidRoute(x)
    const done = solvedSoFar && unsettled.length === 0 && !x.mark.includes(OPEN) && isTtSolution(p, route)
    return { solved: done, route, unsettled, tally }
  }
  const sumCols = p.cols.reduce((a, b) => a + b, 0)
  if (p.rows.length !== n || p.cols.length !== n || sumCols !== x.total) return result(false)
  for (const portal of p.portals) {
    if (!ttOnEdge(n, portal.at, portal.dir)) return result(false)
    x.portal[portal.at * 4 + portal.dir] = 1
  }
  try {
    for (const given of p.givens) {
      setCell(x, given.at, TT_TRACK)
      const dirs = TT_PIECE_DIRS[given.piece]
      for (let d = 0; d < 4; d++) setLink(x, given.at, d, dirs.includes(d) ? LINE : CROSS)
    }
  } catch (err) {
    if (err instanceof Broken) return result(false)
    throw err
  }
  // Where the next "what if" starts: just past the last one, so the reader works round the board.
  let from = 0
  for (;;) {
    const step = propagate(x, rank, tally)
    if (step === 'broken') return result(false)
    if (step === 'changed') tally.local++
    if (!x.mark.includes(OPEN) && !x.cell.includes(TT_OPEN)) break
    if (rank >= RANK.probe) {
      const next = probe(x, from)
      if (next >= 0) {
        tally.probe++
        from = next
        continue
      }
    }
    break
  }
  return result(true)
}

/* ------------------------------------------------------------------ *
 * Plain search, for the tests
 * ------------------------------------------------------------------ */

/**
 * The board's lines by plain search, up to `limit` of them, each as its
 * squares from where it enters — the tests' independent check on the
 * solver. The line is walked square by square from where it enters, never
 * past a row's or column's number, never further from the way out than the
 * track left allows, and through printed pieces only as printed.
 */
export function ttSolutions(p: TtPuzzle, limit = 2): number[][] {
  const n = p.size
  const g = ttGeometry(n)
  const [entry, exit] = p.portals
  const total = p.rows.reduce((a, b) => a + b, 0)
  const givenDirs = new Map(p.givens.map((gv) => [gv.at, TT_PIECE_DIRS[gv.piece]]))
  const used = new Uint8Array(n * n)
  const rowUsed = new Array<number>(n).fill(0)
  const colUsed = new Array<number>(n).fill(0)
  const route: number[] = []
  const out: number[][] = []
  const exitR = Math.floor(exit.at / n)
  const exitC = exit.at % n
  const visit = (cell: number, inDir: number) => {
    if (out.length >= limit || used[cell]) return
    const r = Math.floor(cell / n)
    const c = cell % n
    if (rowUsed[r]! >= p.rows[r]! || colUsed[c]! >= p.cols[c]!) return
    if (route.length + 1 + Math.abs(r - exitR) + Math.abs(c - exitC) > total) return
    const dirs = givenDirs.get(cell)
    if (dirs && !dirs.includes(inDir)) return
    route.push(cell)
    used[cell] = 1
    rowUsed[r]!++
    colUsed[c]!++
    if (cell === exit.at && inDir !== exit.dir && (!dirs || dirs.includes(exit.dir))) {
      if (route.length === total && isTtSolution(p, route)) out.push([...route])
    } else {
      for (let d = 0; d < 4; d++) {
        if (d === inDir || (dirs && !dirs.includes(d))) continue
        const next = g.step[cell * 4 + d]!
        if (next >= 0) visit(next, ttOpposite(d))
      }
    }
    route.pop()
    used[cell] = 0
    rowUsed[r]!--
    colUsed[c]!--
  }
  visit(entry.at, entry.dir)
  return out
}

/** How many lines the board has, counted up to `limit`. */
export const countTtSolutions = (p: TtPuzzle, limit = 2) => ttSolutions(p, limit).length
