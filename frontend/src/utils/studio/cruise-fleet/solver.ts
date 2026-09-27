/**
 * Cruise Fleet (Battleships / Bimaru): the rules, and a reader's way of
 * solving.
 *
 * A square harbor of N × N squares hides a fleet of ships, each a straight
 * run of squares across or down. Numbers beside the harbor tell how many
 * ship squares lie in each row and column, and a few squares are shown: open
 * water (a wave), or a piece of ship (a whole rowboat, a bow or stern, or a
 * middle). A finished harbor obeys:
 *
 * - the fleet is exactly the one in the legend (one ship of four, two of
 *   three, and so on);
 * - ships never touch, not even corner to corner;
 * - every row and column holds its number of ship squares;
 * - every square shown is what it shows.
 *
 * The solver works the way a reader does, one sure step at a time, and never
 * guesses. It keeps a pencil mark on every square (ship, water, or not yet
 * known). Every step follows from the rules alone, so a harbor the solver
 * finishes has exactly one answer. What it may use depends on the level:
 *
 * - `basic` — marking and counting: the squares round a shown piece that it
 *   decides (a bow's ship runs on one way, water on its other three sides;
 *   a middle runs on both ways across or both ways down); water on every
 *   corner of a ship square; a row or column with all its ship squares has
 *   water in the rest, and one with only as many open squares as ship
 *   squares still missing is ship in all of them; a ship already as long as
 *   the longest one still missing has water at both ends.
 * - `fleet` — adds "where can it go": a ship still missing that fits in just
 *   as many places as there are of it is in all of them; the squares every
 *   place of the one ship of a length share are ship; and a square where no
 *   missing ship fits is water.
 *
 * There is no "what if" step: a harbor that needs trial and error is not one
 * this book prints.
 */

export type CfPiece = 'water' | 'single' | 'middle' | 'top' | 'bottom' | 'left' | 'right'

/** A square the reader is shown. */
export interface CfGiven {
  at: number
  piece: CfPiece
}

export interface CfPuzzle {
  /** Squares across and down. */
  size: number
  /** The fleet's ship lengths, longest first. */
  fleet: readonly number[]
  /** Ship squares in each row, top first. */
  rows: readonly number[]
  /** Ship squares in each column, left first. */
  cols: readonly number[]
  givens: readonly CfGiven[]
}

/** A ship: its top (or left) square, its length, and which way it lies. */
export interface CfShip {
  at: number
  length: number
  across: boolean
}

export type CfRules = 'basic' | 'fleet'

export const UNKNOWN = -1
export const WATER = 0
export const SHIP = 1

/* ------------------------------------------------------------------ *
 * Ships and squares
 * ------------------------------------------------------------------ */

/** The squares a ship covers, bow to stern. */
export function cfShipSquares(ship: CfShip, n: number): number[] {
  const step = ship.across ? 1 : n
  return Array.from({ length: ship.length }, (_, k) => ship.at + k * step)
}

/** The fleet as a grid: SHIP where a ship lies, WATER elsewhere. */
export function cfGridOf(ships: readonly CfShip[], n: number): Int8Array {
  const grid = new Int8Array(n * n).fill(WATER)
  for (const ship of ships) for (const i of cfShipSquares(ship, n)) grid[i] = SHIP
  return grid
}

/** Ship squares in each row and column. */
export function cfCounts(ships: readonly CfShip[], n: number): { rows: number[]; cols: number[] } {
  const rows = new Array<number>(n).fill(0)
  const cols = new Array<number>(n).fill(0)
  for (const ship of ships) {
    for (const i of cfShipSquares(ship, n)) {
      rows[Math.floor(i / n)]!++
      cols[i % n]!++
    }
  }
  return { rows, cols }
}

/** What a square of a finished grid shows: water, or which piece of its ship it is. */
export function cfPieceOf(grid: ArrayLike<number>, n: number, i: number): CfPiece {
  if (grid[i] !== SHIP) return 'water'
  const r = Math.floor(i / n)
  const c = i % n
  const up = r > 0 && grid[i - n] === SHIP
  const down = r + 1 < n && grid[i + n] === SHIP
  const left = c > 0 && grid[i - 1] === SHIP
  const right = c + 1 < n && grid[i + 1] === SHIP
  if ((up || down) && (left || right)) return 'middle'
  if (up && down) return 'middle'
  if (left && right) return 'middle'
  if (down) return 'top'
  if (up) return 'bottom'
  if (right) return 'left'
  if (left) return 'right'
  return 'single'
}

