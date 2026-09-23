/**
 * What the trivia clue word search asks the content service for.
 *
 * Every band is in the request rather than filtered for afterwards, because
 * none of them can be widened once the reply arrives. The letter band is the
 * grid's: an answer longer than the grid is wide cannot be placed at all.
 * `maxClueChars` is the printed clue column expressed as characters — a clue
 * past it wraps onto a line the page did not reserve, and a clue list that
 * grows a line is a clue list sitting on the page number.
 *
 * Asking for all of it up front is what keeps one paid call enough.
 */
export interface TriviaCluesRequest {
  theme: string
  /** Tone asked of the clue writer — plainer at `easy`, fuller at `hard`. */
  difficulty: 'easy' | 'medium' | 'hard'
  /** Candidates to write — more than the page prints, so the packer has slack. */
  count: number
  minLetters: number
  maxLetters: number
  maxClueChars: number
  seed: number
  /** Answers this seller's book has already printed for this theme. */
  avoid?: string[]
  locale?: string
}

/** One printed clue and the single word it resolves to. */
export interface TriviaClueItem {
  /** Bare uppercase A–Z word: the grid token and the solution label both. */
  answer: string
  clue: string
}

export interface TriviaCluesResponse {
  items: TriviaClueItem[]
}
