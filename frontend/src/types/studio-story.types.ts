export interface StoryRecallRequest {
  theme: string
  length: 'short' | 'medium' | 'long'
  difficulty: 'easy' | 'standard' | 'challenging'
  questionCount: number
  seed: number
  /** Recently printed labels for this template + theme; the model is told not to reuse them. */
  avoid?: string[]
  locale?: string
}

export interface StoryQuestion {
  id: string
  wh: 'who' | 'what' | 'where' | 'when' | 'why' | 'howmany'
  question: string
  answer: string
}

export interface StoryRecallResponse {
  passage: string
  title: string
  questions: StoryQuestion[]
}
