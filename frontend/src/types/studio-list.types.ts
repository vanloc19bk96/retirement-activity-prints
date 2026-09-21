export interface ListRecallRequest {
  listLength: number
  distractorCount: number
  distractorDifficulty: 'easy' | 'standard' | 'challenging'
  category: 'mixed' | 'produce' | 'pantry' | 'household'
  /** Free-text theme when the user opts out of preset categories. */
  theme?: string
  seed: number
  /** Recently printed labels for this template + theme; the model is told not to reuse them. */
  avoid?: string[]
  locale?: string
}

export interface ListItem {
  label: string
  isTarget: boolean
  tier?: 'plain' | 'category' | 'qualitative'
}

export interface ListRecallResponse {
  targets: string[]
  options: ListItem[]
}
