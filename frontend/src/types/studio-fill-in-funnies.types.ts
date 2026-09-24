/**
 * What a Fill-in Funnies activity asks the content service for.
 *
 * The budgets are in the request rather than filtered for afterwards, because
 * they cannot be widened once the reply arrives: every blank needs a row on
 * the word list and every word a place on the story page.
 */
export interface FillInFunniesRequest {
  theme: string
  /** Let every story pick its own retirement situation instead of `theme`. */
  mixedTopics: boolean
  /** Stories to write — more than the page prints, so the gates have spares. */
  count: number
  minBlanks: number
  maxBlanks: number
  maxWords: number
  seed: number
  /** Compact labels this seller's book has already printed. */
  avoid?: string[]
  locale?: string
}

/**
 * One story. `paragraphs` carry `[1]`, `[2]` … in order of first appearance;
 * `blanks[i]` is the kind of word placeholder `i + 1` asks for.
 */
export interface FillInFunniesStoryPayload {
  title: string
  paragraphs: string[]
  blanks: string[]
  /** The situation it was written about. Never printed. */
  premise?: string
  topic?: string
  /** True only on stories that passed the service's blind grammar check. */
  verified?: boolean
}

export interface FillInFunniesResponse {
  stories: FillInFunniesStoryPayload[]
}
