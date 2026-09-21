/** Axis-aligned block of cells, addressed by its top-left corner. */
export interface ShikakuRect {
  r: number
  c: number
  /** Height in cells. */
  h: number
  /** Width in cells. */
  w: number
}

/** The printed number — one per rectangle, sitting on a cell inside it. */
export interface ShikakuClue {
  r: number
  c: number
  /** Area of the rectangle this clue belongs to. */
  value: number
}

export interface ShikakuPuzzle {
  rows: number
  cols: number
  clues: ShikakuClue[]
  /** One rectangle per clue, in the same order. */
  solution: ShikakuRect[]
}

export type ShikakuDifficulty = 'easy' | 'medium' | 'hard'
