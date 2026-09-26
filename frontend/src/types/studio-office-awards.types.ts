/**
 * What an Office Awards: Retirement Edition set asks the content service for.
 *
 * Nothing about the retiree or the team is sent — no names, no coworker
 * list. The service writes award titles; coworkers write the winners' names
 * in the printed book.
 *
 * The title budget is in the request rather than filtered for afterwards,
 * because it cannot be widened once the reply arrives: every title has to
 * set within the lines its card on the page allows.
 */
export type OfficeAwardsWorkplace = 'any' | 'office' | 'school' | 'healthcare' | 'service' | 'trades'

/** Playful teasing or warm appreciation — a set always has both. */
export type OfficeAwardsTone = 'playful' | 'warm'

export interface OfficeAwardsRequest {
  workplace: OfficeAwardsWorkplace
  /** Awards the printed set holds; the service adds spares. */
  awards: number
  /** Top-up form: themes the set does not use yet. */
  themes?: string[]
  /** Top-up form: how many more awards to write from them. */
  count?: number
  /** Top-up form: the tone the set is short of. */
  tone?: OfficeAwardsTone
  maxAwardChars: number
  seed: number
  /** Awards this seller's book already prints, newest first. */
  avoid?: string[]
  locale?: string
}

/** One award, printed as written: "Keeper of the Spare Phone Charger". */
export interface OfficeAwardsItem {
  award: string
  /** The theme the award was written for. Never printed. */
  theme: string
  tone: OfficeAwardsTone
  /** The title shape it was written in (Most Likely to…, a superlative…). Never printed. */
  shape: string
  /** The model's short name for the idea honoured. Never printed. */
  concept?: string
}

export interface OfficeAwardsResponse {
  awards: OfficeAwardsItem[]
}
