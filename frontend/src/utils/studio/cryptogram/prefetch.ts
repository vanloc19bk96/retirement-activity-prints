import { generateCryptogram } from '@/api/studio-cryptogram.api'
import type { StudioConfig } from '@/types/studio-template.types'
import type { CryptogramResponse } from '@/types/studio-cryptogram.types'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import {
  AI_THEME_MAX_LENGTH,
  resolveRetirementTheme,
} from '../_shared/retirement-theme-config'
import {
  CRYPTOGRAM_AI_EMPTY_MESSAGE,
  candidateCountFor,
  selectAiSayings,
} from './content'
import { filterUnsafeThemeCopy } from './content-quality'
import { CRYPTOGRAM_THEME_SALT } from './theme'
import { parseCryptogramLevel } from './levels'

const MAX_AI_ATTEMPTS = 3

/**
 * AI-only — there is no bundled saying bank behind this.
 *
 * A packaged list would make every seller's book draw on the same few hundred
 * lines, which is the fastest way to two KDP titles that look copied from each
 * other. Retrying with an avoid list and then failing visibly is the honest
 * alternative.
 *
 * Asks for the level's target count even though the page may print fewer: the
 * page size is not known here, and over-requesting costs one field in the same
 * call.
 */
export async function cryptogramPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<CryptogramResponse> {
  const seed = Number(config.seed ?? 1)
  const level = parseCryptogramLevel(config)
  const theme = resolveRetirementTheme(config, seed, CRYPTOGRAM_THEME_SALT)
  const need = level.targetPuzzles

  const promptTheme = (
    filterUnsafeThemeCopy(theme.prompt) ?? theme.prompt
  ).slice(0, AI_THEME_MAX_LENGTH)
  const varietyKey = studioVarietyKey('cryptogram', theme.label || promptTheme, level.id)

  const rejected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateCryptogram(
        {
          theme: promptTheme,
          itemCount: need,
          length: level.length,
          seed: seed + attempt * 97,
          avoid: [...studioAvoidList(varietyKey), ...rejected],
        },
        signal,
      )
      const items = selectAiSayings(remote.items, { count: need, length: level.length })
      if (items.length >= need) {
        rememberStudioContent(varietyKey, items)
        return { items: items.slice(0, candidateCountFor(need)) }
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