/** The ships of a finished grid, in reading order of their first square, or null when a shape is not a ship. */
export function cfShipsOf(grid: ArrayLike<number>, n: number): CfShip[] | null {
  const seen = new Int16Array(n * n)
  const ships: CfShip[] = []
  for (let i = 0; i < n * n; i++) {
    if (grid[i] !== SHIP || seen[i]) continue
    const c = i % n
    let across = 1
    while (c + across < n && grid[i + across] === SHIP) across++
    let down = 1
    while (Math.floor(i / n) + down < n && grid[i + down * n] === SHIP) down++
    if (across > 1 && down > 1) return null
    // A rowboat lies "across", as the fleet is dropped in.
    const ship: CfShip = { at: i, length: Math.max(across, down), across: down === 1 }
    for (const j of cfShipSquares(ship, n)) seen[j] = ships.length + 1
    ships.push(ship)
  }
  // A shape that bends part-way along reads as two ships side by side.
  for (let i = 0; i < n * n; i++) {
    if (!seen[i]) continue
    if (i % n < n - 1 && seen[i + 1] && seen[i + 1] !== seen[i]) return null
    if (i + n < n * n && seen[i + n] && seen[i + n] !== seen[i]) return null
  }
  return ships
}

/** The lengths of a fleet, longest first, as one comparable string. */
export const cfFleetList = (lengths: readonly number[]) => [...lengths].sort((a, b) => b - a).join('.')

/** The ship squares, in reading order, as one comparable string. */
export function cfSquareList(ships: readonly CfShip[], n: number): string {
  return ships
    .flatMap((s) => cfShipSquares(s, n))
    .sort((a, b) => a - b)
    .join('.')
}

/** Squares that touch, corners included (a square does not touch itself). */
export function cfTouching(a: number, b: number, n: number): boolean {
  if (a === b) return false
  return Math.abs(Math.floor(a / n) - Math.floor(b / n)) <= 1 && Math.abs((a % n) - (b % n)) <= 1
}

/** True when the ships are the fleet, all in the harbor, none overlapping or touching. */
export function isCfFleet(n: number, fleet: readonly number[], ships: readonly CfShip[]): boolean {
  if (cfFleetList(ships.map((s) => s.length)) !== cfFleetList(fleet)) return false
  const owner = new Int16Array(n * n).fill(-1)
  for (let k = 0; k < ships.length; k++) {
    const ship = ships[k]!
    if (!Number.isInteger(ship.at) || ship.at < 0 || ship.at >= n * n || ship.length < 1) return false
    const r = Math.floor(ship.at / n)
    const c = ship.at % n
    if (ship.across ? c + ship.length > n : r + ship.length > n) return false
    for (const i of cfShipSquares(ship, n)) {
      if (owner[i] !== -1) return false
      owner[i] = k
    }
  }
  for (let i = 0; i < n * n; i++) {
    if (owner[i] === -1) continue
    const r = Math.floor(i / n)
    const c = i % n
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr
        const cc = c + dc
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue
        const o = owner[rr * n + cc]!
        if (o !== -1 && o !== owner[i]) return false
      }
    }
  }
  return true
}

/** True when the ships are a finished harbor for the puzzle. */
export function isCfSolution(p: CfPuzzle, ships: readonly CfShip[]): boolean {
  const n = p.size
  if (!isCfFleet(n, p.fleet, ships)) return false
  const { rows, cols } = cfCounts(ships, n)
  if (rows.join(',') !== p.rows.join(',') || cols.join(',') !== p.cols.join(',')) return false
  const grid = cfGridOf(ships, n)
  return p.givens.every((g) => cfPieceOf(grid, n, g.at) === g.piece)
}

/* ------------------------------------------------------------------ *
 * The solver's pencil marks
 * ------------------------------------------------------------------ */

