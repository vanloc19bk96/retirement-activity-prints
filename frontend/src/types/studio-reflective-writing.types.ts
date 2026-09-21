/** Shared reflective-writing prompt API (life-timeline + memory journal). */

export type ReflectiveMode = 'life-story' | 'journal'
export type ReflectiveTone = 'gentle' | 'playful' | 'reflective'
export type ReflectiveTimeFrame = 'past' | 'present' | 'future' | 'mixed'

export interface ReflectivePromptRequest {
  mode: ReflectiveMode
  /** Life stage, journal theme, or custom label. */
  stageOrTheme: string
  timeFrame?: ReflectiveTimeFrame
  promptCount: number
  tone: ReflectiveTone
  seed: number
  /** Recently printed labels for this template + theme; the model is told not to reuse them. */
  avoid?: string[]
  locale?: string
}

export interface ReflectivePromptResponse {
  stage: string
  prompts: string[]
}

export interface MemoryJournalRemoteData {
  prompts: string[]
}
