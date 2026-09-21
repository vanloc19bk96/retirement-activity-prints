import { generateLifePrompts } from '@/api/studio-life-timeline.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig } from '@/types/studio-template.types'
import type {
  MemoryJournalRemoteData,
  ReflectiveTimeFrame,
  ReflectiveTone,
} from '@/types/studio-reflective-writing.types'
import { resolveJournalTheme } from './theme'

function asTone(value: unknown): ReflectiveTone {
  return value === 'playful' || value === 'reflective' ? value : 'gentle'
}

function asTimeFrame(value: unknown): ReflectiveTimeFrame {
  return value === 'past' || value === 'present' || value === 'future'
    ? value
    : 'mixed'
}

function neededPromptCount(config: StudioConfig): number {
  // One page per generate click.
  const perPage = Number(config.promptsPerPage ?? 1) === 2 ? 2 : 1
  return perPage
}

/**
 * Prompts are written by the model for the theme the author chose — there is no
 * local bank to fall back on, so a failed call surfaces as an error the author
 * can retry rather than a page of stale, repeated prompts.
 */
export async function reflectivePrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<MemoryJournalRemoteData> {
  const count = neededPromptCount(config)
  const theme = resolveJournalTheme(config)
  const tone = asTone(config.tone)
  const timeFrame = asTimeFrame(config.timeFrame)
  const seed = Number(config.seed ?? 1)
  const varietyKey = studioVarietyKey('memory-journal-prompt', theme, tone, timeFrame)

  const res = await generateLifePrompts(
    {
      mode: 'journal',
      stage: theme,
      timeFrame,
      promptCount: count,
      tone,
      seed,
      avoid: studioAvoidList(varietyKey),
    },
    signal,
  )
  const prompts = res.prompts.slice(0, count)
  if (prompts.length < count) {
    throw new Error(
      `Memory journal returned ${prompts.length} prompts; needed ${count}`,
    )
  }
  rememberStudioContent(varietyKey, prompts)
  return { prompts }
}
