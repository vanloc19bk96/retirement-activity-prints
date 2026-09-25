import type { LgClueKind } from './clues'
import type { LgLevelValue } from './content'
import type { LgShape } from './solver'

/**
 * What a level changes. Difficulty lives in the reasoning, not the type size:
 * every level is solved by deduction alone, and every level prints large.
 *
 * - Gentle: four people and two categories, plenty of plain "who did what"
 *   and "who did not" clues.
 * - Classic: four people and three categories, a real mix of clue types, at
 *   most two outright matches.
 * - Challenging: five people and three categories where the page allows it
 *   (four on small trims), led by either/or, pairs and exact order, with at
 *   most one outright match.
 */
export interface LgLevel {
  value: LgLevelValue
  label: string
  /** Largest first; the page planner takes the first one the trim can print. */
  shapes: readonly LgShape[]
  /** Relative odds of each clue kind being offered. */
  weights: Readonly<Record<LgClueKind, number>>
  /** Clues that match a named person to a value outright. */
  maxDirect: number
  /** Distinct clue kinds a finished puzzle must use. */
  minKinds: number
  /** Share of order clues that state an exact gap ("two months before"). */
  exactGapShare: number
  /** Share of clue references that name a person rather than describe one. */
  nameShare: number
  /** At least this many passes over the clues before the grid is full. */
  minRounds: number
}

export const LG_LEVELS: readonly LgLevel[] = [
  {
    value: 'gentle',
    label: 'Gentle',
    shapes: [{ n: 4, K: 2 }],
    weights: { same: 3, diff: 3, neither: 1.2, either: 1, pair: 0, order: 1.4 },
    maxDirect: 2,
    minKinds: 3,
    exactGapShare: 0,
    nameShare: 0.75,
    minRounds: 2,
  },
  {
    value: 'classic',
    label: 'Classic',
    shapes: [
      { n: 4, K: 3 },
      { n: 4, K: 2 },
    ],
    weights: { same: 2, diff: 2, neither: 1, either: 1.5, pair: 1, order: 2 },
    maxDirect: 2,
    minKinds: 4,
    exactGapShare: 0.35,
    nameShare: 0.6,
    minRounds: 3,
  },
  {
    value: 'challenging',
    label: 'Challenging',
    shapes: [
      { n: 5, K: 3 },
      { n: 4, K: 3 },
      { n: 4, K: 2 },
    ],
    weights: { same: 1, diff: 1.4, neither: 1, either: 2, pair: 1.6, order: 2.6 },
    maxDirect: 1,
    minKinds: 5,
    exactGapShare: 0.5,
    nameShare: 0.5,
    minRounds: 4,
  },
]

/**
 * What a finished puzzle of this shape must show. A two-category grid has too
 * few cells for the fullest mix a level asks of three.
 */
export function lgRequirements(level: LgLevel, shape: LgShape) {
  return {
    minKinds: shape.K === 2 ? Math.min(level.minKinds, 4) : level.minKinds,
    minRounds: shape.K === 2 ? Math.min(level.minRounds, 3) : level.minRounds,
  }
}

export const DEFAULT_LG_LEVEL: LgLevelValue = 'classic'

export function parseLgLevel(raw: unknown): LgLevel {
  return LG_LEVELS.find((level) => level.value === raw) ?? LG_LEVELS.find((l) => l.value === DEFAULT_LG_LEVEL)!
}
