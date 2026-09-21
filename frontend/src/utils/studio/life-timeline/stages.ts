import type { StudioConfig } from '@/types/studio-template.types'

export const LIFE_STAGES = [
  { key: 'childhood', label: 'Childhood', hint: 'home, family, play, food, pets' },
  { key: 'school', label: 'School Days', hint: 'teachers, friends, subjects, journeys' },
  {
    key: 'youngAdult',
    label: 'Young Adulthood',
    hint: 'first job, first home, freedom, music',
  },
  { key: 'work', label: 'Work & Callings', hint: 'trades, colleagues, proud moments' },
  {
    key: 'family',
    label: 'Family & Friends',
    hint: 'celebrations, traditions, neighbours',
  },
  {
    key: 'places',
    label: 'Places & Journeys',
    hint: 'towns lived in, holidays, moves',
  },
  {
    key: 'laterLife',
    label: 'Later Years',
    hint: 'hobbies, grandchildren, everyday joys',
  },
] as const

export type LifeStageKey = (typeof LIFE_STAGES)[number]['key']

export const DEFAULT_STAGE_KEY: LifeStageKey = 'childhood'

/** Max characters per custom stage name (matches backend stage field). */
export const CUSTOM_STAGE_LABEL_MAX = 60

const DEFAULT_CUSTOM_STAGE = 'My life chapter'

const STAGE_KEY_SET = new Set<string>(LIFE_STAGES.map((s) => s.key))

export function isLifeStageKey(value: string): value is LifeStageKey {
  return STAGE_KEY_SET.has(value)
}

function resolvePresetStage(config: StudioConfig): LifeStageKey {
  const raw = config.stage
  if (typeof raw === 'string' && isLifeStageKey(raw)) return raw
  // Legacy multi-select configs stored an array under `stages`.
  if (Array.isArray(config.stages)) {
    const first = config.stages.map((s) => String(s)).find(isLifeStageKey)
    if (first) return first
  }
  return DEFAULT_STAGE_KEY
}

function resolveCustomStage(config: StudioConfig): string {
  const label = String(config.customStagesText ?? '')
    .trim()
    .slice(0, CUSTOM_STAGE_LABEL_MAX)
  return label || DEFAULT_CUSTOM_STAGE
}

/** Stage to generate — one preset key or one custom label. */
export function selectedStages(config: StudioConfig): string[] {
  if (config.customStages === true) {
    return [resolveCustomStage(config)]
  }
  return [resolvePresetStage(config)]
}
