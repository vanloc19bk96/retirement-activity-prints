/** Occupations a pack can be written for — one profile each in the service's prompt data. */
export type OccupationKey =
  | 'teacher'
  | 'nurse'
  | 'police'
  | 'military'
  | 'trucker'
  | 'engineer'
  | 'accountant'
  | 'postal'

/** How deep into the job's knowledge a pack reaches. */
export type OccupationTriviaLevel = 'gentle' | 'classic' | 'challenging'

/**
 * What an Occupation Trivia Pack asks the content service for.
 *
 * The budgets are in the request rather than filtered for afterwards, because
 * none can be widened once the reply arrives: every question has to set in the
 * lines its block reserves, every choice beside its letter, and every note on
 * the one answer page.
 */
export interface OccupationTriviaRequest {
  occupation: OccupationKey
  level: OccupationTriviaLevel
  /** Questions to write — more than one pack prints, so the layout gates have spares. */
  count: number
  maxQuestionChars: number
  maxChoiceChars: number
  maxExplanationChars: number
  seed: number
  /** Labels of questions this seller's book has already printed. */
  avoid?: string[]
  locale?: string
}

/**
 * One question: the right answer, three wrong ones, and a note for the answer page.
 *
 * The answer is its own field, never an index, so no shuffling or lettering
 * step can point the key at a wrong choice. `topic` names the fact under test.
 * `verified` is only true on questions that passed the service's blind check.
 */
export interface OccupationTriviaQuestion {
  topic: string
  question: string
  answer: string
  distractors: string[]
  explanation: string
  verified: boolean
}

export interface OccupationTriviaResponse {
  occupation: OccupationKey
  questions: OccupationTriviaQuestion[]
}
