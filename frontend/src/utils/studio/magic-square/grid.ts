import type { MagicOperation } from './types'

export interface Cell {
  r: number
  c: number
}

export function emptyMask(n: number): boolean[][] {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => false))
}

export function allCells(n: number): Cell[] {
  const cells: Cell[] = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) cells.push({ r, c })
  }
  return cells
}

export function countBlanks(blank: boolean[][]): number {
  let n = 0
  for (const row of blank) {
    for (const cell of row) {
      if (cell) n++
    }
  }
  return n
}

/** The 2n+2 lines that must agree: every row, every column, both diagonals. */
export function lineCells(n: number): Cell[][] {
  const lines: Cell[][] = []
  for (let r = 0; r < n; r++) {
    lines.push(Array.from({ length: n }, (_, c) => ({ r, c })))
  }
  for (let c = 0; c < n; c++) {
    lines.push(Array.from({ length: n }, (_, r) => ({ r, c })))
  }
  lines.push(Array.from({ length: n }, (_, i) => ({ r: i, c: i })))
  lines.push(Array.from({ length: n }, (_, i) => ({ r: i, c: n - 1 - i })))
  return lines
}

/** Sum every line hits in a *normal* square of order n (values 1…n²). */
export function normalConstant(n: number): number {
  return (n * (n * n + 1)) / 2
}

/** Magic constant from an actual completed square (row-0 sum). */
export function magicConstant(sq: number[][], _n: number): number {
  return sq[0]!.reduce((sum, v) => sum + v, 0)
}

/** Line product of a completed multiplicative square (row-0 product). */
export function magicProduct(sq: number[][]): number {
  return sq[0]!.reduce((product, v) => product * v, 1)
}

export function lineTotal(values: number[], operation: MagicOperation): number {
  return operation === 'multiply'
    ? values.reduce((product, v) => product * v, 1)
    : values.reduce((sum, v) => sum + v, 0)
}

/** True when every row, column and diagonal agrees under `operation`. */
export function isMagicUnder(
  sq: number[][],
  n: number,
  operation: MagicOperation,
): boolean {
  const target = lineTotal(sq[0]!, operation)
  for (const line of lineCells(n)) {
    if (lineTotal(line.map(({ r, c }) => sq[r]![c]!), operation) !== target) return false
  }
  return true
}

/** Additive magic check — the classic sense of the word. */
export function isMagic(sq: number[][], n: number): boolean {
  return isMagicUnder(sq, n, 'add')
}

/** True when the square uses each of 1…n² exactly once. */
export function isPermutationOfRange(sq: number[][], n: number): boolean {
  const seen = new Uint8Array(n * n + 1)
  for (const row of sq) {
    for (const v of row) {
      if (!Number.isInteger(v) || v < 1 || v > n * n || seen[v]) return false
      seen[v] = 1
    }
  }
  return true
}

export function allValuesDistinct(sq: number[][]): boolean {
  const seen = new Set<number>()
  for (const row of sq) {
    for (const v of row) {
      if (seen.has(v)) return false
      seen.add(v)
    }
  }
  return true
}

export function cloneSquare(sq: number[][]): number[][] {
  return sq.map((row) => [...row])
}
