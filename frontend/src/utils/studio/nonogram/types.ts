export type NonogramSize = 5 | 10 | 15 | 20

export type NonogramDifficulty = 'easy' | 'medium' | 'hard'

/**
 * Visual character of the pattern. Each style maps to a set of structural
 * families; `mixed` draws from all of them and is the production default.
 */
export type NonogramStyle = 'mixed' | 'symmetric' | 'geometric' | 'organic'

export const NONOGRAM_SIZES: readonly NonogramSize[] = [5, 10, 15, 20] as const

export const NONOGRAM_DIFFICULTIES: readonly NonogramDifficulty[] = [
  'easy',
  'medium',
  'hard',
] as const

export const NONOGRAM_STYLES: readonly NonogramStyle[] = [
  'mixed',
  'symmetric',
  'geometric',
  'organic',
] as const

/** true = filled */
export type Bitmap = boolean[][]

/** Solver-derived shape of a puzzle, used for tiering and quality gates. */
export interface NonogramMetrics {
  /** Share of cells that are filled. */
  density: number
  /** Longest clue list on any row — sets the left gutter width. */
  maxRowClueLen: number
  /** Longest clue list on any column — sets the top gutter height. */
  maxColClueLen: number
  /** Rows + columns whose clue is `[0]`. */
  emptyLines: number
  /** Full row+column sweeps line logic needed to finish the grid. */
  rounds: number
  /** Share of cells already forced after the first sweep. */
  openingRatio: number
  /** 0 (trivial) … 1 (demanding). Continuous input to the tier split. */
  score: number
}

export interface NonogramPuzzle {
  size: NonogramSize
  bitmap: Bitmap
  rowClues: number[][]
  colClues: number[][]
  /** Structural family that drew the bitmap (e.g. `blobs`, `mosaic`). */
  familyId: string
  /** Tier actually achieved — equals the requested tier unless relaxed. */
  difficulty: NonogramDifficulty
  metrics: NonogramMetrics
}

export interface SolveResult {
  count: number
  forcedOnly: boolean
}

/** Trace of a pure line-logic solve, used to tier a candidate puzzle. */
export interface LineSolveTrace {
  /** Line logic alone completed the grid — no guessing, and the solution is unique. */
  solved: boolean
  rounds: number
  /** Cells resolved after sweep 1. */
  openingCells: number
}