type Step = 'changed' | 'same' | 'broken'

export interface CfTally {
  basic: number
  fleet: number
}

export interface CfSolveResult {
  solved: boolean
  /** Per square: -1 not known, 0 water, 1 ship. */
  state: Int8Array
  /** How many times each kind of step moved the harbor on. */
  tally: CfTally
}

interface Ctx {
  p: CfPuzzle
  n: number
  /** Ships of each length the fleet holds. */
  want: number[]
  longest: number
  /** The piece shown on each square, if any. */
  shown: (CfPiece | null)[]
}

function context(p: CfPuzzle): Ctx {
  const n = p.size
  const longest = Math.max(0, ...p.fleet)
  const want = new Array<number>(longest + 1).fill(0)
  for (const l of p.fleet) want[l]!++
  const shown: (CfPiece | null)[] = new Array(n * n).fill(null)
  for (const g of p.givens) shown[g.at] = g.piece
  return { p, n, want, longest, shown }
}

/** Marks a square; 'broken' when it already holds the other mark. */
function put(s: Int8Array, i: number, v: number): Step {
  if (s[i] === v) return 'same'
  if (s[i] !== UNKNOWN) return 'broken'
  s[i] = v
  return 'changed'
}

/** The square one step along, or -1 off the harbor. */
function stepOf(n: number, i: number, dr: number, dc: number): number {
  const r = Math.floor(i / n) + dr
  const c = (i % n) + dc
  return r < 0 || r >= n || c < 0 || c >= n ? -1 : r * n + c
}

const UP: [number, number] = [-1, 0]
const DOWN: [number, number] = [1, 0]
const LEFT: [number, number] = [0, -1]
const RIGHT: [number, number] = [0, 1]
const CORNERS: [number, number][] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]

/** Where each end piece's ship runs on, and its three closed sides. */
const RUNS_ON: Partial<Record<CfPiece, [number, number]>> = { top: DOWN, bottom: UP, left: RIGHT, right: LEFT }

/** Water or off the harbor: a side a ship cannot run on through. */
const closed = (s: Int8Array, j: number) => j < 0 || s[j] === WATER

/** What every shown square says about itself and its sides. Static: applied once. */
function applyShown(c: Ctx, s: Int8Array): Step {
  const { n } = c
  let any = false
  for (const g of c.p.givens) {
    const mark = (j: number, v: number): boolean => {
      if (j < 0) return v === WATER
      const step = put(s, j, v)
      if (step === 'changed') any = true
      return step !== 'broken'
    }
    if (g.piece === 'water') {
      if (!mark(g.at, WATER)) return 'broken'
      continue
    }
    if (!mark(g.at, SHIP)) return 'broken'
    if (g.piece === 'middle') continue
    const on = RUNS_ON[g.piece]
    for (const d of [UP, DOWN, LEFT, RIGHT]) {
      const j = stepOf(n, g.at, d[0], d[1])
      const ship = on !== undefined && on[0] === d[0] && on[1] === d[1]
      if (!mark(j, ship ? SHIP : WATER)) return 'broken'
    }
  }
  return any ? 'changed' : 'same'
}

/** A middle piece runs on both ways across, or both ways down: whichever way is not closed. */
function middles(c: Ctx, s: Int8Array): Step {
  const { n } = c
  let any = false
  for (const g of c.p.givens) {
    if (g.piece !== 'middle') continue
    const l = stepOf(n, g.at, 0, -1)
    const r = stepOf(n, g.at, 0, 1)
    const u = stepOf(n, g.at, -1, 0)
    const d = stepOf(n, g.at, 1, 0)
    const blockedAcross = closed(s, l) || closed(s, r)
    const blockedDown = closed(s, u) || closed(s, d)
    const shipAcross = (l >= 0 && s[l] === SHIP) || (r >= 0 && s[r] === SHIP)
    const shipDown = (u >= 0 && s[u] === SHIP) || (d >= 0 && s[d] === SHIP)
    if ((blockedAcross && blockedDown) || (shipAcross && shipDown)) return 'broken'
    let marks: [number, number][] = []
    if (blockedAcross || shipDown) marks = [[u, SHIP], [d, SHIP], [l, WATER], [r, WATER]]
    else if (blockedDown || shipAcross) marks = [[l, SHIP], [r, SHIP], [u, WATER], [d, WATER]]
    for (const [j, v] of marks) {
      if (j < 0) {
        if (v === SHIP) return 'broken'
        continue
      }
      const step = put(s, j, v)
      if (step === 'broken') return 'broken'
      if (step === 'changed') any = true
    }
  }
  return any ? 'changed' : 'same'
}

