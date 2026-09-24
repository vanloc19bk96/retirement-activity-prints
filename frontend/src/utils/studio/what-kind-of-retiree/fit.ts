import { MIN_QUESTIONS, RQ_STYLES, placeRqQuestions, type PlacedRqQuestion, type RqQuestion } from './content'
import {
  MAX_ANSWER_LINES,
  MAX_QUESTION_LINES,
  breakAnswer,
  breakQuestion,
  type RqMeasurable,
  type RqQuizPlan,
} from './layout'

/** A placed question with its text and every answer already broken to its column. */
export interface FittedRqQuestion extends PlacedRqQuestion {
  questionLines: string[]
  /** One entry per answer, in print order. */
  answerLines: string[][]
}

/** The lines a question needs on this plan, or null when it will not fit its budget. */
function measure(question: string, answers: readonly string[], plan: RqQuizPlan, font: string) {
  const questionLines = breakQuestion(question, plan, font)
  if (questionLines.length > MAX_QUESTION_LINES) return null
  const answerLines = answers.map((answer) => breakAnswer(answer, plan, font))
  if (answerLines.some((lines) => lines.length > MAX_ANSWER_LINES)) return null
  const total = questionLines.length + answerLines.reduce((sum, lines) => sum + lines.length, 0)
  if (total > plan.blockLines) return null
  return { questionLines, answerLines }
}

/** A question's text and answers in grid order, for a plan measured before letters are dealt. */
export const rqMeasurable = (question: RqQuestion): RqMeasurable => ({
  question: question.question,
  answers: RQ_STYLES.map((style) => question.answers[style]),
})

/**
 * Hold real questions to the quiz the form promised.
 *
 * Type size and the per-question line budget stay exactly as the worst-case
 * plan set them. A question that needs more lines than its budget is left
 * off and the next one takes its place. Only the count may fall — never the
 * type — and never below the quiz minimum, because a quiz of five questions
 * is a coin toss rather than a result.
 *
 * Letters are dealt once the quiz's questions are chosen, so they balance
 * across exactly the questions that print. Dealing only reorders the four
 * answers, which leaves every line count unchanged.
 */
export function fitRqQuestions(
  questions: readonly RqQuestion[],
  promised: RqQuizPlan,
  font: string,
  seed: number,
): { questions: FittedRqQuestion[]; plan: RqQuizPlan } | null {
  const chosen: RqQuestion[] = []
  for (const question of questions) {
    if (chosen.length >= promised.count) break
    const { answers } = rqMeasurable(question)
    if (measure(question.question, answers, promised, font)) chosen.push(question)
  }
  if (chosen.length < MIN_QUESTIONS) return null

  const fitted: FittedRqQuestion[] = []
  for (const placed of placeRqQuestions(chosen, seed)) {
    const measured = measure(placed.question, placed.answers, promised, font)
    if (!measured) return null
    fitted.push({ ...placed, ...measured })
  }
  const count = fitted.length
  return {
    questions: fitted,
    plan: { ...promised, count, pages: Math.ceil(count / promised.perPage) },
  }
}
