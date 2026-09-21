export interface AnagramRequest {
  theme: string
  itemCount: number
  difficulty: 'easy' | 'medium' | 'hard'
  seed: number
  /** Recently printed labels for this template + theme; the model is told not to reuse them. */
  avoid?: string[]
  locale?: string
}

export interface AnagramItemPayload {
  word: string
  hint: string
}

export interface AnagramResponse {
  items: AnagramItemPayload[]
}
