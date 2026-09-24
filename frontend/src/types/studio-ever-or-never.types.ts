/**
 * What an Ever or Never page asks the content service for.
 *
 * The statement budget is in the request rather than filtered for afterwards,
 * because it cannot be widened once the reply arrives: every statement has to
 * set in the lines its row on the page reserved.
 */
export type EverOrNeverStyle = 'balanced' | 'gentle' | 'playful'

export interface EverOrNeverRequest {
  theme: string
  /** One retirement topic per statement instead of a whole page on `theme`. */
  mixedTopics: boolean
  style: EverOrNeverStyle
  /** Statements to write — more than one page prints, so the gates have spares. */
  count: number
  maxStatementChars: number
  seed: number
  /** Compact labels this seller's book has already printed. */
  avoid?: string[]
  locale?: string
}

/** One statement, printed as written: "Ever taken a nap before lunch on a Tuesday?" */
export interface EverOrNeverItem {
  statement: string
  /** The brief it answered. Never printed. */
  topic?: string
}

export interface EverOrNeverResponse {
  items: EverOrNeverItem[]
}
