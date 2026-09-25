import type { OccupationKey } from '@/types/studio-occupation-trivia.types'
import type { Box } from '../studio-layout'
import {
  OT_CHOICE_COUNT,
  OT_LETTERS,
  OT_MIN_QUESTIONS,
  arrangeOtChoices,
  dealOtAnswerSlots,
  orderOtQuestions,
  otLabel,
  type OtQuestion,
} from './content'
import {
  MAX_CHOICE_LINES,
  MAX_QUESTION_LINES,
  arrangeChoices,
  breakQuestion,
  paginate,
  planOtKey,
  questionBlockHeight,
  type OtArrangement,
  type OtKeyPlan,
  type OtQuizPlan,
} from './layout'

/** A question with its letters dealt, and its wording and choices already broken to their columns. */
export interface FittedOtQuestion extends OtQuestion {
  /** Position in the pack: 0 prints as "1.". */
  index: number
  /** Which choice is right: 0 is A. */
  slot: number
  /** The right letter — the answer to this question. */
  letter: string
  /** The four choices in print order, A to D. */
  choices: string[]
  questionLines: string[]
  arrangement: OtArrangement
  choiceLines: string[][]
  /** What the book remembers this question by. */
  label: string
}

export interface FittedOtPack {
  plan: OtQuizPlan
  questions: FittedOtQuestion[]
  /** Question indices on each quiz page, in reading order. */
  pages: number[][]
  key: OtKeyPlan
}

export interface OtFields {
  /** The first quiz page's body — under the title and the instruction. */
  first: Box
  /** A later quiz page's body height — under the title alone. */
  laterHeight: number
  /** The answer page's body. */
  key: Box
}

/** Height a quiz page gives its questions. */
export function quizUsable(plan: OtQuizPlan, fields: Pick<OtFields, 'first' | 'laterHeight'>) {
  return (page: number) =>
    (page === 0 ? fields.first.height : fields.laterHeight) - plan.bottomGuard - plan.footerHeight
}

interface Candidate {
  item: OtQuestion
  questionLines: string[]
}

function fitQuestions(
  chosen: readonly Candidate[],
  plan: OtQuizPlan,
  font: string,
  seed: number,
  occupation: OccupationKey,
): FittedOtQuestion[] {
  const slots = dealOtAnswerSlots(chosen.length, seed)
  return chosen.map(({ item, questionLines }, index) => {
    const slot = slots[index]!
    const choices = arrangeOtChoices(item, slot, seed, index)
    const { arrangement, lines } = arrangeChoices(choices, plan, font)
    return {
      ...item,
      index,
      slot,
      letter: OT_LETTERS[slot]!,
      choices,
      questionLines,
      arrangement,
      choiceLines: lines,
      label: otLabel(occupation, item),
    }
  })
}

export const blockHeightOf = (q: FittedOtQuestion, plan: OtQuizPlan) =>
  questionBlockHeight(
    q.questionLines.length,
    q.arrangement,
    q.choiceLines.map((lines) => lines.length),
    plan.metrics,
  )

/**
 * Hold real questions to the pack the form promised.
 *
 * The type size and the page limit stay exactly as the worst-case plan set
 * them. Questions are taken in a seeded reading order; one is passed over when
 * its wording or a choice needs more lines than it may use. When the pack will
 * not spread over its pages, the tallest question gives way to a spare, or is
 * simply dropped — never below the fewest questions a pack prints, and never
 * by shrinking the type.
 *
 * Letters are dealt once the questions are final, and the answer page is
 * planned from these very records, so a letter or answer can only ever be the
 * one printed beside its own question.
 */
export function fitOtPack(
  items: readonly OtQuestion[],
  promised: OtQuizPlan,
  font: string,
  seed: number,
  occupation: OccupationKey,
  fields: OtFields,
): FittedOtPack | null {
  const candidates: Candidate[] = []
  for (const item of orderOtQuestions(items, seed)) {
    const questionLines = breakQuestion(item.question, promised, font)
    if (questionLines.length > MAX_QUESTION_LINES) continue
    const { lines } = arrangeChoices([item.answer, ...item.distractors], promised, font)
    if (lines.length !== OT_CHOICE_COUNT || lines.some((l) => l.length > MAX_CHOICE_LINES)) continue
    candidates.push({ item, questionLines })
  }

  const chosen = candidates.slice(0, promised.count)
  const spares = candidates.slice(promised.count)
  const usable = quizUsable(promised, fields)

  while (chosen.length >= OT_MIN_QUESTIONS) {
    const questions = fitQuestions(chosen, promised, font, seed, occupation)
    const heights = questions.map((q) => blockHeightOf(q, promised))
    const pages = paginate(heights, usable, promised.metrics, promised.pages)
    if (pages) {
      const key = planOtKey(fields.key, questions, font, promised.metrics.font)
      if (!key) return null
      return { plan: { ...promised, count: questions.length }, questions, pages, key }
    }
    const tallest = heights.indexOf(Math.max(...heights))
    chosen.splice(tallest, 1)
    const spare = spares.shift()
    if (spare) chosen.push(spare)
  }
  return null
}