/** Water on every corner of a ship square. */
function corners(c: Ctx, s: Int8Array): Step {
  const { n } = c
  let any = false
  for (let i = 0; i < n * n; i++) {
    if (s[i] !== SHIP) continue
    for (const [dr, dc] of CORNERS) {
      const j = stepOf(n, i, dr, dc)
      if (j < 0) continue
      const step = put(s, j, WATER)
      if (step === 'broken') return 'broken'
      if (step === 'changed') any = true
    }
  }
  return any ? 'changed' : 'same'
}

/** A row or column's squares. */
function lineSquares(n: number, line: number): number[] {
  return line < n ? Array.from({ length: n }, (_, k) => line * n + k) : Array.from({ length: n }, (_, k) => k * n + (line - n))
}

/** Counting: a line with all its ship squares is water elsewhere; one with just enough open squares is ship in all. */
function lines(c: Ctx, s: Int8Array): Step {
  const { n, p } = c
  let any = false
  for (let line = 0; line < 2 * n; line++) {
    const want = line < n ? p.rows[line]! : p.cols[line - n]!
    const squares = lineSquares(n, line)
    let ships = 0
    let open = 0
    for (const j of squares) {
      if (s[j] === SHIP) ships++
      else if (s[j] === UNKNOWN) open++
    }
    if (ships > want || ships + open < want) return 'broken'
    if (open === 0) continue
    const fill = ships === want ? WATER : ships + open === want ? SHIP : UNKNOWN
    if (fill === UNKNOWN) continue
    for (const j of squares) if (s[j] === UNKNOWN) s[j] = fill
    any = true
  }
  return any ? 'changed' : 'same'
}

/** A run of ship squares joined across or down, as the pencil marks stand. */
interface Group {
  squares: number[]
  /** true across, false down, null a lone square. */
  across: boolean | null
  /** Both ends (every side, for a lone square) closed: a whole ship. */
  whole: boolean
  /** The squares just past each end (-1 off the harbor); for a lone square, its four sides. */
  ends: number[]
}

/** Every run of ship squares, or null when one bends (two ships touching). */
function groupsOf(c: Ctx, s: Int8Array): Group[] | null {
  const { n } = c
  const seen = new Uint8Array(n * n)
  const out: Group[] = []
  for (let i = 0; i < n * n; i++) {
    if (s[i] !== SHIP || seen[i]) continue
    const squares: number[] = []
    const stack = [i]
    seen[i] = 1
    while (stack.length > 0) {
      const x = stack.pop()!
      squares.push(x)
      for (const [dr, dc] of [UP, DOWN, LEFT, RIGHT]) {
        const j = stepOf(n, x, dr, dc)
        if (j >= 0 && s[j] === SHIP && !seen[j]) {
          seen[j] = 1
          stack.push(j)
        }
      }
    }
    squares.sort((a, b) => a - b)
    const rows = new Set(squares.map((x) => Math.floor(x / n)))
    const cols = new Set(squares.map((x) => x % n))
    if (rows.size > 1 && cols.size > 1) return null
    const first = squares[0]!
    const last = squares[squares.length - 1]!
    let across: boolean | null = null
    let ends: number[]
    if (squares.length === 1) ends = [UP, DOWN, LEFT, RIGHT].map(([dr, dc]) => stepOf(n, first, dr, dc))
    else {
      across = rows.size === 1
      ends = across ? [stepOf(n, first, 0, -1), stepOf(n, last, 0, 1)] : [stepOf(n, first, -1, 0), stepOf(n, last, 1, 0)]
    }
    out.push({ squares, across, whole: ends.every((j) => closed(s, j)), ends })
  }
  return out
}

