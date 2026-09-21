import type { StudioRng } from '../studio-rng'
import type { MagicDifficulty, MagicOrder, MagicPuzzle } from './types'
import { countBlanks } from './grid'
import { buildValuedSquare, type MagicMapping } from './values'
import { DIFF_BLANKS, carveBlanks } from './carve'
import { hashStudioFingerprint } from '../studio-content-fingerprint'

export interface BuildPuzzleOptions {
  order: MagicOrder
  difficulty: MagicDifficulty
  /** Page-level number bank — see `rollMapping`. */
  mapping: MagicMapping
  /** Hide the target from the page — then one line of givens must stay intact. */
  hideConstant: boolean
  /**
   * Grids already printed (this page or earlier in the book), as
   * `gridVarietyLabel(grid)`. A repeat is re-rolled so bulk sheets keep
   * distinct number layouts.
   */
  avoid?: ReadonlySet<string>
}

/** Below this the page is a table of numbers rather than a puzzle. */
const MIN_BLANKS = 2

const ATTEMPTS = 8

/** Compact grid id for the variety ledger (fits the 60-char label cap). */
export function gridVarietyLabel(grid: number[][]): string {
  const flat = grid.flat().join('.')
  return flat.length <= 60 ? flat : hashStudioFingerprint(flat)
}

/**
 * One ready-to-draw puzzle. Re-rolls the square when carving lands on a mask too
 * thin to be worth printing, or when the arrangement already appears on the page.
 */
export function buildMagicPuzzle(
  options: BuildPuzzleOptions,
  rng: StudioRng,
): MagicPuzzle {
  const { order, difficulty, mapping, hideConstant, avoid } = options
  const target = DIFF_BLANKS[order][difficulty]
  const floor = Math.min(target, MIN_BLANKS)

  let best: MagicPuzzle | null = null
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const square = buildValuedSquare(order, mapping, rng)
    const blank = carveBlanks(square.grid, order, target, rng, {
      constant: square.constant,
      operation: square.operation,
      keepOneLineIntact: hideConstant,
    })
    const puzzle: MagicPuzzle = { ...square, order, blank }
    const blanks = countBlanks(blank)
    const fresh = !avoid?.has(gridVarietyLabel(square.grid))
    if (blanks >= floor && fresh) return puzzle
    // Prefer a thick-enough mask over a merely-unseen one: a duplicate square
    // still reads as a puzzle, a near-empty mask does not.
    if (!best || blanks > countBlanks(best.blank)) best = puzzle
  }
  return best!
}
