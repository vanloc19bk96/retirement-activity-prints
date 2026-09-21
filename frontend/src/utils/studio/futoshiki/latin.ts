import type { StudioRng } from '../studio-rng'
import type { Cell, FutoshikiSign } from './types'

export function emptyGrid(size: number): number[][] {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => 0))
}

export function range(from: number, toInclusive: number): number[] {
  const out: number[] = []
  for (let n = from; n <= toInclusive; n++) out.push(n)
  return out
}

export function allCells(size: number): Cell[] {
  const cells: Cell[] = []
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) cells.push({ r, c })
  }
  return cells
}

function usedInRow(grid: number[][], r: number, val: number, size: number): boolean {
  for (let c = 0; c < size; c++) {
    if (grid[r][c] === val) return true
  }
  return false
}

function usedInCol(grid: number[][], c: number, val: number, size: number): boolean {
  for (let r = 0; r < size; r++) {
    if (grid[r][c] === val) return true
  }
  return false
}

function fillLatin(grid: number[][], pos: number, n: number, rng: StudioRng): boolean {
  if (pos === n * n) return true
  const r = Math.floor(pos / n)
  const c = pos % n
  for (const v of rng.shuffle(range(1, n))) {
    if (!usedInRow(grid, r, v, n) && !usedInCol(grid, c, v, n)) {
      grid[r][c] = v
      if (fillLatin(grid, pos + 1, n, rng)) return true
      grid[r][c] = 0
    }
  }
  return false
}

export function generateLatinSquare(n: number, rng: StudioRng): number[][] {
  const grid = emptyGrid(n)
  if (!fillLatin(grid, 0, n, rng)) {
    throw new Error(`Latin square generation failed for ${n}×${n}`)
  }
  return grid
}

export function isLatinSquare(grid: number[][], n: number): boolean {
  for (let r = 0; r < n; r++) {
    const seen = new Set<number>()
    for (let c = 0; c < n; c++) {
      const v = grid[r][c]
      if (v < 1 || v > n || seen.has(v)) return false
      seen.add(v)
    }
  }
  for (let c = 0; c < n; c++) {
    const seen = new Set<number>()
    for (let r = 0; r < n; r++) {
      const v = grid[r][c]
      if (v < 1 || v > n || seen.has(v)) return false
      seen.add(v)
    }
  }
  return true
}

export function enumerateSigns(solution: number[][]): FutoshikiSign[] {
  const n = solution.length
  const signs: FutoshikiSign[] = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (c + 1 < n) {
        const va = solution[r][c]
        const vb = solution[r][c + 1]
        signs.push({
          a: { r, c },
          b: { r, c: c + 1 },
          relation: va < vb ? '<' : '>',
        })
      }
      if (r + 1 < n) {
        const va = solution[r][c]
        const vb = solution[r + 1][c]
        signs.push({
          a: { r, c },
          b: { r: r + 1, c },
          relation: va < vb ? '<' : '>',
        })
      }
    }
  }
  return signs
}

/** Glyph for a vertical pair: open/wide side faces the larger number. */
export function verticalSignGlyph(topIsLarger: boolean): '∨' | '∧' {
  // ∨ opens upward (faces top); ∧ opens downward (faces bottom).
  return topIsLarger ? '∨' : '∧'
}

export function signGlyph(sign: FutoshikiSign): string {
  const isHorizontal = sign.a.r === sign.b.r
  if (isHorizontal) return sign.relation
  const topIsLarger = sign.relation === '>'
  return verticalSignGlyph(topIsLarger)
}
