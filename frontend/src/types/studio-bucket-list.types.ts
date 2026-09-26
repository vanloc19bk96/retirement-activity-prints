/**
 * What a Retirement Bucket List asks the content service for.
 *
 * The idea budget is in the request rather than filtered for afterwards,
 * because it cannot be widened once the reply arrives: every idea has to set
 * in the lines its row on the page reserved.
 */
export type BucketListFocus = 'balanced' | 'close-to-home' | 'adventure' | 'creative' | 'people'

/** One heading the client wants topped up, and by how many ideas. */
export interface BucketListSectionAsk {
  key: string
  count: number
}

export interface BucketListRequest {
  /** Ideas the finished list prints. The service writes spares on top. */
  count: number
  focus: BucketListFocus
  /** Top-up form: only these headings, only this many more ideas each. */
  sections?: BucketListSectionAsk[]
  maxIdeaChars: number
  seed: number
  /** Ideas this seller's book already prints, newest first. */
  avoid?: string[]
  locale?: string
}

/** One idea, printed as written: "Take a scenic train journey". */
export interface BucketListItem {
  idea: string
  /** The model's short name for the experience. Never printed. */
  concept?: string
}

/** One theme heading and its ideas, spares included. */
export interface BucketListSection {
  key: string
  title: string
  /** Ideas this heading prints in a balanced list. */
  target: number
  items: BucketListItem[]
}

export interface BucketListResponse {
  sections: BucketListSection[]
}
