export interface CategoryFluencyRequest {
  difficulty: 'easy' | 'standard' | 'hard'
  /** Optional user-requested category or theme. */
  categoryHint?: string
  /** Sample answers must match printable answer lines (8–30). */
  lineCount: number
  seed: number
  /** Recently printed labels for this template + theme; the model is told not to reuse them. */
  avoid?: string[]
  locale?: string
}

export interface CategoryFluencyResponse {
  /** e.g. "Animals", "Things in a kitchen" */
  category: string
  /** Reference list — length should match requested lineCount. */
  examples: string[]
}
