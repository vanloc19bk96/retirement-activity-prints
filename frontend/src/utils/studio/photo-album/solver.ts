/**
 * Photo Album (the count-the-neighbours picture puzzle known in puzzle
 * books as Fill-a-Pix, or Mosaic): the rules, and a reader's way of solving.
 *
 * A grid of squares hides a picture. Some squares carry a number from 0 to
 * 9: how many squares of its block of nine are shaded — the square itself
 * and the eight round it (fewer at the edge of the grid). Shade the right
 * squares, leave the rest blank, and the picture appears.
 *
 * The solver works the way a reader does, one sure step at a time, and never
 * guesses. Every step follows from the rules alone, so a grid the solver
 * finishes has exactly one answer. What it may use depends on the level:
 *
 * - `basic` — the first steps, one number at a time: a number whose block
 *   already holds that many shaded squares leaves the rest blank ("full"); a
 *   number with just as many squares left open as it still needs shades
 *   them all ("room"). A 0 blanks its block and a 9 shades it.
 * - `pairs` — adds "overlap": two numbers whose blocks share squares are
 *   read together. What the shared squares can hold is pinned between what
 *   each number still needs and what its own squares can take, and when that
 *   leaves one number's own squares all shaded, or all blank (or the shared
 *   ones), they are marked.
 * - `probe` — adds "what if": a square whose shading (or leaving blank)
 *   leads by the earlier steps ("full", "room" and "overlap") straight to a
 *   number that cannot be kept takes the other.
 */

export type PaRules = 'basic' | 'pairs' | 'probe'

/** A square: not yet known, left blank, or shaded. */
export const PA_OPEN = -1
export const PA_BLANK = 0
export const PA_SHADED = 1

export interface PaPuzzle {
  width: number
  height: number
  /** Row by row: the number a square prints, or −1 for none. */
  clues: readonly number[]
}

export interface PaTally {
  basic: number
  pairs: number
  probe: number
}

export interface PaSolveResult {
  solved: boolean
  /** A number that cannot be kept, whatever is shaded. */
  broken: boolean
  /** Row by row: `PA_SHADED`, `PA_BLANK` or, where the steps ran out, `PA_OPEN`. */
  cells: Int8Array
  tally: PaTally
}

/* ------------------------------------------------------------------ *
 * The grid's blocks
 * ------------------------------------------------------------------ */

interface Geometry {
  /** Every square's block of nine (fewer at an edge), itself included. */
  block: Int32Array[]
  /** Every square's reach for "overlap": the squares within two steps, whose blocks meet its own. */
  near: Int32Array[]
}

const GEOMETRY = new Map<string, Geometry>()

function around(width: number, height: number, i: number, reach: number): Int32Array {
  const r = Math.floor(i / width)
  const c = i % width
  const out: number[] = []
  for (let dr = -reach; dr <= reach; dr++) {
    for (let dc = -reach; dc <= reach; dc++) {
      const rr = r + dr
      const cc = c + dc
      if (rr >= 0 && rr < height && cc >= 0 && cc < width) out.push(rr * width + cc)
    }
  }
  return Int32Array.from(out)
}

function geometry(width: number, height: number): Geometry {
  const key = `${width}x${height}`
  let g = GEOMETRY.get(key)
  if (!g) {
    const n = width * height
    g = {
      block: Array.from({ length: n }, (_, i) => around(width, height, i, 1)),
      near: Array.from({ length: n }, (_, i) => around(width, height, i, 2).filter((j) => j !== i)),
    }
    GEOMETRY.set(key, g)
  }
  return g
}

/** A square's block of nine, itself included (fewer at an edge). */
export const paBlock = (width: number, height: number, i: number): readonly number[] => Array.from(geometry(width, height).block[i]!)

/** Every square's number for a picture: how many of its block are shaded. */
export function paCountsOf(bitmap: readonly boolean[], width: number, height: number): number[] {
  const { block } = geometry(width, height)
  return block.map((b) => {
    let n = 0
    for (const j of b) if (bitmap[j]) n++
    return n
  })
}

/** True when every printed number counts the picture's shaded squares in its block. */
export function isPaSolution(p: PaPuzzle, bitmap: readonly boolean[]): boolean {
  if (bitmap.length !== p.width * p.height || p.clues.length !== bitmap.length) return false
  const counts = paCountsOf(bitmap, p.width, p.height)
  return p.clues.every((v, i) => v < 0 || v === counts[i])
}

/** True when the grid is a grid and every number is one a block can hold. */
export function paWellFormed(p: PaPuzzle): boolean {
  if (!Number.isInteger(p.width) || !Number.isInteger(p.height) || p.width < 2 || p.height < 2) return false
  if (p.clues.length !== p.width * p.height) return false
  const { block } = geometry(p.width, p.height)
  return p.clues.every((v, i) => v === -1 || (Number.isInteger(v) && v >= 0 && v <= block[i]!.length))
}

/* ------------------------------------------------------------------ *
 * The solver
 * ------------------------------------------------------------------ */

/**
 * One solve, kept open so the builder can add numbers as it goes: a number
 * added only ever tells the reader more, so every square already marked
 * stays marked and the work picks up where it stopped.
 */
