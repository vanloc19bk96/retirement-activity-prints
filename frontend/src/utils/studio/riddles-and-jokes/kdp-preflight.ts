import type { RiddlesJokesMix } from '@/types/studio-riddles-jokes.types'
import { MAX_SAME_OPENER_PER_PAGE, itemsRepeat, normalizeRjItem, openerKey } from './content'
import type { FittedRjItem } from './fit'
import { MAX_ANSWER_LINES, MAX_SETUP_LINES, TEXT_FONT_MIN, type RjPagePlan } from './layout'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

const joined = (lines: readonly string[]) => lines.join(' ').replace(/\s+/g, ' ')

/**
 * The last gate before a sheet is considered export-ready.
 *
 * Fit is already structural — the plan never lays out an item that does not
 * fit — so this re-proves it, then checks what a reader only finds with the
 * book in hand: an item without a question or an answer, an answer set
 * differently from the one written, the same joke twice, a page of setups that
 * all open alike, a joke on a riddles-only page, or type that fell below large
 * print.
 *
 * Every one of those is a refund, so none of them may print.
 */
export function runRjKdpPreflight(options: {
  items: readonly FittedRjItem[]
  plan: RjPagePlan
  mix: RiddlesJokesMix
}): KdpPreflightResult {
  const { items, plan, mix } = options
  const errors: string[] = []
  const warnings: string[] = []

  if (items.length === 0) return { ok: false, warnings, errors: ['No riddles or jokes were laid out.'] }
  if (items.length !== plan.count) {
    errors.push('The page holds a different number of items than it was laid out for.')
  }

  const openers = new Map<string, number>()
  items.forEach((item, index) => {
    // Re-gate the whole item as the service returned it: shape, wording, kind.
    const again = normalizeRjItem({ ...item, verified: true }, mix)
    if (!again || again.setup !== item.setup || again.answer !== item.answer || again.kind !== item.kind) {
      errors.push('An item is not suitable for a published activity book.')
    }
    if (items.slice(0, index).some((earlier) => itemsRepeat(item, earlier))) {
      errors.push('Two items on this page repeat the same joke or answer.')
    }
    const opener = openerKey(item.setup)
    openers.set(opener, (openers.get(opener) ?? 0) + 1)

    if (item.setupLines.length === 0 || item.setupLines.length > MAX_SETUP_LINES) {
      errors.push('A question needs more lines than the page allows.')
    }
    if (item.answerLines.length === 0 || item.answerLines.length > MAX_ANSWER_LINES) {
      errors.push('An answer needs more lines than the answer page allows.')
    }
    if (joined(item.setupLines) !== item.setup) errors.push('A question was set differently from the one written.')
    if (joined(item.answerLines) !== item.answer) errors.push('An answer was set differently from the one written.')
  })

  if ([...openers.values()].some((n) => n > MAX_SAME_OPENER_PER_PAGE)) {
    errors.push('Too many questions on this page start the same way.')
  }
  if (items.reduce((sum, item) => sum + item.setupLines.length, 0) > plan.pageLines) {
    errors.push('The questions need more lines than the page reserved.')
  }
  if (mix === 'both' && items.length >= 4 && new Set(items.map((item) => item.kind)).size === 1) {
    warnings.push('This page holds only one kind of item.')
  }
  if (plan.metrics.font < TEXT_FONT_MIN) errors.push('Questions and answers must stay large print.')

  return { ok: errors.length === 0, warnings, errors }
}