/** The ships still missing, by length, once every whole ship is ticked off; null when too many of a length are whole. */
function missing(c: Ctx, groups: readonly Group[]): number[] | null {
  const left = [...c.want]
  for (const g of groups) {
    if (!g.whole) continue
    const l = g.squares.length
    if (l > c.longest || --left[l]! < 0) return null
  }
  return left
}

/** A whole ship's shown pieces must be the pieces it makes. */
function wholeShipsAgree(c: Ctx, s: Int8Array, groups: readonly Group[]): boolean {
  for (const g of groups) {
    if (!g.whole) continue
    for (const i of g.squares) {
      const shown = c.shown[i]
      if (shown && shown !== 'water' && shown !== cfPieceOf(s, c.n, i)) return false
    }
  }
  return true
}

/**
 * Ticking off the fleet: a run as long as the longest ship still missing is
 * that ship (water at both ends); a lone square when only rowboats are
 * missing is a rowboat (water all round); and once the whole fleet is found
 * the rest is water.
 */
function fleetCount(c: Ctx, s: Int8Array): Step {
  const groups = groupsOf(c, s)
  if (!groups || !wholeShipsAgree(c, s, groups)) return 'broken'
  const left = missing(c, groups)
  if (!left) return 'broken'
  let longest = 0
  for (let l = left.length - 1; l > 0; l--) {
    if (left[l]! > 0) {
      longest = l
      break
    }
  }
  let any = false
  for (const g of groups) {
    if (g.whole) continue
    const l = g.squares.length
    if (l > longest) return 'broken'
    if ((g.across !== null && l === longest) || (g.across === null && longest === 1)) {
      for (const j of g.ends) {
        if (j < 0) continue
        const step = put(s, j, WATER)
        if (step === 'broken') return 'broken'
        if (step === 'changed') any = true
      }
    }
  }
  if (longest === 0) {
    for (let i = 0; i < s.length; i++) {
      if (s[i] === UNKNOWN) {
        s[i] = WATER
        any = true
      }
    }
  }
  return any ? 'changed' : 'same'
}

/** The basic steps, over and over, until nothing moves. */
function runBasic(c: Ctx, s: Int8Array, tally: CfTally): Step {
  let any = false
  for (;;) {
    let moved = false
    for (const rule of [middles, corners, lines, fleetCount]) {
      const step = rule(c, s)
      if (step === 'broken') return 'broken'
      if (step === 'changed') moved = true
    }
    if (!moved) return any ? 'changed' : 'same'
    any = true
    tally.basic++
  }
}

/**
 * Every place a missing ship of this length could lie: no water under it,
 * no ship just past its ends or along its sides (it would touch), room left
 * in its rows and columns, and not a ship already whole.
 */
function placesFor(c: Ctx, s: Int8Array, length: number): number[][] {
  const { n, p } = c
  const rowShips = new Array<number>(n).fill(0)
  const colShips = new Array<number>(n).fill(0)
  for (let i = 0; i < n * n; i++) {
    if (s[i] !== SHIP) continue
    rowShips[Math.floor(i / n)]!++
    colShips[i % n]!++
  }
  const out: number[][] = []
  for (const across of length === 1 ? [true] : [true, false]) {
    for (let at = 0; at < n * n; at++) {
      const r = Math.floor(at / n)
      const col = at % n
      if (across ? col + length > n : r + length > n) continue
      const squares = cfShipSquares({ at, length, across }, n)
      if (squares.some((j) => s[j] === WATER)) continue
      // The ring round the ship: its ends, its sides and the corners past its ends.
      const [dr, dc] = across ? [0, 1] : [1, 0]
      let touches = false
      let endsClosed = true
      for (let k = -1; k <= length && !touches; k++) {
        const along = stepOf(n, at, dr * k, dc * k)
        const inside = k >= 0 && k < length
        if (!inside) {
          if (along >= 0 && s[along] === SHIP) touches = true
          if (!closed(s, along)) endsClosed = false
        }
        for (const side of [-1, 1]) {
          const j = stepOf(n, at, dr * k + dc * side, dc * k + dr * side)
          if (j >= 0 && s[j] === SHIP) touches = true
        }
      }
      if (touches) continue
      const fresh = squares.filter((j) => s[j] === UNKNOWN)
      // A ship already whole is ticked off, not missing.
      if (fresh.length === 0 && endsClosed && (length > 1 || [UP, DOWN, LEFT, RIGHT].every(([a, b]) => closed(s, stepOf(n, at, a, b))))) continue
      if (fresh.length > 0) {
        if (across) {
          if (rowShips[r]! + fresh.length > p.rows[r]!) continue
          if (fresh.some((j) => colShips[j % n]! + 1 > p.cols[j % n]!)) continue
        } else {
          if (colShips[col]! + fresh.length > p.cols[col]!) continue
          if (fresh.some((j) => rowShips[Math.floor(j / n)]! + 1 > p.rows[Math.floor(j / n)]!)) continue
        }
      }
      out.push(squares)
    }
  }
  return out
}

