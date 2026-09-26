import type { Box } from '../studio-layout'
import { rdTableProblem, type RdTable } from './content'
import { rdSpacing, spacedHeight } from './draw'
import {
  ACTIVITY_FONT_MIN,
  DIE_MIN,
  breakActivity,
  rdRowLines,
  writeInWidth,
  type RdPagePlan,
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
 * Fit is already structural — the plan never lays out a table that does not
 * fit — so this re-proves it against the real activities, then checks what a
 * reader would notice: a missing or doubled die face, an activity not fit to
 * print or set differently from the one written, two activities that would
 * make some day do the same thing twice, a side short of variety, or type and
 * dice smaller than a large-print book promises.
 */
export function runRdKdpPreflight(options: {
  table: RdTable
  plan: RdPagePlan
  field: Box
  font: string
}): KdpPreflightResult {
  const { table, plan, field, font } = options
  const errors: string[] = []
  const warnings: string[] = []

  const problem = rdTableProblem(table)
  if (problem) errors.push(problem)

  for (const entry of [...table.morning, ...table.afternoon]) {
    const lines = breakActivity(entry.activity, plan, font)
    if (lines.length > plan.lines) errors.push('An idea needs more lines than its row reserved.')
    if (joined(lines) !== entry.activity) errors.push('An idea was set differently from the one written.')
  }

  if (plan.blockWidth > field.width) errors.push('The tables are wider than the page.')
  const spacing = rdSpacing(plan, rdRowLines(table, plan, font), field.height)
  if (spacedHeight(plan, spacing) > field.height - plan.metrics.bottomGuard) {
    errors.push('The tables do not fit on the page.')
  }
  if (plan.metrics.font < ACTIVITY_FONT_MIN) errors.push('Ideas must stay large print.')
  if (plan.metrics.die < DIE_MIN) errors.push('Die faces must stay large enough to count at a glance.')
  if (plan.writeIn && writeInWidth(plan.metrics, font) > plan.blockWidth) {
    errors.push('The write-in line is wider than the page.')
  }

  return { ok: errors.length === 0, warnings, errors }
}
