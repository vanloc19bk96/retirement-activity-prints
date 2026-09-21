import { generateAnagram } from '@/api/studio-anagram.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig } from '@/types/studio-template.types'
import type { AnagramRequest, AnagramResponse } from '@/types/studio-anagram.types'
import { resolveAnagramFallback } from './fallback'
import { clampItemCount, parseDifficulty, resolveThemePrompt } from './words'

const THEME_MAX_LENGTH = 120

function asDifficulty(value: unknown): AnagramRequest['difficulty'] {
  return parseDifficulty(value)
}

export async function anagramPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<AnagramResponse> {
  const itemCount = clampItemCount(config.itemCount)
  const difficulty = asDifficulty(config.difficulty)
  const theme = resolveThemePrompt(config).slice(0, THEME_MAX_LENGTH)
  const seed = Number(config.seed ?? 1)
  const varietyKey = studioVarietyKey('anagram-sheet', theme, difficulty)

  try {
    const remote = await generateAnagram(
      {
        theme,
        itemCount,
        difficulty,
        seed,
        avoid: studioAvoidList(varietyKey),
      },
      signal,
    )
    rememberStudioContent(
      varietyKey,
      remote.items.map((item) => item.word),
    )
    return remote
  } catch (error) {
    if (signal.aborted) throw error
    console.warn('[anagram-sheet] API failed; using bundled fallback', error)
    return resolveAnagramFallback(itemCount, difficulty, seed)
  }
}
