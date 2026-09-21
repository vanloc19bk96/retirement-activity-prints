export type FutoshikiSize = 4 | 5 | 6 | 7
export type FutoshikiDifficulty = 'easy' | 'medium' | 'hard'
export type FutoshikiStyle = 'mixed' | 'pure'

export interface Cell {
  r: number
  c: number
}

/** `a relation b` as defined by the solution (open/wide side faces the larger value). */
export interface FutoshikiSign {
  a: Cell
  b: Cell
  relation: '<' | '>'
}

export interface FutoshikiPuzzle {
  size: FutoshikiSize
  givens: number[][]
  signs: FutoshikiSign[]
  solution: number[][]
}
