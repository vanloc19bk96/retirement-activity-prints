import type { Box } from '../studio-layout'
import { hugTextBoxWidth } from '../studio-text-metrics'
import { RN_MONTHS, rnTableProblem, type RnExample, type RnTable } from './content'
import { rnSpacing, spacedHeight } from './draw'
import { NAME_FONT_MIN, exampleLines, plainSpec, type RnPagePlan } from './layout'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

/** The example has to be a real lookup on this page's own table. */
function exampleProblem(example: RnExample, table: RnTable, plan: RnPagePlan): string | null {
  const month = RN_MONTHS.findIndex((name) => example.lead.endsWith(`born in ${name}`))
  const letter = example.result.charAt(0)
  const first = table.letters.find((entry) => entry.key === letter)?.name
  const person = /^Example: (\w+),/.exec(example.lead)?.[1] ?? ''
  if (month < 0 || !first || !person.startsWith(letter)) {
    return 'The example does not match the tables on this page.'
  }
  const expected = `${letter} + ${plan.monthLabels[month]} = ${first} ${table.months[month]!.name}`
  return example.result === expected ? null : 'The example does not match the tables on this page.'
}

/**
 * The last gate before a sheet is considered export-ready.
 *
 * Fit is already structural — the plan never lays out a table that does not
 * fit — so this re-proves it against the real names, then checks what a reader
 * would notice: a missing or doubled letter or month, a name not fit to print,
 * two names too alike, a name wider than its column, or an example that does
 * not match the tables.
 */
export function runRnKdpPreflight(options: {
  table: RnTable
  plan: RnPagePlan
  example: RnExample | null
  field: Box
  font: string
}): KdpPreflightResult {
  const { table, plan, example, field, font } = options
  const errors: string[] = []
  const warnings: string[] = []

  const problem = rnTableProblem(table)
  if (problem) errors.push(problem)

  const plain = plainSpec(font)
  const fits = (name: string, width: number) =>
    hugTextBoxWidth(name, plan.metrics.font, Infinity, plain) <= width
  if (!table.letters.every((entry) => fits(entry.name, plan.letters.valueW))) {
    errors.push('A first name is wider than its column.')
  }
  if (!table.months.every((entry) => fits(entry.name, plan.months.valueW))) {
    errors.push('A last name is wider than its column.')
  }

  if (plan.example) {
    if (!example) {
      errors.push('The worked example is missing.')
    } else {
      const exampleIssue = exampleProblem(example, table, plan)
      if (exampleIssue) errors.push(exampleIssue)
      const lines = exampleLines(example, { metrics: plan.metrics, example: plan.example }, font)
      if (
        lines.lead.length > plan.example.leadLines ||
        lines.result.length > plan.example.resultLines
      ) {
        errors.push('The worked example needs more lines than its box reserved.')
      }
    }
  }

  if (plan.blockWidth > field.width) errors.push('The tables are wider than the page.')
  const height = spacedHeight(plan, rnSpacing(plan, field.height))
  if (height > field.height - plan.metrics.bottomGuard) errors.push('The tables do not fit on the page.')
  if (plan.metrics.font < NAME_FONT_MIN) errors.push('Names must stay large enough to read.')

  return { ok: errors.length === 0, warnings, errors }
}
