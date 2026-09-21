import { generateStory } from '@/api/studio-story.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig } from '@/types/studio-template.types'
import type {
  StoryRecallRequest,
  StoryRecallResponse,
} from '@/types/studio-story.types'
import { resolveStoryFallback } from './fallback'

function asLength(value: unknown): StoryRecallRequest['length'] {
  return value === 'short' || value === 'long' ? value : 'medium'
}

function asDifficulty(value: unknown): StoryRecallRequest['difficulty'] {
  return value === 'easy' || value === 'challenging' ? value : 'standard'
}

const THEME_MAX_LENGTH = 120

function resolveTheme(config: StudioConfig): string {
  if (config.customTheme === true) {
    const custom = String(config.customThemeText ?? '').trim().slice(0, THEME_MAX_LENGTH)
    if (custom) return custom
  }
  return String(config.theme ?? 'everyday life')
}

export async function storyRecallPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<StoryRecallResponse> {
  const theme = resolveTheme(config)
  const questionCount = Number(config.questionCount ?? 5)
  const seed = Number(config.seed ?? 1)
  const length = asLength(config.length)
  const difficulty = asDifficulty(config.difficulty)
  const varietyKey = studioVarietyKey('story-recall', theme, length, difficulty)

  try {
    const remote = await generateStory(
      {
        theme,
        length,
        difficulty,
        questionCount,
        seed,
        avoid: studioAvoidList(varietyKey),
      },
      signal,
    )
    // The title stands in for the whole story: same title, same page.
    rememberStudioContent(varietyKey, [remote.title])
    return remote
  } catch (error) {
    if (signal.aborted) throw error
    // Offline / API outage: still produce a valid printable page.
    console.warn('[story-recall] API failed; using bundled fallback', error)
    return resolveStoryFallback(theme, questionCount, seed)
  }
}
