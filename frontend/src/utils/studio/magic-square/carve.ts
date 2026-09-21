import type { StudioRng } from '../studio-rng'
import type { MagicDifficulty, MagicOperation, MagicOrder } from './types'
import { allCells, emptyMask, lineCells, magicConstant } from './grid'
import { solvableByElimination } from './solver'

/**
 * Target blank counts by order × difficulty.
 *
 * Every mask must survive line-by-line elimination, which caps blanks at the
 * 2n+2 line count — a line can only ever resolve its own last gap. These targets
 * sit just under that ceiling so each step of the ladder is reliably reachable.
 * Carving past it would mean masks that need the solver to search over which
 * numbers are left; that is both unfair on a printed page and, measured, 700 ms
 * to 7 s per puzzle to verify. Reach for a larger grid or a harder number set
 * instead — see `numberSet` in the template config.
 */
export const DIFF_BLANKS: Record<MagicOrder, Record<MagicDifficulty, number>> = {
  3: { easy: 3, medium: 4, hard: 5 },
  4: { easy: 5, medium: 7, hard: 8 },
  5: { easy: 7, medium: 9, hard: 11 },
  6: { easy: 9, medium: 11, hard: 13 },
  7: { easy: 11, medium: 13, hard: 15 },
}

export interface CarveOptions {
  /** Line total / product. Defaults to the row-0 sum. */
  constant?: number
  operation?: MagicOperation
  /**
   * Leave one whole line of givens intact so a solver who is not told the
   * target can read it straight off the page.
   */
  keepOneLineIntact?: boolean
}

/**
 * Blanks cells up to `targetBlanks` while the puzzle stays solvable by the
 * technique the worksheet teaches — fill any line that has a single gap. That
 * keeps the sheet fair for stepped and multiplicative sets too, where the solver
 * cannot fall back on “the numbers must be 1…n²”.
 *
 * Blanking is monotone — a mask that breaks the rule never recovers by blanking
 * more — so one greedy pass over a shuffled cell order is both correct and the
 * source of mask variety.
 */
export function carveBlanks(
  full: number[][],
  n: number,
  targetBlanks: number,
  rng: StudioRng,
  options: CarveOptions = {},
): boolean[][] {
  const constant = options.constant ?? magicConstant(full, n)
  const operation = options.operation ?? 'add'
  const blank = emptyMask(n)

  const offLimits = new Set<string>()
  if (options.keepOneLineIntact) {
    for (const { r, c } of rng.pick(lineCells(n))) offLimits.add(`${r},${c}`)
  }

  let count = 0
  for (const { r, c } of rng.shuffle(allCells(n))) {
    if (count >= targetBlanks) break
    if (offLimits.has(`${r},${c}`)) continue
    blank[r]![c] = true
    if (solvableByElimination(full, blank, n, constant, operation)) {
      count++
    } else {
      blank[r]![c] = false
    }
  }
  return blank
}
