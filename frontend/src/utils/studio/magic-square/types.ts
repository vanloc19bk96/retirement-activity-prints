/** Grid sizes offered by the template. 6 is singly-even (LUX), the rest odd/doubly-even. */
export type MagicOrder = 3 | 4 | 5 | 6 | 7

export type MagicDifficulty = 'easy' | 'medium' | 'hard'

/**
 * How the 1…n² ranks of the constructed square map to printed numbers.
 * `normal`  — 1…n²
 * `shifted` — a consecutive run starting above 1 (same arithmetic, bigger numbers)
 * `step`    — an arithmetic progression (count by 2s…5s — heavier addition)
 * `mixed`   — two free value banks laid over the symbol layers, so the printed
 *             numbers are not a run at all and the line total is unconstrained
 * `multiply` — powers of two coprime bases, so every line shares a *product*
 */
export type MagicNumberSet = 'normal' | 'shifted' | 'step' | 'mixed' | 'multiply'

/** Which operation every line must agree on. */
export type MagicOperation = 'add' | 'multiply'

export interface MagicValuedSquare {
  operation: MagicOperation
  /** Printed cell values (already mapped off the base square). */
  grid: number[][]
  /** Line total for `add`, line product for `multiply`. */
  constant: number
  /** Names the number bank, e.g. “each number from 1 to 9”. */
  bankSentence: string
}

export interface MagicPuzzle extends MagicValuedSquare {
  order: MagicOrder
  blank: boolean[][]
}
