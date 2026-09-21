import type { MagicOperation } from './types'
import { lineCells, magicConstant } from './grid'

/**
 * Deterministic ceiling for the exact-uniqueness search so a pathological mask
 * can never stall the generate thread. Exceeding it is reported as "not proven
 * unique", which only ever makes carving more conservative.
 */
const UNIQUENESS_NODE_BUDGET = 200_000

/**
 * Solves the way the printed tip tells the solver to: repeatedly fill any line
 * that has exactly one blank left. Returns true when that alone finishes the
 * grid — i.e. the puzzle is fair for every number set, whether or not the
 * solver knows which numbers are in play.
 */
export function solvableByElimination(
  full: number[][],
  blank: boolean[][],
  n: number,
  constant: number,
  operation: MagicOperation,
): boolean {
  const known = full.map((row, r) => row.map((v, c) => (blank[r]![c] ? null : v)))
  const lines = lineCells(n)
  let remaining = 0
  for (const row of blank) {
    for (const cell of row) if (cell) remaining++
  }

  let progressed = true
  while (remaining > 0 && progressed) {
    progressed = false
    for (const line of lines) {
      let gap: { r: number; c: number } | null = null
      let total = operation === 'multiply' ? 1 : 0
      let gaps = 0
      for (const { r, c } of line) {
        const v = known[r]![c]
        if (v === null) {
          gaps++
          gap = { r, c }
          if (gaps > 1) break
        } else if (operation === 'multiply') total *= v
        else total += v
      }
      if (gaps !== 1 || !gap) continue
      const value = operation === 'multiply' ? constant / total : constant - total
      // A valid completion always exists, so this must land on the real value.
      if (value !== full[gap.r]![gap.c]!) return false
      known[gap.r]![gap.c] = value
      remaining--
      progressed = true
    }
  }
  return remaining === 0
}

/**
 * After placing `val` at (r,c), false if any completed line ≠ constant or any
 * partial line already ≥ constant (all values positive).
 */
function placementKeepsLines(
  grid: number[][],
  r: number,
  c: number,
  n: number,
  constant: number,
): boolean {
  const lines: { r: number; c: number }[][] = [
    Array.from({ length: n }, (_, col) => ({ r, c: col })),
    Array.from({ length: n }, (_, row) => ({ r: row, c })),
  ]
  if (r === c) {
    lines.push(Array.from({ length: n }, (_, i) => ({ r: i, c: i })))
  }
  if (r + c === n - 1) {
    lines.push(Array.from({ length: n }, (_, i) => ({ r: i, c: n - 1 - i })))
  }

  for (const line of lines) {
    let sum = 0
    let empty = 0
    for (const cell of line) {
      const v = grid[cell.r]![cell.c]!
      if (v === 0) empty++
      else sum += v
    }
    if (empty === 0) {
      if (sum !== constant) return false
    } else if (sum >= constant) {
      return false
    }
  }
  return true
}

/**
 * Count completions of `blank` consistent with the number set of `full` and the
 * magic-line constraints. Early-exits at `cap`; also stops at a fixed node
 * budget, returning `cap` (“at least cap”) so callers stay conservative.
 * Additive squares only — the multiplicative mode relies on elimination.
 */
export function countMagicSolutions(
  full: number[][],
  blank: boolean[][],
  n: number,
  cap: number,
): number {
  const constant = magicConstant(full, n)
  const grid = full.map((row, r) => row.map((v, c) => (blank[r]![c] ? 0 : v)))
  const blanks: { r: number; c: number }[] = []
  const available: number[] = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (blank[r]![c]) {
        blanks.push({ r, c })
        available.push(full[r]![c]!)
      }
    }
  }
  if (blanks.length === 0) return 1

  // Prefer cells on more lines first (center / diagonal) — stronger pruning.
  const lineHits = new Map<string, number>()
  for (const line of lineCells(n)) {
    for (const cell of line) {
      const key = `${cell.r},${cell.c}`
      lineHits.set(key, (lineHits.get(key) ?? 0) + 1)
    }
  }
  blanks.sort(
    (a, b) =>
      (lineHits.get(`${b.r},${b.c}`) ?? 0) - (lineHits.get(`${a.r},${a.c}`) ?? 0),
  )

  let count = 0
  let nodes = 0
  let exhausted = false
  const remaining = [...available]

  function search(idx: number): void {
    if (count >= cap) return
    if (nodes++ > UNIQUENESS_NODE_BUDGET) {
      exhausted = true
      return
    }
    if (idx === blanks.length) {
      count++
      return
    }
    const { r, c } = blanks[idx]!
    for (let i = 0; i < remaining.length; i++) {
      const val = remaining[i]!
      if (val === -1) continue
      grid[r]![c] = val
      if (placementKeepsLines(grid, r, c, n, constant)) {
        remaining[i] = -1
        search(idx + 1)
        remaining[i] = val
        if (count >= cap || exhausted) {
          grid[r]![c] = 0
          return
        }
      }
      grid[r]![c] = 0
    }
  }

  search(0)
  return exhausted ? Math.max(count, cap) : count
}
