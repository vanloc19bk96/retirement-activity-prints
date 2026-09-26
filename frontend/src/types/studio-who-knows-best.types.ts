/**
 * What a Who Knows the Retiree Best? set asks the content service for.
 *
 * Nothing about the retiree is sent — not even a name. The service writes
 * questions anyone who knows the retiree could guess at; the retiree writes
 * the real answers in the book.
 *
 * The question budget is in the request rather than filtered for afterwards,
 * because it cannot be widened once the reply arrives: every question has to
 * set within the lines its block on the page allows.
 */
export type WhoKnowsBestAudience = 'mixed' | 'work' | 'family'

/** Room a handwritten answer needs: a short line, a full line, or two lines. */
export type WhoKnowsBestAnswer = 'word' | 'phrase' | 'sentence'

export interface WhoKnowsBestRequest {
  audience: WhoKnowsBestAudience
  /** Top-up form: topics the set does not use yet. */
  topics?: string[]
  /** Top-up form: how many more questions to write from them. */
  count?: number
  maxQuestionChars: number
  seed: number
  /** Questions this seller's book already prints, newest first. */
  avoid?: string[]
  locale?: string
}

/** One question, printed as written: "What was the very first job they were paid for?" */
export interface WhoKnowsBestItem {
  question: string
  /** The topic the question was written for. Never printed. */
  topic: string
  /** The question shape it was written in (a habit, a pick, a prediction…). Never printed. */
  shape: string
  answer: WhoKnowsBestAnswer
  /** The model's short name for the detail asked about. Never printed. */
  concept?: string
}

export interface WhoKnowsBestResponse {
  questions: WhoKnowsBestItem[]
}
