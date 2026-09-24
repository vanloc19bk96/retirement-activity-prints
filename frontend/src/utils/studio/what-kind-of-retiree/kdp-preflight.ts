import type { RetireeStyle } from '@/types/studio-retiree-quiz.types'
import {
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  RQ_LETTERS,
  RQ_STYLES,
  normalizeDescription,
  normalizeRqQuestion,
  questionsRepeat,
  type RqQuestion,
} from './content'
import type { FittedRqQuestion } from './fit'
import {
  MAX_ANSWER_LINES,
  MAX_QUESTIONS_PER_PAGE,
  MAX_QUESTION_LINES,
  MAX_QUIZ_PAGES,
  QUIZ_FONT_MIN,
  RESULTS_FONT_MIN,
  type RqQuizPlan,
  type RqResultsPlan,
} from './layout'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

const joined = (lines: readonly string[]) => lines.join(' ').replace(/\s+/g, ' ')

/** The question a placed one was built from, so it can be re-gated whole. */
function unplaced(question: FittedRqQuestion): RqQuestion | null {
  if (question.answers.length !== RQ_STYLES.length || question.styles.length !== RQ_STYLES.length) return null
  const answers = {} as Record<RetireeStyle, string>
  question.styles.forEach((style, i) => {
    answers[style] = question.answers[i]!
  })
  if (RQ_STYLES.some((style) => answers[style] === undefined)) return null
  return { question: question.question, answers, topic: '' }
}

/**
 * The last gate before a quiz is considered export-ready.
 *
 * Fit is already structural — the plan never lays out a question that does
 * not fit — so this re-proves it, then checks what a reader only finds with
 * a pencil in hand: a question missing a style, a style with more chances
 * than another, a letter that leans towards one style, a grid row that does
 * not match its question, a write-up that is missing or unsuitable, the same
 * question twice, or type that fell below large print.
 *
 * Every one of those is a refund, so none of them may print.
 */
export function runRqKdpPreflight(options: {
  questions: readonly FittedRqQuestion[]
  quiz: RqQuizPlan
  results: RqResultsPlan
  descriptions: Readonly<Record<RetireeStyle, string>>
}): KdpPreflightResult {
  const { questions, quiz, results, descriptions } = options
  const errors: string[] = []
  const warnings: string[] = []

  if (questions.length < MIN_QUESTIONS || questions.length > MAX_QUESTIONS) {
    errors.push(`The quiz must ask between ${MIN_QUESTIONS} and ${MAX_QUESTIONS} questions.`)
  }
  if (questions.length !== quiz.count) {
    errors.push('The quiz holds a different number of questions than it was laid out for.')
  }
  if (quiz.pages !== Math.ceil(questions.length / quiz.perPage) || quiz.pages > MAX_QUIZ_PAGES) {
    errors.push('The quiz runs over more pages than it was laid out for.')
  }
  if (quiz.perPage > MAX_QUESTIONS_PER_PAGE) errors.push('A quiz page is too crowded.')

  // Chances per style, and how often each style sits at each letter.
  const chances = new Map<RetireeStyle, number>(RQ_STYLES.map((style) => [style, 0]))
  const atLetter = new Map<RetireeStyle, number[]>(RQ_STYLES.map((style) => [style, RQ_LETTERS.map(() => 0)]))

  const kept: RqQuestion[] = []
  questions.forEach((question) => {
    const styles = new Set(question.styles)
    if (styles.size !== RQ_STYLES.length || RQ_STYLES.some((style) => !styles.has(style))) {
      errors.push('A question does not have exactly one answer for each retirement style.')
      return
    }
    question.styles.forEach((style, letter) => {
      chances.set(style, chances.get(style)! + 1)
      atLetter.get(style)![letter]! += 1
    })

    const source = unplaced(question)
    // Re-gate the whole question as the service returned it.
    const again = source ? normalizeRqQuestion({ question: source.question, ...source.answers, verified: true }) : null
    if (
      !source ||
      !again ||
      again.question !== source.question ||
      RQ_STYLES.some((style) => again.answers[style] !== source.answers[style])
    ) {
      errors.push('A question is not suitable for a published activity book.')
      return
    }
    if (kept.some((earlier) => questionsRepeat(source, earlier))) {
      errors.push('Two questions in this quiz repeat each other.')
    }
    kept.push(source)

    if (question.questionLines.length > MAX_QUESTION_LINES) errors.push('A question needs more lines than it allows.')
    if (joined(question.questionLines) !== question.question) {
      errors.push('A question was set differently from the one written.')
    }
    if (question.answerLines.length !== RQ_LETTERS.length) errors.push('An answer row is missing.')
    question.answerLines.forEach((lines, i) => {
      if (lines.length > MAX_ANSWER_LINES) errors.push('An answer needs more lines than its row allows.')
      if (joined(lines) !== question.answers[i]) errors.push('An answer was set differently from the one written.')
    })
    const lines =
      question.questionLines.length + question.answerLines.reduce((sum, row) => sum + row.length, 0)
    if (lines > quiz.blockLines) errors.push('A question needs more lines than it reserved.')
  })

  // Every style gets one chance per question, so none can win on structure alone.
  const counts = [...chances.values()]
  if (new Set(counts).size !== 1 || counts[0] !== questions.length) {
    errors.push('The retirement styles do not have an equal number of chances.')
  }
  // Letters dealt from Latin squares never favour a style by more than one.
  for (const perLetter of atLetter.values()) {
    if (Math.max(...perLetter) - Math.min(...perLetter) > 1) {
      errors.push('One answer letter leans towards a single retirement style.')
      break
    }
  }

  for (const style of RQ_STYLES) {
    if (normalizeDescription(descriptions[style]) !== descriptions[style]) {
      errors.push('A result write-up is missing or not suitable for a published activity book.')
      break
    }
    if (joined(results.writeUps.descriptions[style] ?? []) !== descriptions[style]) {
      errors.push('A result write-up was set differently from the one written.')
      break
    }
  }

  if (quiz.metrics.font < QUIZ_FONT_MIN) errors.push('Questions must stay large print.')
  if (results.metrics.font < RESULTS_FONT_MIN) errors.push('The scoring page must stay readable.')
  if (!results.metrics.labels) warnings.push('The scoring grid shows symbols only; the page is too narrow for style names.')

  return { ok: errors.length === 0, warnings, errors }
}
