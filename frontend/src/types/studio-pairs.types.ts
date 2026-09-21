export type PairType = 'arbitrary' | 'related' | 'word-picture'
export type PairAnswerFormat = 'write-in' | 'matching' | 'multiple-choice'
export type PairTestDirection = 'forward' | 'backward' | 'mixed'
export type PairSource = 'ai' | 'curated'

export interface PairRequest {
  pairType: PairType
  pairCount: number
  exerciseCount: number
  seed: number
  /** Recently printed labels for this template + theme; the model is told not to reuse them. */
  avoid?: string[]
  locale?: string
}

export interface WordPair {
  left: string
  right: string
  /** Outline image for the right half (word-picture mode). */
  rightImageUrl?: string
  rightNaturalWidth?: number
  rightNaturalHeight?: number
}

export interface PairSet {
  pairs: WordPair[]
}

export interface PairResponse {
  sets: PairSet[]
}
