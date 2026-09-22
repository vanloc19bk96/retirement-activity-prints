import { generateMissingVowels } from '@/api/studio-missing-vowels.api'
import type { StudioConfig } from '@/types/studio-template.types'
import type { MissingVowelsResponse } from '@/types/studio-missing-vowels.types'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import {
  AI_THEME_MAX_LENGTH,
  resolveRetirementTheme,
} from '../_shared/retirement-theme-config'
import { filterUnsafeThemeCopy } from '../retirement-word-search/content-quality'
import {
  MAX_CLUE_CHARS,
  MISSING_VOWELS_AI_EMPTY_MESSAGE,
  candidateCountFor,
  selectAiItems,
} from './content'
import { parseMissingVowelsLevel } from './levels'
import { MISSING_VOWELS_THEME_SALT } from './theme'

const MAX_AI_ATTEMPTS = 3

/**
 * AI-only — there is no bundled word bank behind this.
 *
 * A packaged list would make every seller's book draw on the same few hundred
 * words, which is the fastest way to two KDP titles that look copied from each
 * other. Retrying with an avoid list and then failing visibly is the honest
 * alternative.
 *
 * Asks for the level's target count plus a wide margin even though the page may
 * print fewer: the page size is not known here, and the vowel-pattern gate in
 * the browser — which the service cannot run, because the word list lives in
 * the bundle — throws out perfectly good retirement words for sharing their
 * blanks with something else. Over-requesting costs one field in the same call;
 * a second paid call costs a call. Rejected answers join the avoid list, so the
 * retry is asked for something new rather than handed the same pool twice.
 */
export async function missingVowelsPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<MissingVowelsResponse> {
  const seed = Number(config.seed ?? 1)
  const level = parseMissingVowelsLevel(config)
  const theme = resolveRetirementTheme(config, seed, MISSING_VOWELS_THEME_SALT)
  const need = level.targetItems

  const promptTheme = (filterUnsafeThemeCopy(theme.prompt) ?? theme.prompt).slice(
    0,
    AI_THEME_MAX_LENGTH,
  )
  const varietyKey = studioVarietyKey(
    'missing-vowels',
    theme.label || promptTheme,
    level.id,
  )

  const rejected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateMissingVowels(
        {
          theme: promptTheme,
          count: candidateCountFor(need),
          minLetters: level.minLetters,
          maxLetters: level.maxLetters,
          maxWords: level.maxWords,
          maxClueChars: MAX_CLUE_CHARS,
          seed: seed + attempt * 97,
          avoid: [...studioAvoidList(varietyKey), ...rejected],
        },
        signal,
      )
      const items = selectAiItems(remote.items, {
        count: candidateCountFor(need),
        level,
      })
      if (items.length >= need) {
        rememberStudioContent(
          varietyKey,
          items.map((item) => item.answer),
        )
        return {
          items: items.map((item) => ({ answer: item.answer, clue: item.clue })),
        }
      }
      rejected.push(...items.map((item) => item.answer))
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
