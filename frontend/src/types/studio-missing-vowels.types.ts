export interface MissingVowelsRequest {
  theme: string
  kind: 'words' | 'phrases'
  itemCount: number
  difficulty: 'easy' | 'medium' | 'hard'
  seed: number
  /** Recently printed labels for this template + theme; the model is told not to reuse them. */
  avoid?: string[]
  locale?: string
}

export interface MissingVowelsResponse {
  items: string[]
}
