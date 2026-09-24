import { PC_LETTERS, answerParts, formatPrice, isValidQuestion, type PriceCheckLevel } from './content'
import type { FittedPcQuestion } from './fit'
import { EXPLANATION_FONT_MIN, MAX_QUESTION_LINES, TEXT_FONT_MIN, type PcPagePlan } from './layout'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

const joined = (lines: readonly string[]) => lines.join(' ').replace(/\s+/g, ' ')

/**
 * The last gate before a sheet is considered export-ready.
 *
 * Fit is already structural, so this re-proves it, then checks what a reader
 * only finds with the book in hand: a price that is not the dataset's, a
 * right answer missing from its choices or listed twice, choices too close to
 * tell apart, an answer line naming the wrong letter or price, the same item
 * asked twice, or type below large print. Every one of those is a refund.
 */
export function runPcKdpPreflight(options: {
  questions: readonly FittedPcQuestion[]
  plan: PcPagePlan
  level: PriceCheckLevel
}): KdpPreflightResult {
  const { questions, plan, level } = options
  const errors: string[] = []
  const warnings: string[] = []

  if (questions.length === 0) return { ok: false, warnings, errors: ['No questions were laid out.'] }
  if (questions.length !== plan.count) {
    errors.push('The page holds a different number of questions than it was laid out for.')
  }

  questions.forEach((q, index) => {
    if (!isValidQuestion(q, level)) errors.push('A question does not match its verified price.')
    const letter = PC_LETTERS[q.correct]
    const price = formatPrice(q.fact.cents, q.dollars)
    if (!letter || !q.answer.startsWith(`${letter} — `) || !q.answer.includes(price)) {
      errors.push('An answer does not name its question’s letter and price.')
    }
    if (questions.slice(0, index).some((earlier) => earlier.fact.series.family === q.fact.series.family)) {
      errors.push('Two questions on this page ask about the same thing.')
    }
    if (q.questionLines.length === 0 || q.questionLines.length > MAX_QUESTION_LINES) {
      errors.push('A question needs more lines than the page allows.')
    }
    if (q.answerLines.length === 0 || q.answerLines.length > plan.answerLines) {
      errors.push('An answer needs more lines than the answer page allows.')
    }
    if (joined(q.questionLines) !== q.question) errors.push('A question was set differently from the one written.')
    if (joined(q.answerLines) !== answerParts(q.fact, q.dollars).join(' ')) {
      errors.push('An answer was set differently from the one written.')
    }
  })

  if (questions.reduce((sum, q) => sum + q.questionLines.length, 0) > plan.pageLines) {
    errors.push('The questions need more lines than the page reserved.')
  }
  if (questions.length >= 4 && new Set(questions.map((q) => q.correct)).size === 1) {
    warnings.push('Every answer on this page is the same letter.')
  }
  if (plan.metrics.font < TEXT_FONT_MIN || plan.metrics.explanationFont < EXPLANATION_FONT_MIN) {
    errors.push('Questions and answers must stay large print.')
  }

  return { ok: errors.length === 0, warnings, errors }
}
