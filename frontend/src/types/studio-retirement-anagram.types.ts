/**
 * What the anagram page asks the content service for.
 *
 * The letter band and the clue budget are part of the request rather than
 * something the page filters for afterwards. Both are set by the page before a
 * word exists: the band is the level's, and the clue budget is the width of the
 * column the clue prints in. A pool written to some other band, or clues
 * written three lines long, comes back mostly unusable — and every discarded
 * row is a paid call the seller made for nothing.
 */
export interface RetirementAnagramRequest {
  theme: string
  /** Candidates to write — more than the page prints, so filtering has slack. */
  count: number
  minLetters: number
  maxLetters: number
  /** Longest clue the printed column was planned for; longer ones are dropped. */
  maxClueChars: number
  seed: number
  /** Recently printed answers for this template + theme; the model avoids them. */
  avoid?: string[]
  locale?: string
}

/** One row as the service writes it. */
export interface RetirementAnagramClue {
  word: string
  clue: string
}

export interface RetirementAnagramResponse {
  items: RetirementAnagramClue[]
}

/** One row as the page prints it: the answer, and the clue that reaches it. */
export interface RetirementAnagramItem {
  answer: string
  clue: string
}
