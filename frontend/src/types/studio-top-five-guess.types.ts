/**
 * What a Top Five Guess page asks the content service for.
 *
 * Both budgets are in the request rather than filtered for afterwards, because
 * neither can be widened once the reply arrives: the question has to set in the
 * lines the page reserved for it, and every answer has to fit one printed
 * answer line beside its points.
 *
 * There is no points field anywhere. The page scores rank 1-5 as 5-4-3-2-1, so
 * the writer only decides the order and can never return a ranking that
 * disagrees with its scores.
 */
export interface TopFiveGuessRequest {
  theme: string
  /** Sets to write — more than one page prints, so the layout gates have spares. */
  count: number
  maxQuestionChars: number
  maxAnswerChars: number
  seed: number
  /** Questions this seller's book has already printed for this theme. */
  avoid?: string[]
  locale?: string
}

/** One question and its five answers, most likely first. */
export interface TopFiveGuessItem {
  question: string
  answers: string[]
}

export interface TopFiveGuessResponse {
  items: TopFiveGuessItem[]
}
