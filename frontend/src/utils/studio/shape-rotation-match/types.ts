export type Format = 'same-different' | 'pick-matches'
export type Difficulty = 'easy' | 'medium' | 'hard'

export interface Cell {
  r: number
  c: number
}

/**
 * One connected block of cells plus a single filled accent cell.
 *
 * Drawn as a solid silhouette — one traced outline, hairline cell grid, black accent.
 * There is deliberately no per-cell motif: the old triangle / diamond / chevron tiles
 * broke the shape apart and were unreadable once printed.
 */
export interface Figure {
  cells: Cell[]
  accent: Cell
}

export interface Item {
  ref: Figure
  candidates: Figure[]
  /** same-different */
  answer?: 'SAME' | 'MIRROR'
  /** pick-matches */
  correctIndices?: number[]
}
