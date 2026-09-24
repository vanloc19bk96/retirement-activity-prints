import {
  MAX_QUESTIONS_PER_PAGE,
  MAX_QUESTION_LINES,
  breakAnswer,
  breakQuestion,
  type PcPagePlan,
} from './layout'
import {
  answerParts,
  buildQuestions,
  isValidQuestion,
  pickFacts,
  type PriceCheckLevel,
  type PriceFact,
  type PriceQuestion,
} from './content'

/** A question with its wording and the fact under its answer already broken to the column. */
export interface FittedPcQuestion extends PriceQuestion {
  questionLines: string[]
  answerLines: string[]
}

/** Facts drawn beyond the page's count, for questions the page passes over. */
const SPARE_FACTS = 6

/**
 * Pick, build and hold real questions to the page the form promised.
 *
 * The type size and the line budget stay exactly as the worst-case plan set
 * them, so every page of a run matches. A question is passed over when its
 * wording needs more lines than the page has left, or when it fails its own
 * re-check; only the count may fall — never the type. The survivors are set
 * oldest year first, so the page reads as a walk through the decades.
 */
export function fitPcQuestions(options: {
  promised: PcPagePlan
  level: PriceCheckLevel
  seed: number
  font: string
  book?: readonly PriceFact[]
}): { questions: FittedPcQuestion[]; plan: PcPagePlan } | null {
  const { promised, level, seed, font, book } = options
  const facts = pickFacts({
    count: Math.min(MAX_QUESTIONS_PER_PAGE, promised.count) + SPARE_FACTS,
    seed,
    book,
  })
  const kept: FittedPcQuestion[] = []
  let lines = 0
  for (const question of buildQuestions(facts, level, seed)) {
    if (kept.length >= promised.count) break
    if (!isValidQuestion(question, level)) continue
    const questionLines = breakQuestion(question.question, promised, font)
    const answerLines = breakAnswer(answerParts(question.fact, question.dollars), promised, font)
    if (questionLines.length > MAX_QUESTION_LINES || answerLines.length > promised.answerLines) continue
    if (lines + questionLines.length > promised.pageLines) continue
    lines += questionLines.length
    kept.push({ ...question, questionLines, answerLines })
  }
  if (kept.length === 0) return null
  kept.sort((a, b) => a.fact.year - b.fact.year)
  return { questions: kept, plan: { ...promised, count: kept.length } }
}