/** True when two places could both hold ships: no square shared, none touching. */
function apart(a: readonly number[], b: readonly number[], n: number): boolean {
  return a.every((x) => b.every((y) => x !== y && !cfTouching(x, y, n)))
}

/**
 * Where can it go: for each length still missing, the places it fits. As
 * many places as ships (all apart) — a ship in every one; one ship and
 * several places — the squares they all share are ship; and a square no
 * missing ship fits on is water.
 */
function fleetPlaces(c: Ctx, s: Int8Array): Step {
  const { n } = c
  const groups = groupsOf(c, s)
  if (!groups) return 'broken'
  const left = missing(c, groups)
  if (!left) return 'broken'
  const covered = new Uint8Array(n * n)
  let any = false
  for (let l = left.length - 1; l > 0; l--) {
    const k = left[l]!
    if (k === 0) continue
    const places = placesFor(c, s, l)
    if (places.length < k) return 'broken'
    for (const place of places) for (const j of place) covered[j] = 1
    let marks: number[] = []
    if (places.length === k) {
      for (let a = 0; a < places.length; a++) for (let b = a + 1; b < places.length; b++) if (!apart(places[a]!, places[b]!, n)) return 'broken'
      marks = places.flat()
    } else if (k === 1) {
      marks = places[0]!.filter((j) => places.every((pl) => pl.includes(j)))
    }
    for (const j of marks) {
      if (s[j] === UNKNOWN) {
        s[j] = SHIP
        any = true
      }
    }
    if (any) return 'changed'
  }
  for (const g of groups) {
    if (!g.whole && g.squares.some((j) => !covered[j])) return 'broken'
  }
  for (let i = 0; i < n * n; i++) {
    if (s[i] === UNKNOWN && !covered[i]) {
      s[i] = WATER
      any = true
    }
  }
  return any ? 'changed' : 'same'
}

function done(s: Int8Array): boolean {
  return !s.includes(UNKNOWN)
}

/**
 * Solves the harbor with the level's steps only. `solved` is true only when
 * every square is decided and the ships found are a finished harbor, which
 * — every step being sound — also proves it is the only answer.
 */
export function solveCf(p: CfPuzzle, rules: CfRules): CfSolveResult {
  const c = context(p)
  const s = new Int8Array(p.size * p.size).fill(UNKNOWN)
  const tally: CfTally = { basic: 0, fleet: 0 }
  const fail = (): CfSolveResult => ({ solved: false, state: s, tally })
  if (applyShown(c, s) === 'broken') return fail()
  for (;;) {
    if (runBasic(c, s, tally) === 'broken') return fail()
    if (done(s)) break
    if (rules === 'fleet') {
      const placed = fleetPlaces(c, s)
      if (placed === 'broken') return fail()
      if (placed === 'changed') {
        tally.fleet++
        continue
      }
    }
    return fail()
  }
  const ships = cfShipsOf(s, p.size)
  return { solved: ships !== null && isCfSolution(p, ships), state: s, tally }
}

/**
 * The harbor's answers by plain search, up to `limit` of them, each as its
 * ships — the tests' independent check on the solver. Square by square in
 * reading order, ship or water, pruned by the row and column numbers, the
 * corner rule and the fleet's lengths.
 */
