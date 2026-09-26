/**
 * What a Roll-a-Day page asks the content service for.
 *
 * Two pools rather than a keyed table: which activity lands on which die face
 * is the page's decision, made after its own gates have run, so the service
 * only has to write good activities. The character budget is in the request
 * because it cannot be widened once the reply arrives: every activity has to
 * set within the lines its row reserved.
 */
export type RollADayFocus = 'balanced' | 'home' | 'outings' | 'creative' | 'social'

export interface RollADayRequest {
  focus: RollADayFocus
  /** Morning activities to write — more than the six faces, so the gates have spares. 0 on a top-up that only needs afternoons. */
  morningCount: number
  /** Afternoon activities to write, likewise. */
  afternoonCount: number
  maxActivityChars: number
  seed: number
  /** Activities this seller's book and browser have already printed. */
  avoid?: string[]
}

/** One activity, printed as written: "Bake a small batch of scones". */
export interface RollADayItem {
  activity: string
  /** The model's short name for the activity. Never printed. */
  concept?: string
  /** Which kind of activity its brief asked for ("rest", "make"…). Never printed. */
  kind?: string
}

export interface RollADayResponse {
  morning: RollADayItem[]
  afternoon: RollADayItem[]
}
