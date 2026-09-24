import { eonStatementProblem, statementsRepeat } from './content'
import type { FittedEonStatement } from './fit'
import {
  MAX_STATEMENT_LINES,
  STATEMENT_FONT_MIN,
  STATEMENT_TEXT_MIN,
  STORY_ROW_MIN,
  rowHeight,
  tallyHeight,
  type EonPagePlan,
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
 * Size and fit are already structural — the plan never lays out a row that
 * does not fit — so this re-proves them against the real statements, then
 * checks what a reader would notice: a statement that is not fit to print,
 * the same experience twice on one page, or a statement set differently from
 * the one that was written.
 */
export function runEonKdpPreflight(options: {
  items: readonly FittedEonStatement[]
  plan: EonPagePlan
  fieldHeight: number
}): KdpPreflightResult {
  const { items, plan, fieldHeight } = options
  const errors: string[] = []
  const warnings: string[] = []

  if (items.length === 0) {
    return { ok: false, warnings, errors: ['No statements were laid out.'] }
  }
  if (items.length !== plan.count) {
    errors.push('The page holds a different number of statements than it was laid out for.')
  }

  const limit = Math.min(plan.statementLines, MAX_STATEMENT_LINES)
  items.forEach((item, index) => {
    const problem = eonStatementProblem(item)
    if (problem) errors.push(problem)
    if (items.slice(0, index).some((earlier) => statementsRepeat(item.statement, earlier.statement))) {
      errors.push('Two statements on this page ask about the same thing.')
    }
    if (item.lines.length > limit) errors.push('A statement needs more lines than its row reserved.')
    if (joined(item.lines) !== item.statement) {
      errors.push('A statement was set differently from the one written.')
    }
  })

  const stack =
    items.reduce((sum, item) => sum + rowHeight(item.lines.length, plan), 0) +
    tallyHeight(plan.metrics)
  if (stack > fieldHeight - plan.bottomGuard) errors.push('The statements do not fit on the page.')

  if (plan.metrics.font < STATEMENT_FONT_MIN) errors.push('Statements must stay large print.')
  if (plan.textWidth < STATEMENT_TEXT_MIN) errors.push('Statements must stay wide enough to read.')
  if (plan.storyLine && plan.metrics.storyH < STORY_ROW_MIN) {
    errors.push('The story line must stay tall enough to write on.')
  }

  return { ok: errors.length === 0, warnings, errors }
}