export class PaSolver {
  readonly width: number
  readonly height: number
  readonly clues: Int8Array
  readonly cells: Int8Array
  readonly tally: PaTally = { basic: 0, pairs: 0, probe: 0 }
  broken = false
  private readonly rules: PaRules
  private readonly geo: Geometry
  /** Numbers whose block changed since they were last read on their own. */
  private readonly queue: number[] = []
  private readonly queued: Uint8Array
  /** Numbers whose block changed since they were last read with their neighbours. */
  private readonly dirty: Uint8Array
  private open: number
  /** Where the next "what if" search starts. */
  private probeFrom = 0
  /** A pencil copy of the grid for "what if", kept between tries. */
  private scratch: PaSolver | null = null

  constructor(p: PaPuzzle, rules: PaRules) {
    this.width = p.width
    this.height = p.height
    this.rules = rules
    this.geo = geometry(p.width, p.height)
    const n = p.width * p.height
    this.clues = new Int8Array(n).fill(-1)
    this.cells = new Int8Array(n).fill(PA_OPEN)
    this.queued = new Uint8Array(n)
    this.dirty = new Uint8Array(n)
    this.open = n
    p.clues.forEach((v, i) => {
      if (v >= 0) this.addClue(i, v)
    })
  }

  /** A solve picked up from squares already marked (every number read again). */
  static resume(p: PaPuzzle, rules: PaRules, cells: ArrayLike<number>): PaSolver {
    const solver = new PaSolver(p, rules)
    solver.cells.set(cells)
    solver.open = 0
    for (const s of solver.cells) if (s === PA_OPEN) solver.open++
    return solver
  }

  get solved(): boolean {
    return !this.broken && this.open === 0
  }

  /** Prints a number on a square (the builder's "one more clue"). */
  addClue(i: number, value: number): void {
    this.clues[i] = value
    this.touch(i)
  }

  /** Works every step the rules allow until none is left; true when the grid is finished. */
  run(): boolean {
    while (!this.broken && this.open > 0) {
      if (this.basic()) continue
      if (this.broken) break
      if (this.rules !== 'basic' && this.pairs()) continue
      if (this.broken) break
      if (this.rules === 'probe' && this.probe()) continue
      break
    }
    return this.solved
  }

  private touch(clue: number): void {
    if (!this.queued[clue]) {
      this.queued[clue] = 1
      this.queue.push(clue)
    }
    this.dirty[clue] = 1
  }

  private mark(i: number, value: number): void {
    if (this.cells[i] !== PA_OPEN) return
    this.cells[i] = value
    this.open--
    for (const k of this.geo.block[i]!) if (this.clues[k]! >= 0) this.touch(k)
  }

  /** "Full" and "room", number by number, until neither marks a square; true when any did. */
  private basic(): boolean {
    let any = false
    while (this.queue.length > 0) {
      const k = this.queue.pop()!
      this.queued[k] = 0
      const need = this.clues[k]!
      let shaded = 0
      let open = 0
      const block = this.geo.block[k]!
      for (const j of block) {
        const s = this.cells[j]
        if (s === PA_SHADED) shaded++
        else if (s === PA_OPEN) open++
      }
      if (shaded > need || shaded + open < need) {
        this.broken = true
        return any
      }
      if (open === 0) continue
      if (shaded === need || shaded + open === need) {
        const value = shaded === need ? PA_BLANK : PA_SHADED
        for (const j of block) if (this.cells[j] === PA_OPEN) this.mark(j, value)
        this.tally.basic++
        any = true
      }
    }
    return any
  }

  /** "Overlap": every pair of numbers whose blocks meet, read together; true when a pair marked a square. */
  private pairs(): boolean {
    const { block, near } = this.geo
    const n = this.clues.length
    for (let a = 0; a < n; a++) {
      if (this.clues[a]! < 0 || !this.dirty[a]) continue
      this.dirty[a] = 0
      const blockA = block[a]!
      let openA = 0
      let shadedA = 0
      for (const j of blockA) {
        if (this.cells[j] === PA_OPEN) openA++
        else if (this.cells[j] === PA_SHADED) shadedA++
      }
      if (openA === 0) continue
      const remA = this.clues[a]! - shadedA
      for (const b of near[a]!) {
        if (this.clues[b]! < 0) continue
        if (this.overlap(a, blockA, remA, b)) {
          // Read again once the first steps have caught up.
          this.dirty[a] = 1
          this.tally.pairs++
          return true
        }
        if (this.broken) return false
      }
    }
    return false
  }

