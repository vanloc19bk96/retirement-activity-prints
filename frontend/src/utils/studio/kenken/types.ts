export type KenkenSize = 4 | 5 | 6 | 7 | 9
export type KenkenDifficulty = 'easy' | 'medium' | 'hard'
export type KenkenOperations = 'addmul' | 'all'

export type Op = 'add' | 'sub' | 'mul' | 'div' | 'none'

export interface Cell {
  r: number
  c: number
}

export interface Cage {
  cells: Cell[]
  op: Op
  target: number
}

export interface CalcudokuPuzzle {
  size: KenkenSize
  cages: Cage[]
  solution: number[][]
  /** Cage index per cell — parallel to the grid. */
  cageOf: number[][]
}
