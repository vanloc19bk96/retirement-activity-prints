/**
 * What a Would You Rather page asks the content service for.
 *
 * The option budget is in the request rather than filtered for afterwards,
 * because it cannot be widened once the reply arrives: every choice has to set
 * in the lines its box on the page reserved.
 */
export type WouldYouRatherStyle = 'balanced' | 'thoughtful' | 'playful'

export interface WouldYouRatherRequest {
  theme: string
  /** One retirement topic per question instead of a whole page on `theme`. */
  mixedTopics: boolean
  style: WouldYouRatherStyle
  /** Questions to write — more than one page prints, so the gates have spares. */
  count: number
  maxOptionChars: number
  seed: number
  /** Compact "a / b" labels this seller's book has already printed. */
  avoid?: string[]
  locale?: string
}

/** One dilemma: two choices that each complete "Would you rather …". */
export interface WouldYouRatherItem {
  optionA: string
  optionB: string
  /** The brief it answered. Never printed. */
  topic?: string
}

export interface WouldYouRatherResponse {
  items: WouldYouRatherItem[]
}
