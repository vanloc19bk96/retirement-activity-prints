import { WF_WEEKS, wfYearProblem } from './content'
import {
  BOX_MIN_LINES,
  DATE_LINE_MIN,
  IDEA_FONT_MIN,
  IDEA_TEXT_MIN,
  MAX_IDEA_LINES,
  NOTE_PITCH_MIN,
  boxLines,
  cardHeight,
  type FittedWfWeek,
  type WfPage,
  type WfPlan,
} from './layout'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

const joined = (lines: readonly string[]) => lines.join(' ').replace(/\s+/g, ' ')

/**
 * The last gate before a year is considered export-ready.
 *
 * Fit is already structural — pagination never places a card past its page —
 * so this re-proves it against the real weeks, then checks what a reader would
 * notice: a week missing, doubled or out of order, a week split from its
 * notes, an idea not fit to print or set differently from the one written,
 * the same idea twice, a year that leans on one kind of idea or on travel and
 * big budgets, too little room to write, or type and lines smaller than a
 * large-print book promises.
 */
export function runWfKdpPreflight(options: {
  weeks: readonly FittedWfWeek[]
  pages: readonly WfPage[]
  plan: WfPlan
  usable: (page: number) => number
}): KdpPreflightResult {
  const { weeks, pages, plan, usable } = options
  const errors: string[] = []
  const warnings: string[] = []
  const { metrics } = plan

  const content = wfYearProblem(weeks)
  if (content) errors.push(content)

  const cards = pages.flatMap((page) => page.blocks.flatMap((b) => (b.kind === 'card' ? [b] : [])))
  if (cards.length !== WF_WEEKS) errors.push(`The pages hold ${cards.length} weeks instead of ${WF_WEEKS}.`)
  if (cards.some((card, i) => card.week.week !== i + 1 || card.week !== weeks[i])) {
    errors.push('The pages do not print weeks 1 to 52 in order.')
  }

  for (const card of cards) {
    const { week } = card
    if (week.lines.length > Math.min(plan.ideaLines, MAX_IDEA_LINES)) {
      errors.push(`Week ${week.week} needs more lines than its card reserved.`)
    }
    if (joined(week.lines) !== week.idea) errors.push(`Week ${week.week} was set differently from the one written.`)
    if (card.lines < plan.minLines) errors.push(`Week ${week.week} has too little room for notes.`)
    if (card.height !== cardHeight(plan, card.lines)) errors.push(`Week ${week.week} is not drawn whole.`)
  }

  pages.forEach((page, index) => {
    if (!page.blocks.some((b) => b.kind === 'card')) errors.push(`Page ${index + 1} holds no week.`)
    const sorted = [...page.blocks].sort((a, b) => a.top - b.top)
    sorted.forEach((block, b) => {
      if (block.top < 0) errors.push(`Page ${index + 1} starts above its printable area.`)
      if (b > 0) {
        const prev = sorted[b - 1]!
        if (block.top < prev.top + prev.height) errors.push(`Page ${index + 1} has overlapping sections.`)
      }
      if (block.kind === 'box' && (block.lines < BOX_MIN_LINES || block.lines !== boxLines(metrics, block.height))) {
        errors.push('A reflection box has too little room to write.')
      }
    })
    const bottom = Math.max(...page.blocks.map((b) => b.top + b.height))
    if (bottom > usable(index)) errors.push(`Page ${index + 1} runs past the printable area.`)
  })
  if (pages[0]?.blocks[0]?.kind !== 'start') errors.push('The first page needs its start-date line.')

  if (metrics.font < IDEA_FONT_MIN) errors.push('Ideas must stay large print.')
  if (metrics.pitch < NOTE_PITCH_MIN) errors.push('Writing lines must stay far enough apart to write on.')
  if (plan.dateLineW < DATE_LINE_MIN) errors.push('The date line must stay long enough to write a date.')
  if (plan.innerWidth < IDEA_TEXT_MIN) errors.push('Ideas must stay wide enough to read.')

  return { ok: errors.length === 0, warnings, errors }
}
