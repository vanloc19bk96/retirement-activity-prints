export interface ThemeWordsRequest {
  theme: string
  itemCount: number
  /** Grid puzzles need words that fit, so bounds travel with the request. */
  minLetters: number
  maxLetters: number
  seed: number
  /** Recently printed labels for this template + theme; the model is told not to reuse them. */
  avoid?: string[]
  locale?: string
}

export interface ThemeWordsResponse {
  /** Uppercase A–Z words, no spaces. */
  items: string[]
}
