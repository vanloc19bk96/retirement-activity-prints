export type HiddenMessageTone = 'funny' | 'heartfelt' | 'classy' | 'sassy'
export type HiddenMessageDifficulty = 'easy' | 'medium' | 'hard'

export interface HiddenMessageRequest {
  theme: string
  tone: HiddenMessageTone
  difficulty: HiddenMessageDifficulty
  seed: number
  /** When set, the model writes only the word pool. */
  customMessage?: string
  /** Recently printed labels for this template + theme. */
  avoid?: string[]
  locale?: string
}

export interface HiddenMessageResponse {
  message: string
  words: string[]
}
