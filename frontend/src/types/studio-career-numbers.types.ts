/**
 * What a Career By the Numbers set asks the content service for.
 *
 * Nothing about the retiree is sent — no name, no employer, no dates. The
 * service writes questions and units; the retiree writes every number by
 * hand in the printed book.
 *
 * The question and unit budgets are in the request rather than filtered for
 * afterwards, because they cannot be widened once the reply arrives: every
 * question has to set within the lines its row allows, and every unit beside
 * a writing line of fixed length.
 */
export type CareerNumbersWorkplace = 'any' | 'office' | 'school' | 'healthcare' | 'service' | 'trades'

/** A light laugh or a warm look back — a set always has both. */
export type CareerNumbersTone = 'playful' | 'nostalgic'

/** The one unit every distance on the page is asked in. */
export type CareerNumbersDistance = 'miles' | 'km'

export interface CareerNumbersRequest {
  workplace: CareerNumbersWorkplace
  distance: CareerNumbersDistance
  /** Questions the printed set holds; the service adds spares. */
  questions: number
  /** Top-up form: themes the set does not use yet. */
  themes?: string[]
  /** Top-up form: how many more questions to write from them. */
  count?: number
  /** Top-up form: the tone the set is short of. */
  tone?: CareerNumbersTone
  maxQuestionChars: number
  maxUnitChars: number
  seed: number
  /** Questions this seller's book already prints, newest first. */
  avoid?: string[]
  locale?: string
}

/** One estimate question and the unit printed beside its writing line. */
export interface CareerNumbersItem {
  /** "About how many cups of tea or coffee powered your career?" */
  question: string
  /** "cups" — printed after the line: "About ________ cups". */
  unit: string
  /** The theme the question was written for. Never printed. */
  theme: string
  tone: CareerNumbersTone
  /** The question shape it was written in (a career total, a typical week…). Never printed. */
  shape: string
  /** The model's short name for what is counted. Never printed. */
  concept?: string
}

export interface CareerNumbersResponse {
  questions: CareerNumbersItem[]
}
