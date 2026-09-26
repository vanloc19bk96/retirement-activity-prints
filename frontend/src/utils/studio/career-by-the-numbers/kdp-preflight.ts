import type { CareerNumbersDistance } from '@/types/studio-career-numbers.types'
import { cbnSetProblem } from './content'
import {
  BADGE_MIN,
  MAX_PROMPT_LINES,
  NUMBER_LINE_MIN,
  PROMPT_FONT_MIN,
  PROMPT_TEXT_MIN,
  ANSWER_ROW_MIN,
  rowHeight,
  unitWidth,
  type CbnPage,
  type CbnPlan,
  type FittedCbnQuestion,
} from './layout'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

const joined = (lines: readonly string[]) => lines.join(' ').replace(/\s+/g, ' ')

/**
 * The last gate before a set is considered export-ready.
 *
 * Fit is already structural — pagination never places a row past its page —
 * so this re-proves it against the real questions, then checks what a
 * retiree would notice: a question missing, numbered differently or out of
 * order, set differently from the one written or running past three lines, a
 * unit without room beside its line, a row split or overlapping another, the
 * motif row crowding the last question or leaving the page, a set that
 * repeats itself or leans on one kind of question, and type, writing lines or
 * rings smaller than a large-print book promises.
 */
export function runCbnKdpPreflight(options: {
  questions: readonly FittedCbnQuestion[]
  pages: readonly CbnPage[]
  plan: CbnPlan
  size: number
  distance: CareerNumbersDistance
  font: string
  /** The one writing-line length the set prints. */
  lineW: number
  /** Width of the printable column the rows are centred in. */
  columnWidth: number
  usable: (page: number) => number
}): KdpPreflightResult {
  const { questions, pages, plan, size, distance, font, lineW, columnWidth, usable } = options
  const errors: string[] = []
  const warnings: string[] = []
  const { metrics } = plan

  const content = cbnSetProblem(questions, size, distance)
  if (content) errors.push(content)

  const rowEnd = plan.lineOffset + lineW + metrics.labelGap
  for (const q of questions) {
    if (q.lines.length > MAX_PROMPT_LINES) errors.push(`Question ${q.number} runs too long to read at a glance.`)
    if (joined(q.lines) !== q.question) errors.push(`Question ${q.number} was set differently from the one written.`)
    if (q.height !== rowHeight(plan, q.lines.length)) errors.push(`Question ${q.number} is not drawn whole.`)
    if (rowEnd + unitWidth(q.unit, plan, font) > plan.columnWidth + 1) {
      errors.push(`The unit for question ${q.number} runs outside the printable area.`)
    }
  }

  const printed = pages.flatMap((page) => page.blocks.map((b) => b.question))
  if (printed.length !== questions.length || printed.some((q, i) => q !== questions[i])) {
    errors.push(`The pages do not print questions 1 to ${size} in order.`)
  }

  pages.forEach((page, index) => {
    if (page.blocks.length === 0) errors.push('The set has an empty page.')
    page.blocks.forEach((block, b) => {
      if (block.top < 0) errors.push('A question starts above the printable area.')
      const prev = page.blocks[b - 1]
      if (prev && block.top < prev.top + prev.height) errors.push('Two questions overlap.')
    })
    const bottom = Math.max(...page.blocks.map((b) => b.top + b.height))
    if (bottom > usable(index)) errors.push('A question runs past the printable area.')
    if (page.motifTop !== null) {
      if (index !== pages.length - 1) errors.push('The closing motif sits on the wrong page.')
      if (page.motifTop < bottom + metrics.labelGap) errors.push('The closing motif crowds the last question.')
      if (page.motifTop + metrics.motif > usable(index)) errors.push('The closing motif runs past the printable area.')
    }
  })

  if (plan.columnWidth > columnWidth) errors.push('The questions run wider than the printable area.')
  if (metrics.font < PROMPT_FONT_MIN) errors.push('Questions must stay large print.')
  if (metrics.rowH < ANSWER_ROW_MIN) errors.push('Writing lines need room above them for a number.')
  if (lineW < NUMBER_LINE_MIN) errors.push('Writing lines must stay long enough for a big number.')
  if (plan.textWidth < PROMPT_TEXT_MIN) errors.push('Questions must stay wide enough to read.')
  if (2 * metrics.badgeR < BADGE_MIN) errors.push('Question numbers must stay large enough to read.')
  if (plan.textOffset + plan.textWidth !== plan.columnWidth) errors.push('Question text runs outside its row.')

  return { ok: errors.length === 0, warnings, errors }
}
