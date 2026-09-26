/**
 * What a 52 Weeks of Firsts year asks the content service for.
 *
 * The idea budget is in the request rather than filtered for afterwards,
 * because it cannot be widened once the reply arrives: every weekly prompt
 * has to set in the lines its week on the page reserved.
 */
export type WeeksOfFirstsFocus = 'balanced' | 'close-to-home' | 'out-and-about' | 'creative' | 'social'

/** One area the client wants topped up, and by how many ideas. */
export interface WeeksOfFirstsAreaAsk {
  key: string
  count: number
}

export interface WeeksOfFirstsRequest {
  focus: WeeksOfFirstsFocus
  /** Top-up form: only these areas, only this many more ideas each. */
  areas?: WeeksOfFirstsAreaAsk[]
  maxIdeaChars: number
  seed: number
  /** Ideas this seller's book already prints, newest first. */
  avoid?: string[]
  locale?: string
}

/** One weekly idea, printed as written: "Cook a Thai green curry from scratch". */
export interface WeeksOfFirstsItem {
  idea: string
  /** The model's short name for the experience. Never printed. */
  concept?: string
}

/** One area of the year and its ideas, spares included. Never printed as a heading. */
export interface WeeksOfFirstsArea {
  key: string
  /** Weeks this area takes in a balanced year. */
  target: number
  items: WeeksOfFirstsItem[]
}

export interface WeeksOfFirstsResponse {
  areas: WeeksOfFirstsArea[]
}