  private overlap(a: number, blockA: Int32Array, remA: number, b: number): boolean {
    const blockB = this.geo.block[b]!
    const ra = Math.floor(a / this.width)
    const ca = a % this.width
    const inA = (j: number) => Math.abs(Math.floor(j / this.width) - ra) <= 1 && Math.abs((j % this.width) - ca) <= 1
    const onlyA: number[] = []
    const onlyB: number[] = []
    const shared: number[] = []
    let shadedB = 0
    for (const j of blockA) {
      if (this.cells[j] !== PA_OPEN) continue
      if (blockB.includes(j)) shared.push(j)
      else onlyA.push(j)
    }
    for (const j of blockB) {
      const s = this.cells[j]
      if (s === PA_SHADED) shadedB++
      else if (s === PA_OPEN && !inA(j)) onlyB.push(j)
    }
    if (onlyB.length === 0 && onlyA.length === 0) return false
    const remB = this.clues[b]! - shadedB
    // How many of the shared open squares are shaded: at least what either number cannot place on its own squares, at most what either still needs.
    const lo = Math.max(0, remA - onlyA.length, remB - onlyB.length)
    const hi = Math.min(shared.length, remA, remB)
    if (lo > hi) {
      this.broken = true
      return false
    }
    const marks: [number[], number][] = []
    if (onlyA.length > 0 && remA - hi >= onlyA.length) marks.push([onlyA, PA_SHADED])
    if (onlyA.length > 0 && remA - lo <= 0) marks.push([onlyA, PA_BLANK])
    if (onlyB.length > 0 && remB - hi >= onlyB.length) marks.push([onlyB, PA_SHADED])
    if (onlyB.length > 0 && remB - lo <= 0) marks.push([onlyB, PA_BLANK])
    if (shared.length > 0 && lo === shared.length) marks.push([shared, PA_SHADED])
    if (shared.length > 0 && hi === 0) marks.push([shared, PA_BLANK])
    if (marks.length === 0) return false
    for (const [squares, value] of marks) for (const j of squares) this.mark(j, value)
    return true
  }

  /**
   * "What if": an open square beside one already known (where a reader
   * looks), shaded (then left blank) in pencil and followed by the earlier
   * steps; a way that breaks a number is crossed off and the square takes
   * the other. The search picks up after the last square it marked. True
   * when a square was marked.
   */
  private probe(): boolean {
    const { block } = this.geo
    const n = this.cells.length
    for (let step = 0; step < n; step++) {
      const i = (this.probeFrom + step) % n
      if (this.cells[i] !== PA_OPEN) continue
      let known = false
      let clued = false
      for (const k of block[i]!) {
        if (this.cells[k] !== PA_OPEN) known = true
        if (this.clues[k]! >= 0) clued = true
      }
      if (!known || !clued) continue
      for (const value of [PA_SHADED, PA_BLANK]) {
        if (this.leadsToBreak(i, value)) {
          this.mark(i, value === PA_SHADED ? PA_BLANK : PA_SHADED)
          this.tally.probe++
          this.probeFrom = i + 1
          return true
        }
      }
    }
    return false
  }

  private leadsToBreak(i: number, value: number): boolean {
    let trial = this.scratch
    if (!trial) {
      trial = new PaSolver({ width: this.width, height: this.height, clues: [] }, 'pairs')
      this.scratch = trial
    }
    trial.clues.set(this.clues)
    trial.cells.set(this.cells)
    trial.open = this.open
    trial.broken = false
    trial.queue.length = 0
    trial.queued.fill(0)
    // "Overlap" was worked out before any "what if": only numbers the pencil mark reaches need reading again.
    trial.dirty.fill(0)
    trial.mark(i, value)
    trial.run()
    return trial.broken
  }
}

/** Solves a grid by the rules given, from nothing marked. */
export function solvePa(p: PaPuzzle, rules: PaRules): PaSolveResult {
  const solver = new PaSolver(p, rules)
  solver.run()
  return { solved: solver.solved, broken: solver.broken, cells: solver.cells, tally: { ...solver.tally } }
}

/** A grid's marks as text, `#` shaded, `.` blank, `?` open, for comparing answers. */
export const paCellsText = (cells: ArrayLike<number>) => Array.from(cells, (s) => (s === PA_SHADED ? '#' : s === PA_BLANK ? '.' : '?')).join('')

/** A picture as the same text. */
export const paBitmapText = (bitmap: readonly boolean[]) => bitmap.map((on) => (on ? '#' : '.')).join('')

/* ------------------------------------------------------------------ *
 * A plain search, for tests: every answer, up to a limit
 * ------------------------------------------------------------------ */

/**
 * Every answer the numbers allow, up to `limit`: the first steps, then a
 * square tried both ways. Slow and blind, but it never reasons, so it checks
 * that the solver's "one answer" is true.
 */
export function paSolutions(p: PaPuzzle, limit = 2): string[] {
  const found: string[] = []
  const search = (cells: Int8Array) => {
    if (found.length >= limit) return
    const solver = PaSolver.resume(p, 'basic', cells)
    solver.run()
    if (solver.broken) return
    const next = solver.cells.indexOf(PA_OPEN)
    if (next < 0) {
      if (isPaSolution(p, Array.from(solver.cells, (s) => s === PA_SHADED))) found.push(paCellsText(solver.cells))
      return
    }
    for (const value of [PA_SHADED, PA_BLANK]) {
      const tried = Int8Array.from(solver.cells)
      tried[next] = value
      search(tried)
    }
  }
  search(new Int8Array(p.width * p.height).fill(PA_OPEN))
  return found
}

export const countPaSolutions = (p: PaPuzzle, limit = 2) => paSolutions(p, limit).length
