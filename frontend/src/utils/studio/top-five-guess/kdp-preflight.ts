import { measureBlockWidth, wrapSafeWidth } from '../studio-text-metrics'
import {
  TOP_FIVE_ANSWER_COUNT,
  TOP_FIVE_MAX_SCORE,
  TOP_FIVE_POINTS,
  setsRepeatEachOther,
  topFiveSetProblem,
} from './content'
import { ANSWER_INSET, answerLineText, type FittedTopFiveSet } from './fit'
import {
  ANSWER_FONT_MIN,
  ANSWER_LINE_MIN,
  MAX_QUESTION_LINES,
  QUESTION_FONT_MIN,
  ROW_MIN,
  type TopFivePagePlan,
} from './layout'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

/** The scoring every page promises: five ranks, strictly falling, one total. */
function scoringProblem(): string | null {
  if (TOP_FIVE_POINTS.length !== TOP_FIVE_ANSWER_COUNT) return 'Every answer needs a point value.'
  for (let i = 1; i < TOP_FIVE_POINTS.length; i++) {
    if (!(TOP_FIVE_POINTS[i]! < TOP_FIVE_POINTS[i - 1]!)) {
      return 'Points must fall from the top answer to the fifth.'
    }
  }
  const total = TOP_FIVE_POINTS.reduce((sum, points) => sum + points, 0)
  return total === TOP_FIVE_MAX_SCORE ? null : 'The printed total does not match the points.'
}

/**
 * The last gate before a sheet is considered export-ready.
 *
 * Size and fit are already structural — the plan never lays out a block that
 * does not fit — so this re-proves them and then checks what a reader only
 * finds with a pencil in hand: a question with four answers, two answers a
 * reader cannot tell apart, the same puzzle printed twice, or scores that do
 * not add up to the total at the foot of the block.
 *
 * Every one of those is a refund, so none of them may print.
 */
export function runTopFiveKdpPreflight(options: {
  sets: readonly FittedTopFiveSet[]
  plan: TopFivePagePlan
  font: string
}): KdpPreflightResult {
  const { sets, plan, font } = options
  const errors: string[] = []
  const warnings: string[] = []

  if (sets.length === 0) {
    return { ok: false, warnings, errors: ['No questions were laid out.'] }
  }
  if (sets.length !== plan.count) {
    errors.push('The page holds a different number of questions than it was laid out for.')
  }

  const scoring = scoringProblem()
  if (scoring) errors.push(scoring)

  const spec = { fontFamily: font }
  const room = wrapSafeWidth(plan.answerLineW - ANSWER_INSET, spec)
  sets.forEach((set, index) => {
    const problem = topFiveSetProblem(set)
    if (problem) errors.push(problem)
    if (sets.slice(0, index).some((earlier) => setsRepeatEachOther(set, earlier))) {
      errors.push('Two questions on this page are the same puzzle.')
    }
    if (set.questionLines.length > Math.min(plan.questionLines, MAX_QUESTION_LINES)) {
      errors.push('A question needs more lines than its block reserved.')
    }
    if (set.questionLines.join(' ').replace(/\s+/g, ' ') !== set.question) {
      errors.push('A question was set differently from the one written.')
    }
    set.answers.forEach((answer, rank) => {
      if (measureBlockWidth(answerLineText(rank, answer), plan.answerFont, spec) > room) {
        errors.push('An answer does not fit on its answer line.')
      }
    })
  })

  if (plan.metrics.pitch < ROW_MIN) errors.push('Guess lines must stay tall enough to write on.')
  if (plan.answerLineW < ANSWER_LINE_MIN) errors.push('Guess lines must stay long enough to write on.')
  if (plan.metrics.questionFont < QUESTION_FONT_MIN) errors.push('Questions must stay large print.')
  if (plan.answerFont < ANSWER_FONT_MIN) errors.push('Answers must stay readable.')

  return { ok: errors.length === 0, warnings, errors }
}
