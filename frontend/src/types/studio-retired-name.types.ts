/**
 * What a "What's Your Retired Name?" page asks the content service for.
 *
 * Two pools rather than a keyed table: which name lands on which letter or
 * month is the page's decision, made after its own gates have run, so the
 * service only has to write good names. The character budgets are in the
 * request because they cannot be widened once the reply arrives: every name
 * has to set on one line of the column the page reserved.
 */
export interface RetiredNameRequest {
  theme: string
  /** One retirement pastime per last name instead of a whole table on `theme`. */
  mixedTopics: boolean
  /** First names to write — more than the 26 letters, so the gates have spares. */
  firstCount: number
  /** Last names to write — more than the 12 months, for the same reason. */
  lastCount: number
  maxFirstChars: number
  maxLastChars: number
  seed: number
  /** Names this seller's book and browser have already printed. */
  avoid?: string[]
}

export interface RetiredNameResponse {
  /** "Captain", "Breezy" — one per letter of the alphabet. */
  firstNames: string[]
  /** "Hammock Snoozer" — one per birth month. */
  lastNames: string[]
}
