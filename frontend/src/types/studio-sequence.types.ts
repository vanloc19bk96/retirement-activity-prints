export type SequenceType = 'arbitrary' | 'steps' | 'story' | 'everyday'
export type SequenceAnswerFormat = 'number-boxes' | 'write-list'
export type SequenceSource = 'ai' | 'curated'

export interface SequenceRequest {
  sequenceType: SequenceType
  itemCount: number
  sequenceCount: number
  theme?: string
  seed: number
  /** Recently printed labels for this template + theme; the model is told not to reuse them. */
  avoid?: string[]
  locale?: string
}

export interface SequenceItem {
  text: string
}

export interface SequenceSet {
  title?: string
  items: SequenceItem[]
}

export interface SequenceResponse {
  sequences: SequenceSet[]
}
