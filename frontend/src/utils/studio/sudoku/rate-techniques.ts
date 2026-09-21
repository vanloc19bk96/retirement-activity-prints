import { BOX_DIMS, type SudokuSize } from './solver'

export interface SudokuRateState {
  size: number
  grid: number[]
  cands: number[]
  empty: number
  peers: number[][]
  units: number[][]
}

export function popcount(n: number): number {
  let count = 0
  while (n) {
    n &= n - 1
    count++
  }
  return count
}

export function bitOf(digit: number): number {
  return 1 << (digit - 1)
}

export function cellIndex(size: number, r: number, c: number): number {
  return r * size + c
}

function eliminateFromOthers(
  state: SudokuRateState,
  unit: number[],
  keep: Set<number>,
  mask: number,
): boolean {
  let changed = false
  for (const i of unit) {
    if (keep.has(i) || state.grid[i] !== 0) continue
    const next = state.cands[i] & ~mask
    if (next !== state.cands[i]) {
      if (next === 0) return false
      state.cands[i] = next
      changed = true
    }
  }
  return changed
}

function nakedPairs(state: SudokuRateState): boolean {
  let changed = false
  for (const unit of state.units) {
    const pairs: { idx: number; mask: number }[] = []
    for (const i of unit) {
      if (state.grid[i] === 0 && popcount(state.cands[i]) === 2) {
        pairs.push({ idx: i, mask: state.cands[i] })
      }
    }
    for (let a = 0; a < pairs.length; a++) {
      for (let b = a + 1; b < pairs.length; b++) {
        if (pairs[a].mask !== pairs[b].mask) continue
        const keep = new Set([pairs[a].idx, pairs[b].idx])
        if (eliminateFromOthers(state, unit, keep, pairs[a].mask)) changed = true
      }
    }
  }
  return changed
}

function hiddenPairs(state: SudokuRateState): boolean {
  let changed = false
  for (const unit of state.units) {
    const spotsOf: number[][] = Array.from({ length: state.size + 1 }, () => [])
    for (const i of unit) {
      if (state.grid[i] !== 0) continue
      for (let digit = 1; digit <= state.size; digit++) {
        if (state.cands[i] & bitOf(digit)) spotsOf[digit].push(i)
      }
    }
    for (let d1 = 1; d1 <= state.size; d1++) {
      if (spotsOf[d1].length !== 2) continue
      for (let d2 = d1 + 1; d2 <= state.size; d2++) {
        if (spotsOf[d2].length !== 2) continue
        if (spotsOf[d1][0] !== spotsOf[d2][0] || spotsOf[d1][1] !== spotsOf[d2][1]) continue
        const mask = bitOf(d1) | bitOf(d2)
        for (const i of spotsOf[d1]) {
          if (state.cands[i] !== mask) {
            state.cands[i] = mask
            changed = true
          }
        }
      }
    }
  }
  return changed
}

function pointing(state: SudokuRateState): boolean {
  const [boxW, boxH] = BOX_DIMS[state.size as SudokuSize]
  const size = state.size
  let changed = false
  const boxCount = (size / boxH) * (size / boxW)
  for (let b = 0; b < boxCount; b++) {
    const box = state.units[size * 2 + b]!
    for (let digit = 1; digit <= size; digit++) {
      const bit = bitOf(digit)
      const spots = box.filter((i) => state.grid[i] === 0 && (state.cands[i] & bit) !== 0)
      if (spots.length < 2) continue
      const rows = new Set(spots.map((i) => Math.floor(i / size)))
      const cols = new Set(spots.map((i) => i % size))
      if (rows.size === 1) {
        const row = [...rows][0]!
        if (eliminateFromOthers(state, state.units[row]!, new Set(box), bit)) changed = true
      }
      if (cols.size === 1) {
        const col = [...cols][0]!
        if (eliminateFromOthers(state, state.units[size + col]!, new Set(box), bit)) {
          changed = true
        }
      }
    }
  }
  return changed
}

function nakedTriples(state: SudokuRateState): boolean {
  let changed = false
  for (const unit of state.units) {
    const open = unit.filter(
      (i) => state.grid[i] === 0 && popcount(state.cands[i]) >= 2 && popcount(state.cands[i]) <= 3,
    )
    for (let a = 0; a < open.length; a++) {
      for (let b = a + 1; b < open.length; b++) {
        for (let c = b + 1; c < open.length; c++) {
          const union = state.cands[open[a]!] | state.cands[open[b]!] | state.cands[open[c]!]
          if (popcount(union) !== 3) continue
          const keep = new Set([open[a]!, open[b]!, open[c]!])
          if (eliminateFromOthers(state, unit, keep, union)) changed = true
        }
      }
    }
  }
  return changed
}

function xWing(state: SudokuRateState): boolean {
  const size = state.size
  let changed = false
  for (let digit = 1; digit <= size; digit++) {
    const bit = bitOf(digit)
    const rowCols: number[][] = []
    for (let r = 0; r < size; r++) {
      const cols: number[] = []
      for (let c = 0; c < size; c++) {
        const i = cellIndex(size, r, c)
        if (state.grid[i] === 0 && (state.cands[i] & bit) !== 0) cols.push(c)
      }
      rowCols.push(cols)
    }
    for (let r1 = 0; r1 < size; r1++) {
      if (rowCols[r1]!.length !== 2) continue
      for (let r2 = r1 + 1; r2 < size; r2++) {
        if (rowCols[r2]!.length !== 2) continue
        if (rowCols[r1]![0] !== rowCols[r2]![0] || rowCols[r1]![1] !== rowCols[r2]![1]) continue
        const [c1, c2] = rowCols[r1]!
        for (let r = 0; r < size; r++) {
          if (r === r1 || r === r2) continue
          for (const c of [c1!, c2!]) {
            const i = cellIndex(size, r, c)
            if (state.grid[i] !== 0 || (state.cands[i] & bit) === 0) continue
            const next = state.cands[i] & ~bit
            if (next === 0) return false
            state.cands[i] = next
            changed = true
          }
        }
      }
    }
  }
  return changed
}

export function applyClassicEliminations(state: SudokuRateState): boolean {
  return nakedPairs(state) || hiddenPairs(state) || pointing(state)
}

export function applyChallengeEliminations(state: SudokuRateState): boolean {
  return nakedTriples(state) || xWing(state)
}
