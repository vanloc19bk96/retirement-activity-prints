/**
 * Picture Logic's proof: clues from a picture, and a reader's solve of them.
 *
 * A nonogram printed in a book is only fair if the clues lead to one picture
 * by reasoning alone. The reader works one row or column at a time: with what
 * is already shaded or crossed out, which squares must be shaded in every way
 * the clue could still fit, and which in none? This solver does exactly that
 * and nothing more — no guessing, no looking two lines ahead — and repeats
 * until nothing changes. A picture it finishes has exactly one answer (every
 * square was forced), and a reader can reach it the same way.
 */

/** One square's state while solving. */
export const UNKNOWN = -1
export const EMPTY = 0
export const FILLED = 1
export type Cell = typeof UNKNOWN | typeof EMPTY | typeof FILLED

/** A picture: rows of booleans (true = shaded). */
export type Bitmap = readonly (readonly boolean[])[]

/** The clue of one line: the lengths of its shaded runs, in order (empty = "0"). */
export type LineClue = readonly number[]

export interface Clues {
  rows: LineClue[]
  cols: LineClue[]
}

export function lineClue(line: readonly boolean[]): number[] {
  const out: number[] = []
  let run = 0
  for (const on of line) {
    if (on) run++
    else if (run > 0) {
      out.push(run)
      run = 0
    }
  }
  if (run > 0) out.push(run)
  return out
}

export function cluesOf(bitmap: Bitmap): Clues {
  const height = bitmap.length
  const width = bitmap[0]?.length ?? 0
  const rows = bitmap.map((row) => lineClue(row))
  const cols: number[][] = []
  for (let c = 0; c < width; c++) {
    const col: boolean[] = []
    for (let r = 0; r < height; r++) col.push(Boolean(bitmap[r]![c]))
    cols.push(lineClue(col))
  }
  return { rows, cols }
}

/**
 * Everything one line's clue says, given what is already known about it.
 *
 * Returns the line with every square that is shaded in all remaining
 * placements set FILLED and every square shaded in none set EMPTY; `null`
 * when no placement fits (a contradiction). Exact, by dynamic programming
 * over (square, run) — a line of 20 is a few hundred steps.
 */
export function solveLine(line: readonly Cell[], clue: LineClue): Cell[] | null {
  const n = line.length
  const k = clue.length
  // fits[i][j]: squares i.. can hold runs j.. (square i is free to start a run).
  const memo = new Int8Array((n + 2) * (k + 1)).fill(-1)
  const idx = (i: number, j: number) => i * (k + 1) + j
  const noneFilled = (from: number, to: number) => {
    for (let x = from; x < to; x++) if (line[x] === FILLED) return false
    return true
  }
  const runFits = (i: number, len: number) => {
    if (i + len > n) return false
    for (let x = i; x < i + len; x++) if (line[x] === EMPTY) return false
    return i + len === n || line[i + len] !== FILLED
  }
  const fits = (i: number, j: number): boolean => {
    if (i > n) i = n
    const key = idx(i, j)
    if (memo[key] !== -1) return memo[key] === 1
    let ok: boolean
    if (j === k) ok = noneFilled(i, n)
    else if (i >= n) ok = false
    else {
      ok = (line[i] !== FILLED && fits(i + 1, j)) || (runFits(i, clue[j]!) && fits(i + clue[j]! + 1, j + 1))
    }
    memo[key] = ok ? 1 : 0
    return ok
  }
  if (!fits(0, 0)) return null

  const canFill = new Uint8Array(n)
  const canEmpty = new Uint8Array(n)
  const seen = new Uint8Array((n + 2) * (k + 1))
  const stack: [number, number][] = [[0, 0]]
  while (stack.length) {
    let [i, j] = stack.pop()!
    if (i > n) i = n
    const key = idx(i, j)
    if (seen[key]) continue
    seen[key] = 1
    if (j === k) {
      for (let x = i; x < n; x++) canEmpty[x] = 1
      continue
    }
    if (i >= n) continue
    if (line[i] !== FILLED && fits(i + 1, j)) {
      canEmpty[i] = 1
      stack.push([i + 1, j])
    }
    const len = clue[j]!
    if (runFits(i, len) && fits(i + len + 1, j + 1)) {
      for (let x = i; x < i + len; x++) canFill[x] = 1
      if (i + len < n) canEmpty[i + len] = 1
      stack.push([i + len + 1, j + 1])
    }
  }

  const out: Cell[] = []
  for (let x = 0; x < n; x++) {
    if (canFill[x] && !canEmpty[x]) out.push(FILLED)
    else if (canEmpty[x] && !canFill[x]) out.push(EMPTY)
    else if (!canFill[x] && !canEmpty[x]) return null
    else out.push(line[x]!)
  }
  return out
}

export interface SolveResult {
  /** Every square decided, with no contradiction. */
  solved: boolean
  /** The grid as far as line-by-line reasoning got. */
  grid: Cell[][]
  /**
   * How many times a line had to be revisited after the first sweep — a
   * rough measure of how much back-and-forth the solve takes.
   */
  revisits: number
  /** Lines worked in all, first sweep included. */
  steps: number
}

/** Solve the clues one line at a time, as a reader would, until nothing changes. */
export function solveByLines(clues: Clues): SolveResult {
  const height = clues.rows.length
  const width = clues.cols.length
  const grid: Cell[][] = Array.from({ length: height }, () => Array<Cell>(width).fill(UNKNOWN))
  // Queue of lines to (re)work: rows are 0..h-1, columns h..h+w-1.
  const queued = new Uint8Array(height + width).fill(1)
  const queue: number[] = []
  for (let r = 0; r < height; r++) queue.push(r)
  for (let c = 0; c < width; c++) queue.push(height + c)
  let steps = 0
  let revisits = 0
  const firstSweep = height + width
  while (queue.length) {
    const line = queue.shift()!
    queued[line] = 0
    steps++
    if (steps > firstSweep) revisits++
    if (line < height) {
      const r = line
      const next = solveLine(grid[r]!, clues.rows[r]!)
      if (!next) return { solved: false, grid, revisits, steps }
      for (let c = 0; c < width; c++) {
        if (next[c] !== grid[r]![c]) {
          grid[r]![c] = next[c]!
          if (!queued[height + c]) (queued[height + c] = 1), queue.push(height + c)
        }
      }
    } else {
      const c = line - height
      const col = grid.map((row) => row[c]!)
      const next = solveLine(col, clues.cols[c]!)
      if (!next) return { solved: false, grid, revisits, steps }
      for (let r = 0; r < height; r++) {
        if (next[r] !== grid[r]![c]) {
          grid[r]![c] = next[r]!
          if (!queued[r]) (queued[r] = 1), queue.push(r)
        }
      }
    }
  }
  const solved = grid.every((row) => row.every((cell) => cell !== UNKNOWN))
  return { solved, grid, revisits, steps }
}

/** True when the clues lead, line by line, to exactly this picture. */
export function solvesTo(clues: Clues, bitmap: Bitmap): boolean {
  const result = solveByLines(clues)
  if (!result.solved) return false
  return result.grid.every((row, r) => row.every((cell, c) => (cell === FILLED) === Boolean(bitmap[r]![c])))
}
