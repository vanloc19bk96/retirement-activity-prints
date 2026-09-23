export type FallenPhraseLength = 'short' | 'medium' | 'long'

/**
 * What a Fallen Phrase page asks the content service for.
 *
 * One field does the work that matters: `length`. The page is a fixed grid of
 * write-in boxes, and the saying has to fill it — a phrase too short leaves
 * half the columns holding one letter, a phrase too long will not wrap into
 * the row band the level asks for. The band is picked from the grid the trim
 * can actually print, so the service is asked for letters, not for words.
 *
 * `itemCount` over-requests on purpose. The page keeps the first candidate it
 * can grid *and* validate, so a reply of one is a reply that may not print.
 */
export interface FallenPhraseRequest {
  theme: string
  /** Phrase candidates to write — the page keeps the first one it can grid. */
  itemCount: number
  length: FallenPhraseLength
  seed: number
  /** Recently printed phrases for this template + theme; the model avoids them. */
  avoid?: string[]
  locale?: string
}

export interface FallenPhraseResponse {
  /** Uppercase A–Z phrases with single spaces — no punctuation of any kind. */
  items: string[]
}
