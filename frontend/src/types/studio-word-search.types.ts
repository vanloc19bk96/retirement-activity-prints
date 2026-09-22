/**
 * What the word search asks the content service for.
 *
 * The letter band is part of the request rather than something the page
 * filters for afterwards: a "gentle" page can only use words of four to seven
 * letters, and a pool written to a three-to-eleven band comes back mostly
 * unusable to it. Asking for the band up front is what keeps one call enough.
 */
export interface WordSearchRequest {
  theme: string
  /** Candidates to write — more than the page prints, so gates have slack. */
  count: number
  minLetters: number
  maxLetters: number
  seed: number
  /** Words this seller's book has already printed for this theme. */
  avoid?: string[]
  locale?: string
}

export interface WordSearchResponse {
  /** Display strings: title case, spaces preserved for two-word entries. */
  words: string[]
}
