import type { Cage, Cell, Op } from './types'

export function applyOp(op: Op, digits: number[]): number {
  if (op === 'none') return digits[0]!
  if (op === 'add') return digits.reduce((sum, d) => sum + d, 0)
  if (op === 'mul') return digits.reduce((product, d) => product * d, 1)
  const sorted = [...digits].sort((a, b) => b - a)
  const a = sorted[0]!
  const b = sorted[1]!
  if (op === 'sub') return a - b
  return a / b
}

/** Digits in the same row or column within a cage must differ (Latin rule). */
function cageLocalOk(cells: Cell[], digits: number[]): boolean {
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      if (digits[i] !== digits[j]) continue
      if (cells[i]!.r === cells[j]!.r || cells[i]!.c === cells[j]!.c) return false
    }
  }
  return true
}

/**
 * All digit tuples for a cage that hit its target under its op and respect
 * intra-cage row/col uniqueness. Digits may repeat across different rows/cols.
 */
export function enumerateCombos(cage: Cage, n: number): number[][] {
  const k = cage.cells.length
  if (cage.op === 'none') return [[cage.target]]

  const combos: number[][] = []
  const digits = new Array<number>(k)

  function rec(i: number): void {
    if (i === k) {
      if (!cageLocalOk(cage.cells, digits)) return
      if (applyOp(cage.op, digits) === cage.target) combos.push([...digits])
      return
    }
    for (let d = 1; d <= n; d++) {
      digits[i] = d
      rec(i + 1)
    }
  }

  rec(0)
  return combos
}

interface CellRef {
  cageIndex: number
  offset: number
}

/**
 * Cap early — we only need to distinguish 1 vs >1 solutions.
 * Combo tables prune cages the same way humans reason about targets.
 */
export function countSolutions(n: number, cages: Cage[], cap: number): number {
  const cellRef: (CellRef | null)[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => null),
  )
  const combos: number[][][] = cages.map((cage, cageIndex) => {
    for (let offset = 0; offset < cage.cells.length; offset++) {
      const { r, c } = cage.cells[offset]!
      cellRef[r]![c] = { cageIndex, offset }
    }
    return enumerateCombos(cage, n)
  })

  if (combos.some((list) => list.length === 0)) return 0

  const grid = Array.from({ length: n }, () => Array.from({ length: n }, () => 0))
  const rowMask = Array.from({ length: n }, () => 0)
  const colMask = Array.from({ length: n }, () => 0)
  let count = 0

  function solve(): boolean {
    if (count >= cap) return true

    let bestR = -1
    let bestC = -1
    let bestCandidates: number[] | null = null

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (grid[r]![c] !== 0) continue
        const ref = cellRef[r]![c]!
        const seen = new Set<number>()
        const candidates: number[] = []
        for (const combo of combos[ref.cageIndex]!) {
          const v = combo[ref.offset]!
          if (seen.has(v)) continue
          seen.add(v)
          const bit = 1 << v
          if (rowMask[r]! & bit) continue
          if (colMask[c]! & bit) continue
          candidates.push(v)
        }
        if (candidates.length === 0) return false
        if (!bestCandidates || candidates.length < bestCandidates.length) {
          bestR = r
          bestC = c
          bestCandidates = candidates
          if (candidates.length === 1) break
        }
      }
      if (bestCandidates?.length === 1) break
    }

    if (!bestCandidates) {
      count++
      return count >= cap
    }

    const ref = cellRef[bestR]![bestC]!
    const prevCombos = combos[ref.cageIndex]!

    for (const v of bestCandidates) {
      const bit = 1 << v
      const nextCombos = prevCombos.filter((combo) => combo[ref.offset] === v)
      if (nextCombos.length === 0) continue

      grid[bestR]![bestC] = v
      rowMask[bestR]! |= bit
      colMask[bestC]! |= bit
      combos[ref.cageIndex] = nextCombos

      if (solve()) return true

      grid[bestR]![bestC] = 0
      rowMask[bestR]! &= ~bit
      colMask[bestC]! &= ~bit
      combos[ref.cageIndex] = prevCombos
    }

    return false
  }

  solve()
  return count
}
