import { toNonBreakingSpaces } from '../studio-layout'
import { measureBlockWidth, wrapSafeWidth, type FontSpec } from '../studio-text-metrics'
import type { TopFiveSet } from './content'
import { ANSWER_FONT_MIN, breakQuestion, type TopFivePagePlan } from './layout'

/** A set with its question already broken to the band it prints in. */
export interface FittedTopFiveSet extends TopFiveSet {
  questionLines: string[]
}

/** Answer written onto its line, a few pixels in from the start of the rule. */
export const ANSWER_INSET = 6

/** "1.  The morning commute" — one line, never soft-wrapped by Fabric. */
export function answerLineText(rank: number, answer: string): string {
  return toNonBreakingSpaces(`${rank + 1}.  ${answer}`)
}

function answersFitAt(set: TopFiveSet, size: number, plan: TopFivePagePlan, spec: FontSpec) {
  const room = wrapSafeWidth(plan.answerLineW - ANSWER_INSET, spec)
  return set.answers.every(
    (answer, rank) => measureBlockWidth(answerLineText(rank, answer), size, spec) <= room,
  )
}

/** Largest answer-page size, down to the floor, that keeps every answer on one line. */
function answerFontFor(set: TopFiveSet, plan: TopFivePagePlan, font: string): number | null {
  const spec = { fontFamily: font }
  for (let size = plan.metrics.textFont; size >= ANSWER_FONT_MIN; size--) {
    if (answersFitAt(set, size, plan, spec)) return size
  }
  return null
}

/**
 * Hold real questions to the page the form promised.
 *
 * Pitch, type sizes and question lines stay exactly as the worst-case plan set
 * them, so every page of a run matches. A set whose question breaks onto more
 * lines than reserved, or whose answer cannot sit on one answer line, is left
 * off and the next set takes its place. Only the count may fall — never the
 * type — and it never falls below one.
 */
export function fitTopFiveSets(
  sets: readonly TopFiveSet[],
  promised: TopFivePagePlan,
  font: string,
): { sets: FittedTopFiveSet[]; plan: TopFivePagePlan } | null {
  const chosen: FittedTopFiveSet[] = []
  let answerFont = promised.metrics.textFont

  for (const set of sets) {
    if (chosen.length >= promised.count) break
    const questionLines = breakQuestion(set.question, promised.metrics, promised.bandWidth, font)
    if (questionLines.length > promised.questionLines) continue
    const size = answerFontFor(set, promised, font)
    if (size == null) continue
    chosen.push({ ...set, questionLines })
    answerFont = Math.min(answerFont, size)
  }

  if (chosen.length === 0) return null
  return { sets: chosen, plan: { ...promised, count: chosen.length, answerFont } }
}
