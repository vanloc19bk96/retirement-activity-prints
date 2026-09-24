import {
  TTF_LETTERS,
  TTF_STATEMENTS_PER_SET,
  normalizeTtfSet,
  setsRepeatEachOther,
  ttfExplanation,
  type TtfSet,
} from './content'
import type { FittedTtfSet } from './fit'
import {
  EXPLANATION_FONT_MIN,
  MAX_STATEMENT_LINES,
  STATEMENT_FONT_MIN,
  headingFits,
  setHeading,
  type TtfPagePlan,
} from './layout'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

const joined = (lines: readonly string[]) => lines.join(' ').replace(/\s+/g, ' ')

/** The set a placed set was built from, so it can be re-gated whole. */
function unplaced(set: FittedTtfSet): TtfSet | null {
  if (set.statements.length !== TTF_STATEMENTS_PER_SET) return null
  if (!Number.isInteger(set.fibIndex) || set.fibIndex < 0 || set.fibIndex >= TTF_STATEMENTS_PER_SET) {
    return null
  }
  const truths = set.statements.filter((_, i) => i !== set.fibIndex)
  return { title: set.title, truths: [truths[0]!, truths[1]!], fib: set.statements[set.fibIndex]!, fact: set.fact }
}

/**
 * The last gate before a sheet is considered export-ready.
 *
 * Fit is already structural — the plan never lays out a set that does not fit
 * — so this re-proves it, then checks what a reader only finds with a pencil
 * in hand: a set without exactly one fib, a key that names a different letter
 * than the ring marks, a correction that is not about the fib, the same
 * puzzle printed twice, or type that fell below large print.
 *
 * Every one of those is a refund, so none of them may print.
 */
export function runTtfKdpPreflight(options: {
  sets: readonly FittedTtfSet[]
  plan: TtfPagePlan
  font: string
}): KdpPreflightResult {
  const { sets, plan, font } = options
  const errors: string[] = []
  const warnings: string[] = []

  if (sets.length === 0) return { ok: false, warnings, errors: ['No puzzles were laid out.'] }
  if (sets.length !== plan.count) {
    errors.push('The page holds a different number of puzzles than it was laid out for.')
  }

  const kept: TtfSet[] = []
  sets.forEach((set, index) => {
    const source = unplaced(set)
    if (!source) {
      errors.push('A puzzle does not have exactly three statements and one fib.')
      return
    }
    // Re-gate the whole set as the service returned it: shape, wording, and
    // the correction's tie to the fib.
    const again = normalizeTtfSet({ ...source, truths: [...source.truths], verified: true })
    if (
      !again ||
      again.title !== source.title ||
      again.fib !== source.fib ||
      again.fact !== source.fact ||
      again.truths.some((truth, i) => truth !== source.truths[i])
    ) {
      errors.push('A puzzle is not suitable for a published activity book.')
    }
    if (kept.some((earlier) => setsRepeatEachOther(source, earlier))) {
      errors.push('Two puzzles on this page repeat the same fact.')
    }
    kept.push(source)

    if (set.lines.length !== TTF_STATEMENTS_PER_SET) errors.push('A puzzle row is missing.')
    set.lines.forEach((lines, r) => {
      if (lines.length > MAX_STATEMENT_LINES) errors.push('A statement needs more lines than its row allows.')
      if (joined(lines) !== set.statements[r]) errors.push('A statement was set differently from the one written.')
    })
    if (set.lines.reduce((sum, lines) => sum + lines.length, 0) > plan.setLines) {
      errors.push('A puzzle needs more lines than it reserved.')
    }
    const expected = ttfExplanation(TTF_LETTERS[set.fibIndex]!, set.fact)
    if (joined(set.explanationLines) !== expected) {
      errors.push('An answer does not name the fib that is marked.')
    }
    if (set.explanationLines.length > plan.explanationLines) {
      errors.push('An answer needs more lines than the answer page reserved.')
    }
    if (!headingFits(setHeading(index, set.title), plan.metrics, plan.blockWidth, font)) {
      errors.push('A puzzle title does not fit on one line.')
    }
  })

  if (sets.length >= TTF_STATEMENTS_PER_SET) {
    const letters = new Set(sets.map((set) => set.fibIndex))
    if (letters.size === 1) warnings.push('Every fib on this page sits at the same letter.')
  }
  if (plan.metrics.font < STATEMENT_FONT_MIN) errors.push('Statements must stay large print.')
  if (plan.metrics.explanationFont < EXPLANATION_FONT_MIN) errors.push('Answers must stay readable.')

  return { ok: errors.length === 0, warnings, errors }
}
