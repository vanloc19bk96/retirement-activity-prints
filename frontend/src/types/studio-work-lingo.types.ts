import type { OccupationKey } from './studio-occupation-trivia.types'

/** How familiar a Work Lingo Match page's phrases are. */
export type WorkLingoLevel = 'gentle' | 'classic' | 'challenging'

/** Whose lingo: everyday workplace talk, or one preset job's own. */
export type WorkLingoOccupation = 'any' | OccupationKey

/**
 * What a Work Lingo Match page asks the content service for.
 *
 * The budgets are in the request rather than filtered for afterwards, because
 * neither can be widened once the reply arrives: every phrase has to set in
 * its row, and every meaning in the lines the page reserved.
 */
export interface WorkLingoRequest {
  occupation?: WorkLingoOccupation
  /** A job the seller typed; when set the page is its lingo and `occupation` is ignored. */
  customOccupation?: string
  level: WorkLingoLevel
  /** Pairs to write — more than one page prints, so the layout gates have spares. */
  count: number
  maxPhraseChars: number
  maxMeaningChars: number
  seed: number
  /** Phrases this seller's book has already printed. */
  avoid?: string[]
  locale?: string
}

/**
 * One pair: the workplace phrase and its plain-English meaning.
 *
 * The meaning travels in the same record as its phrase, so no lettering or
 * reordering can pair it with another phrase. `verified` is only true on pairs
 * that passed the service's blind check together with every other pair in the
 * same response.
 */
export interface WorkLingoPair {
  phrase: string
  meaning: string
  verified: boolean
}

export interface WorkLingoResponse {
  pairs: WorkLingoPair[]
  /** "any", a preset's id, or the typed job folded to lower case. Older replies omit it. */
  occupation?: string
}
