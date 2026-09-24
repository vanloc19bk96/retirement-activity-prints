import { MAX_SAME_OPENER_PER_PAGE, itemsRepeat, openerKey, orderRjItems, type RjItem } from './content'
import {
  MAX_ANSWER_LINES,
  MAX_SETUP_LINES,
  breakAnswer,
  breakSetup,
  type RjPagePlan,
} from './layout'

/** An item with its setup and its answer already broken to the column. */
export interface FittedRjItem extends RjItem {
  setupLines: string[]
  answerLines: string[]
}

/**
 * Hold real items to the page the form promised.
 *
 * The type size and the page's line budget stay exactly as the worst-case
 * plan set them, so every page of a run matches. Items are taken in reading
 * order (riddles and jokes alternating), and one is passed over when its setup
 * needs more lines than a setup may use or than the page has left, when its
 * answer would run past two lines, when two setups on the page already open
 * the same way, or when it repeats an item already placed. Only the count may
 * fall — never the type — and it never falls below one.
 *
 * The answer page is drawn from the very same records, so each answer can only
 * ever sit under its own setup's number.
 */
export function fitRjItems(
  items: readonly RjItem[],
  promised: RjPagePlan,
  font: string,
  seed: number,
): { items: FittedRjItem[]; plan: RjPagePlan } | null {
  const fitted: FittedRjItem[] = []
  const openers = new Map<string, number>()
  let lines = 0

  for (const item of orderRjItems(items, seed)) {
    if (fitted.length >= promised.count) break
    const setupLines = breakSetup(item.setup, promised, font)
    const answerLines = breakAnswer(item.answer, promised, font)
    if (setupLines.length > MAX_SETUP_LINES || answerLines.length > MAX_ANSWER_LINES) continue
    if (lines + setupLines.length > promised.pageLines) continue
    const opener = openerKey(item.setup)
    if ((openers.get(opener) ?? 0) >= MAX_SAME_OPENER_PER_PAGE) continue
    if (fitted.some((kept) => itemsRepeat(item, kept))) continue
    openers.set(opener, (openers.get(opener) ?? 0) + 1)
    lines += setupLines.length
    fitted.push({ ...item, setupLines, answerLines })
  }

  if (fitted.length === 0) return null
  return { items: fitted, plan: { ...promised, count: fitted.length } }
}
