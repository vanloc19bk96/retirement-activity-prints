import { generateCryptogram } from '@/api/studio-cryptogram.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig } from '@/types/studio-template.types'
import type { CryptogramResponse } from '@/types/studio-cryptogram.types'
import {
  AI_THEME_MAX_LENGTH,
  CRYPTOGRAM_AI_EMPTY_MESSAGE,
  parseLength,
  puzzleCountFor,
  resolveAiThemePrompt,
  selectAiSayings,
  aiThemeLabel,
} from './content'
import { filterUnsafeThemeCopy } from './content-quality'

const MAX_AI_ATTEMPTS = 3

/**
 * AI-only prefetch — no bundled saying bank.
 * Retries up to 3 times with avoid lists, then fails visibly.
 */
export async function cryptogramPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<CryptogramResponse> {
  const need = puzzleCountFor(config)
  const length = parseLength(config.length)
  const themeRaw = resolveAiThemePrompt(config).slice(0, AI_THEME_MAX_LENGTH)
  const theme = filterUnsafeThemeCopy(themeRaw) ?? themeRaw
  const label = aiThemeLabel(config) || theme
  const varietyKey = studioVarietyKey('cryptogram', label, length)
  const seed = Number(config.seed ?? 1)

  const rejected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateCryptogram(
        {
          theme,
          itemCount: need,
          length,
          seed: seed + attempt * 97,
          avoid: [...studioAvoidList(varietyKey), ...rejected],
        },
        signal,
      )
      const items = selectAiSayings(remote.items, { count: need, length })
      if (items.length >= need) {
        rememberStudioContent(varietyKey, items)
        return { items }
      }
      rejected.push(...items)
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[cryptogram] AI attempt ${attempt + 1} failed`, error)
    }
  }

  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(lastError.message.trim())
  }
  throw new Error(CRYPTOGRAM_AI_EMPTY_MESSAGE)
}
