/** Subject pools the content service draws each set's brief from. */
export type TwoTruthsFibSubject =
  | 'mixed'
  | 'work'
  | 'inventions'
  | 'home'
  | 'leisure'
  | 'travel'
  | 'customs'
  | 'food'
  | 'nature'
  | 'custom'

export type TwoTruthsFibLevel = 'gentle' | 'classic' | 'challenging'

/**
 * What a Two Truths and a Fib page asks the content service for.
 *
 * The budgets are in the request rather than filtered for afterwards, because
 * none can be widened once the reply arrives: every statement has to set in
 * the lines its row reserved, the title on one line, and the correction in the
 * lines the answer page reserved.
 */
export interface TwoTruthsFibRequest {
  subject: TwoTruthsFibSubject
  /** Only read when `subject` is `custom`. */
  customSubject?: string
  level: TwoTruthsFibLevel
  /** Sets to write — more than one page prints, so the layout gates have spares. */
  count: number
  maxStatementChars: number
  maxTitleChars: number
  maxFactChars: number
  seed: number
  /** Titles and statements this seller's book has already printed. */
  avoid?: string[]
  locale?: string
}

/**
 * One set: two true statements, the fib, and the one-sentence correction.
 *
 * The answer is carried by the shape, not an index — the fib is its own field —
 * so no reordering can ever point the answer key at a true statement.
 * `verified` is only true on sets that passed the service's blind fact check.
 */
export interface TwoTruthsFibItem {
  title: string
  truths: string[]
  fib: string
  fact: string
  verified: boolean
}

export interface TwoTruthsFibResponse {
  items: TwoTruthsFibItem[]
}
