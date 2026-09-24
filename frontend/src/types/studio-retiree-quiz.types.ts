/** The four retirement styles, in the order the scoring grid prints them. */
export type RetireeStyle = 'explorer' | 'tinkerer' | 'social' | 'napper'

/**
 * What a What Kind of Retiree Are You? quiz asks the content service for.
 *
 * The budgets are in the request rather than filtered for afterwards, because
 * none can be widened once the reply arrives: every question and answer has to
 * set in the lines its block reserved, and every write-up in the results
 * column.
 */
export interface RetireeQuizRequest {
  /** Plain-text theme; ignored when `mixedTopics` is true. */
  theme: string
  mixedTopics: boolean
  /** Questions to write — more than one quiz prints, so the layout gates have spares. */
  count: number
  maxQuestionChars: number
  maxAnswerChars: number
  maxDescriptionChars: number
  seed: number
  /** Questions this seller's book has already printed. */
  avoid?: string[]
  locale?: string
}

/**
 * One question and its four answers, one per retirement style.
 *
 * The style is carried by the field, never by a letter or a position, so no
 * reordering can score an answer to the wrong style. `verified` is only true
 * on questions that passed the service's blind style check.
 */
export interface RetireeQuizQuestionItem {
  question: string
  explorer: string
  tinkerer: string
  social: string
  napper: string
  topic?: string
  verified: boolean
}

/** One short write-up per style; empty when the service's write-up did not pass. */
export type RetireeQuizResultsItem = Record<RetireeStyle, string>

export interface RetireeQuizResponse {
  questions: RetireeQuizQuestionItem[]
  results: RetireeQuizResultsItem
}
