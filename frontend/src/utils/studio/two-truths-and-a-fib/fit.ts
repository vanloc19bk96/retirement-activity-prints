import { TTF_LETTERS, placeTtfSets, ttfExplanation, type PlacedTtfSet, type TtfSet } from './content'
import {
  MAX_STATEMENT_LINES,
  breakExplanation,
  breakStatement,
  headingFits,
  setHeading,
  type TtfPagePlan,
} from './layout'

/** A placed set with every row and the correction already broken to its column. */
export interface FittedTtfSet extends PlacedTtfSet {
  /** One entry per row, in print order. */
  lines: string[][]
  explanationLines: string[]
}

/** The row lines and correction lines a set needs on this plan, or null when it will not fit. */
function measure(set: PlacedTtfSet, index: number, plan: TtfPagePlan, font: string) {
  if (!headingFits(setHeading(index, set.title), plan.metrics, plan.blockWidth, font)) return null
  const lines = set.statements.map((statement) => breakStatement(statement, plan, font))
  if (lines.some((row) => row.length > MAX_STATEMENT_LINES)) return null
  if (lines.reduce((sum, row) => sum + row.length, 0) > plan.setLines) return null
  const letter = TTF_LETTERS[set.fibIndex]!
  const explanationLines = breakExplanation(ttfExplanation(letter, set.fact), plan, font)
  if (explanationLines.length > plan.explanationLines) return null
  return { lines, explanationLines }
}

/**
 * Hold real sets to the page the form promised.
 *
 * Type sizes, the per-set line budget and the correction reserve stay exactly
 * as the worst-case plan set them, so every page of a run matches. A set whose
 * statements need more lines than its budget, or whose correction runs past
 * its reserve, is left off and the next set takes its place. Only the count
 * may fall — never the type — and it never falls below one.
 *
 * Sets are placed (fib letters dealt, truths shuffled) once the page's sets
 * are chosen, so the letters balance across exactly the sets that print.
 * Placement only reorders rows, which keeps the line budget unchanged, and the
 * correction is re-measured with the letter it will name.
 */
export function fitTtfSets(
  sets: readonly TtfSet[],
  promised: TtfPagePlan,
  font: string,
  seed: number,
): { sets: FittedTtfSet[]; plan: TtfPagePlan } | null {
  const chosen: TtfSet[] = []
  for (const set of sets) {
    if (chosen.length >= promised.count) break
    // Measured unplaced; placement below only reorders the same three rows.
    const [probe] = placeTtfSets([set], 0)
    if (measure(probe!, chosen.length, promised, font)) chosen.push(set)
  }
  if (chosen.length === 0) return null

  const fitted: FittedTtfSet[] = []
  placeTtfSets(chosen, seed).forEach((placed, index) => {
    const measured = measure(placed, index, promised, font)
    if (measured) fitted.push({ ...placed, ...measured })
  })
  if (fitted.length === 0) return null
  return { sets: fitted, plan: { ...promised, count: fitted.length } }
}
