export interface RetirementAnagramRequest {
  topic: string
  itemCount: number
  difficulty: 'easy' | 'medium' | 'hard'
  seed: number
  /** Recently printed answers for this template + topic; model avoids reusing them. */
  avoid?: string[]
  locale?: string
}

export interface RetirementAnagramResponse {
  items: string[]
}
