import { oaSetProblem } from './content'
import {
  AWARD_FONT_MIN,
  AWARD_TEXT_MIN,
  BADGE_MIN,
  MAX_AWARD_LINES,
  NAME_LINE_MIN,
  ROW_PITCH_MIN,
  badgeHeight,
  cardHeight,
  type FittedOaAward,
  type OaPage,
  type OaPlan,
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
 * Fit is already structural — pagination never places a card past its page
 * — so this re-proves it against the real awards, then checks what a coworker
 * would notice: an award missing, numbered differently or out of order, a
 * title set differently from the one written or running to a third line, a
 * card split or overlapping another, a set that repeats itself or leans on
 * one kind of joke, and type, writing lines or badges smaller than a
 * large-print book promises.
 */
export function runOaKdpPreflight(options: {
  awards: readonly FittedOaAward[]
  pages: readonly OaPage[]
  plan: OaPlan
  size: number
  /** Width of the printable column the cards are centred in. */
  columnWidth: number
  usable: (page: number) => number
}): KdpPreflightResult {
  const { awards, pages, plan, size, columnWidth, usable } = options
  const errors: string[] = []
  const warnings: string[] = []
  const { metrics } = plan

  const content = oaSetProblem(awards, size)
  if (content) errors.push(content)

  for (const a of awards) {
    if (a.lines.length > MAX_AWARD_LINES) errors.push(`Award ${a.number} runs too long to read at a glance.`)
    if (joined(a.lines) !== a.display) errors.push(`Award ${a.number} was set differently from the one written.`)
    if (a.height !== cardHeight(plan, a.lines.length)) errors.push(`Award ${a.number} is not drawn whole.`)
  }

  const printed = pages.flatMap((page) => page.blocks.map((b) => b.award))
  if (printed.length !== awards.length || printed.some((a, i) => a !== awards[i])) {
    errors.push(`The pages do not print awards 1 to ${size} in order.`)
  }

  pages.forEach((page, index) => {
    if (page.blocks.length === 0) errors.push('The set has an empty page.')
    page.blocks.forEach((block, b) => {
      if (block.top < 0) errors.push('An award starts above the printable area.')
      const prev = page.blocks[b - 1]
      if (prev && block.top < prev.top + prev.height) errors.push('Two awards overlap.')
    })
    const bottom = Math.max(...page.blocks.map((b) => b.top + b.height))
    if (bottom > usable(index)) errors.push('An award runs past the printable area.')
  })

  if (plan.cardWidth > columnWidth) errors.push('The awards run wider than the printable area.')
  if (metrics.font < AWARD_FONT_MIN) errors.push('Awards must stay large print.')
  if (metrics.rowH < ROW_PITCH_MIN) errors.push('Writing lines must stay far enough apart to write on.')
  if (plan.lineW < NAME_LINE_MIN) errors.push('Winner lines must stay long enough to write a name.')
  if (plan.textWidth < AWARD_TEXT_MIN) errors.push('Awards must stay wide enough to read.')
  if (2 * metrics.badgeR < BADGE_MIN) errors.push('Award badges must stay large enough to read.')
  if (plan.textOffset + plan.textWidth + metrics.padX !== plan.cardWidth) errors.push('Award text runs outside its card.')
  if (awards.some((a) => a.height - 2 * metrics.padY < badgeHeight(metrics))) {
    errors.push('An award badge runs outside its card.')
  }

  return { ok: errors.length === 0, warnings, errors }
}
