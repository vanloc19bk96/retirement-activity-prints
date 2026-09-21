import { generateMissingVowels } from '@/api/studio-missing-vowels.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig } from '@/types/studio-template.types'
import type { MissingVowelsResponse } from '@/types/studio-missing-vowels.types'
import {
  AI_THEME_MAX_LENGTH,
  aiThemeLabel,
  categoryLabel,
  parseWriteOwnTheme,
  resolveAiThemePrompt,
} from '../crossword/config'
import { filterUnsafeThemeCopy } from '../crossword/content-quality'
import { parseRetirementCategory } from '../retirement-word-search/retirement-themes'
import {
  CANDIDATE_MULTIPLIER,
  MISSING_VOWELS_AI_EMPTY_MESSAGE,
  clampItemCount,
  parseDifficulty,
  selectAiItems,
} from './content'

const MAX_AI_ATTEMPTS = 3

function varietyParts(config: StudioConfig): { category: string; theme: string } {
  const theme = aiThemeLabel(config)
  if (parseWriteOwnTheme(config.writeOwnTheme)) {
    return { category: 'custom', theme }
  }
  return {
    category: categoryLabel(parseRetirementCategory(config.retirementCategory)),
    theme,
  }
}

/**
 * AI-only prefetch — no bundled theme fallback.
 * Retries up to 3 times with avoid lists, then fails visibly.
 */
export async function missingVowelsPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<MissingVowelsResponse> {
  const need = clampItemCount(config.itemCount)
  const difficulty = parseDifficulty(config.difficulty)
  const themeRaw = resolveAiThemePrompt(config).slice(0, AI_THEME_MAX_LENGTH)
  const theme = filterUnsafeThemeCopy(themeRaw) ?? themeRaw
  const { category, theme: themeLabel } = varietyParts(config)
  const varietyKey = studioVarietyKey(
    'missing-vowels',
    category,
    themeLabel || theme,
    difficulty,
  )
  const seed = Number(config.seed ?? 1)

  const rejected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateMissingVowels(
        {
          theme,
          itemCount: need,
          difficulty,
          seed: seed + attempt * 97,
          avoid: [...studioAvoidList(varietyKey), ...rejected],
        },
        signal,
      )
      const items = selectAiItems(remote.items, { count: need, difficulty })
      if (items.length >= need) {
        rememberStudioContent(
          varietyKey,
          items.map((item) => item.display),
        )
        return { items: items.map((item) => item.display) }
      }
      rejected.push(...items.map((item) => item.display))
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[missing-vowels] AI attempt ${attempt + 1} failed`, error)
    }
  }

  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(lastError.message.trim())
  }
  throw new Error(MISSING_VOWELS_AI_EMPTY_MESSAGE)
}

/** Spec: ask AI for about itemCount × 2 candidates (backend applies the multiplier). */
export function candidateRequestCount(itemCount: number): number {
  return itemCount * CANDIDATE_MULTIPLIER
}
