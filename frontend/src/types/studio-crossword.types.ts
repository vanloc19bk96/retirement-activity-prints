export interface CrosswordCluesRequest {
  /** When set, AI invents answers + clues for this theme. */
  theme?: string
  /** When set (legacy custom words), AI writes clues for these answers. */
  words?: string[]
  itemCount?: number
  minLetters?: number
  maxLetters?: number
  difficulty: 'easy' | 'medium' | 'hard'
  seed: number
  /** Recently printed labels for this template + theme; the model is told not to reuse them. */
  avoid?: string[]
  locale?: string
}

export interface CrosswordClueItem {
  word: string
  clue: string
}

export interface CrosswordCluesResponse {
  clues: CrosswordClueItem[]
}
