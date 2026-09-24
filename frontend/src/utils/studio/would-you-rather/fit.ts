import { orderForVariety, type WyrPair } from './content'
import { breakOption, type WyrPagePlan } from './layout'

/** A pair with both choices already broken to the box they print in. */
export interface FittedWyrPair extends WyrPair {
  linesA: string[]
  linesB: string[]
}

/**
 * Hold real questions to the page the form promised.
 *
 * Type size, boxes and reserved lines stay exactly as the worst-case plan set
 * them, so every page of a run matches. A pair with a choice that breaks onto
 * more lines than reserved is left off and the next takes its place. The pool
 * is walked in variety order, so a page mixes its sentence shapes and topics.
 * Only the count may fall — never the type — and never below one.
 */
export function fitWyrPairs(
  pairs: readonly WyrPair[],
  promised: WyrPagePlan,
  font: string,
): { pairs: FittedWyrPair[]; plan: WyrPagePlan } | null {
  const chosen: FittedWyrPair[] = []
  for (const pair of orderForVariety(pairs)) {
    if (chosen.length >= promised.count) break
    const linesA = breakOption(pair.optionA, promised, font)
    const linesB = breakOption(pair.optionB, promised, font)
    if (Math.max(linesA.length, linesB.length) > promised.optionLines) continue
    chosen.push({ ...pair, linesA, linesB })
  }
  if (chosen.length === 0) return null
  return { pairs: chosen, plan: { ...promised, count: chosen.length } }
}

/** Lines both boxes of one question reserve: the longer choice's. */
export const pairLines = (pair: FittedWyrPair) => Math.max(pair.linesA.length, pair.linesB.length)
