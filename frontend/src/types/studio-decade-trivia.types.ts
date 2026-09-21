export type DecadeTriviaDecade =
  | '1950s'
  | '1960s'
  | '1970s'
  | '1980s'
  | '1990s'
  | '2000s'

export type DecadeTriviaFormat =
  | 'multiple-choice'
  | 'short-answer'
  | 'fill-blank'
  | 'mixed'

export type DecadeTriviaDifficulty = 'easy' | 'standard' | 'challenging'

export type TriviaItemFormat = 'multiple-choice' | 'short-answer' | 'fill-blank'

export interface DecadeTriviaRequest {
  /** Decade label such as `1960s` or a custom `2010s`. */
  decade: string
  topics: string[]
  format: DecadeTriviaFormat
  difficulty: DecadeTriviaDifficulty
  questionCount: number
  seed: number
  /** Recently printed labels for this template + theme; the model is told not to reuse them. */
  avoid?: string[]
  locale?: string
}

export interface TriviaItem {
  question: string
  options?: string[]
  answer: string
  topic: string
  format: TriviaItemFormat
}

export interface DecadeTriviaResponse {
  decade: string
  items: TriviaItem[]
}
