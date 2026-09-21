export type MissingVowelsDifficulty = 'relaxed' | 'classic' | 'challenge'

export interface MissingVowelsRequest {
  theme: string
  itemCount: number
  difficulty: MissingVowelsDifficulty
  seed: number
  /** Recently printed labels for this template + theme; the model is told not to reuse them. */
  avoid?: string[]
  locale?: string
}

export interface MissingVowelsResponse {
  items: string[]
}
