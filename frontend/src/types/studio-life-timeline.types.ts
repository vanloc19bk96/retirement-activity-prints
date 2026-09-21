import type {
  ReflectiveMode,
  ReflectiveTimeFrame,
} from '@/types/studio-reflective-writing.types'

/** Preset stage keys, `timeline`, or a custom label typed by the author. */
export type LifeTimelineStage = string

export type LifeTimelineTone = 'gentle' | 'playful' | 'reflective'

export interface LifeTimelineRequest {
  mode?: ReflectiveMode
  stage: LifeTimelineStage
  /** Alias accepted by the shared life-prompts API. */
  stageOrTheme?: string
  timeFrame?: ReflectiveTimeFrame
  promptCount: number
  tone: LifeTimelineTone
  seed: number
  /** Recently printed labels for this template + theme; the model is told not to reuse them. */
  avoid?: string[]
  locale?: string
}

export interface LifeTimelineResponse {
  stage: string
  prompts: string[]
}

/** Prefetch result: prompts keyed by stage (or `timeline`). */
export type LifeTimelineRemoteData = Record<string, string[]>