export function cfSolutions(p: CfPuzzle, limit = 2): CfShip[][] {
  const n = p.size
  const c = context(p)
  const s = new Int8Array(n * n).fill(UNKNOWN)
  const rowShips = new Array<number>(n).fill(0)
  const colShips = new Array<number>(n).fill(0)
  const found = new Array<number>(c.longest + 1).fill(0)
  const out: CfShip[][] = []

  const runAcross = (i: number) => {
    let k = 0
    while (k <= i % n && s[i - k] === SHIP) k++
    return k
  }
  const runDown = (i: number) => {
    let k = 0
    while (i - k * n >= 0 && s[i - k * n] === SHIP) k++
    return k
  }
  /** The whole across-run through a square of a finished row. */
  const rowRun = (i: number) => {
    let k = runAcross(i)
    let j = i + 1
    while (j % n !== 0 && s[j] === SHIP) {
      k++
      j++
    }
    return k
  }
  // A ship counted as it closes: +1 or −1; false when the fleet has no room for it.
  const tick = (length: number, by: 1 | -1): boolean => {
    if (length > c.longest) return false
    found[length]! += by
    return found[length]! <= c.want[length]!
  }

  const walk = (i: number) => {
    if (out.length >= limit) return
    if (i === n * n) {
      // Ships running off the bottom edge close here.
      const ticked: number[] = []
      let ok = true
      for (let col = 0; col < n && ok; col++) {
        const j = (n - 1) * n + col
        if (s[j] !== SHIP) continue
        const down = runDown(j)
        const length = down > 1 ? down : rowRun(j) === 1 ? 1 : 0
        if (length === 0) continue
        ticked.push(length)
        ok = tick(length, 1)
      }
      if (ok && found.every((f, l) => f === c.want[l])) {
        const ships = cfShipsOf(s, n)
        if (ships && isCfSolution(p, ships)) out.push(ships)
      }
      for (const l of ticked) tick(l, -1)
      return
    }
    const r = Math.floor(i / n)
    const col = i % n
    const shown = c.shown[i]
    const options = shown === 'water' ? [WATER] : shown ? [SHIP] : [SHIP, WATER]
    for (const v of options) {
      if (v === SHIP) {
        if (rowShips[r]! + 1 > p.rows[r]! || colShips[col]! + 1 > p.cols[col]!) continue
        if ((col > 0 && r > 0 && s[i - n - 1] === SHIP) || (col + 1 < n && r > 0 && s[i - n + 1] === SHIP)) continue
      } else {
        if (rowShips[r]! + (n - 1 - col) < p.rows[r]! || colShips[col]! + (n - 1 - r) < p.cols[col]!) continue
      }
      s[i] = v
      if (v === SHIP) {
        rowShips[r]!++
        colShips[col]!++
      }
      const ticked: number[] = []
      let ok = true
      if (v === SHIP && (runAcross(i) > c.longest || runDown(i) > c.longest)) ok = false
      // An across-run closes at water or the row's end.
      if (ok) {
        const acrossEnd = v === WATER && col > 0 && s[i - 1] === SHIP ? i - 1 : v === SHIP && col === n - 1 ? i : -1
        if (acrossEnd >= 0) {
          const length = runAcross(acrossEnd)
          if (length > 1) {
            ticked.push(length)
            ok = tick(length, 1)
          }
        }
      }
      // A down-run closes at water; a lone square is a rowboat once its row is done.
      if (ok && v === WATER && r > 0 && s[i - n] === SHIP) {
        const down = runDown(i - n)
        const length = down > 1 ? down : rowRun(i - n) === 1 ? 1 : 0
        if (length > 0) {
          ticked.push(length)
          ok = tick(length, 1)
        }
      }
      if (ok) walk(i + 1)
      for (const l of ticked) tick(l, -1)
      if (v === SHIP) {
        rowShips[r]!--
        colShips[col]!--
      }
      s[i] = UNKNOWN
      if (out.length >= limit) return
    }
  }
  walk(0)
  return out
}

/** How many answers the harbor has, counted up to `limit`. */
export const countCfSolutions = (p: CfPuzzle, limit = 2) => cfSolutions(p, limit).length
