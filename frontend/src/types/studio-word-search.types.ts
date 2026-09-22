export type WordSearchTone = 'funny' | 'heartfelt' | 'classy' | 'sassy'
export type StudioWordSearchDifficulty = 'easy' | 'medium' | 'hard'
export type WordSearchPrintStyle = 'large-print' | 'standard'

export interface WordSearchRequest {
  theme: string
  tone: WordSearchTone
  difficulty: StudioWordSearchDifficulty
  printStyle: WordSearchPrintStyle
  seed: number
  avoid?: string[]
  locale?: string
}

export interface WordSearchResponse {
  words: string[]
}
