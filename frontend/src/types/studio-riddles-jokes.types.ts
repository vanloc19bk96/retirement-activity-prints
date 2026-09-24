/** What a Riddles & Jokes page holds: riddles, jokes, or both. */
export type RiddlesJokesMix = 'both' | 'riddles' | 'jokes'

export type RiddlesJokesKind = 'riddle' | 'joke'

/**
 * What a Riddles & Jokes page asks the content service for.
 *
 * The budgets are in the request rather than filtered for afterwards, because
 * neither can be widened once the reply arrives: every setup has to set in the
 * lines the page reserved, and every answer in the lines the answer page
 * reserved.
 */
export interface RiddlesJokesRequest {
  theme: string
  /** One retirement topic per item instead of a whole page on `theme`. */
  mixedTopics: boolean
  mix: RiddlesJokesMix
  /** Items to write — more than one page prints, so the layout gates have spares. */
  count: number
  maxSetupChars: number
  maxAnswerChars: number
  seed: number
  /** Compact labels this seller's book has already printed. */
  avoid?: string[]
  locale?: string
}

/**
 * One item: the question the reader sees and its answer or punchline.
 *
 * The answer travels in the same record as its setup, so no reordering can
 * print it under another item's number. `verified` is only true on items that
 * passed the service's blind check.
 */
export interface RiddlesJokesItem {
  kind: RiddlesJokesKind
  setup: string
  answer: string
  verified: boolean
}

export interface RiddlesJokesResponse {
  items: RiddlesJokesItem[]
}
