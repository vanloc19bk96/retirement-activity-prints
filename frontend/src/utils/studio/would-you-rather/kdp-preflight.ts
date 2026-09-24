import { wyrPairProblem, wyrPairsRepeat } from './content'
import { pairLines, type FittedWyrPair } from './fit'
import {
  MAX_OPTION_LINES,
  OPTION_FONT_MIN,
  OPTION_TEXT_MIN,
  REASON_ROW_MIN,
  blockHeight,
  type WyrPagePlan,
} from './layout'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

const joined = (lines: readonly string[]) => lines.join(' ').replace(/\s+/g, ' ')

/**
 * The last gate before a sheet is considered export-ready.
 *
 * Size and fit are already structural — the plan never lays out a block that
 * does not fit — so this re-proves them against the real questions, then
 * checks what a reader would notice: a choice that is not fit to print, the
 * same question twice on one page, or a choice set differently from the one
 * that was written.
 */
export function runWyrKdpPreflight(options: {
  pairs: readonly FittedWyrPair[]
  plan: WyrPagePlan
  fieldHeight: number
}): KdpPreflightResult {
  const { pairs, plan, fieldHeight } = options
  const errors: string[] = []
  const warnings: string[] = []

  if (pairs.length === 0) {
    return { ok: false, warnings, errors: ['No questions were laid out.'] }
  }
  if (pairs.length !== plan.count) {
    errors.push('The page holds a different number of questions than it was laid out for.')
  }

  const limit = Math.min(plan.optionLines, MAX_OPTION_LINES)
  pairs.forEach((pair, index) => {
    const problem = wyrPairProblem(pair)
    if (problem) errors.push(problem)
    if (pairs.slice(0, index).some((earlier) => wyrPairsRepeat(pair, earlier))) {
      errors.push('Two questions on this page ask the same thing.')
    }
    if (pairLines(pair) > limit) errors.push('A choice needs more lines than its box reserved.')
    if (joined(pair.linesA) !== pair.optionA || joined(pair.linesB) !== pair.optionB) {
      errors.push('A choice was set differently from the one written.')
    }
  })

  const stack =
    pairs.reduce((sum, pair) => sum + blockHeight(pairLines(pair), plan), 0) +
    (pairs.length - 1) * plan.metrics.blockGap
  if (stack > fieldHeight - plan.bottomGuard) errors.push('The questions do not fit on the page.')

  if (plan.metrics.font < OPTION_FONT_MIN) errors.push('Choices must stay large print.')
  if (plan.textWidth < OPTION_TEXT_MIN) errors.push('Choice boxes must stay wide enough to read.')
  if (plan.reasonLine && plan.metrics.reasonH < REASON_ROW_MIN) {
    errors.push('The writing line must stay tall enough to write on.')
  }

  return { ok: errors.length === 0, warnings, errors }
}
