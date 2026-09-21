import { generateMissingVowels } from '@/api/studio-missing-vowels.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig } from '@/types/studio-template.types'
import type {
  MissingVowelsRequest,
  MissingVowelsResponse,
} from '@/types/studio-missing-vowels.types'
import { resolveMissingVowelsFallback } from './fallback'
import { clampItemCount, parseDifficulty, resolveThemePrompt } from './content'

const THEME_MAX_LENGTH = 120
/** AI mode is words-only — no phrase generation. */
const AI_KIND = 'words' as const

export async function missingVowelsPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<MissingVowelsResponse> {
  const itemCount = clampItemCount(config.itemCount)
  const difficulty = parseDifficulty(config.difficulty)
  const theme = resolveThemePrompt(config).slice(0, THEME_MAX_LENGTH)
  const seed = Number(config.seed ?? 1)

  const varietyKey = studioVarietyKey('missing-vowels', theme, AI_KIND, difficulty)
  const req: MissingVowelsRequest = {
    theme,
    kind: AI_KIND,
    itemCount,
    difficulty,
    seed,
    avoid: studioAvoidList(varietyKey),
  }

  try {
    const remote = await generateMissingVowels(req, signal)
    rememberStudioContent(varietyKey, remote.items)
    return remote
  } catch (error) {
    if (signal.aborted) throw error
    console.warn('[missing-vowels] API failed; using bundled fallback', error)
    return resolveMissingVowelsFallback(itemCount, AI_KIND, difficulty, seed)
  }
}
