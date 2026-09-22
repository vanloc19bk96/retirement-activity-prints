import { generateRetirementAnagram } from '@/api/studio-retirement-anagram.api'
import type { StudioConfig } from '@/types/studio-template.types'
import type { RetirementAnagramResponse } from '@/types/studio-retirement-anagram.types'
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
  RETIREMENT_ANAGRAM_AI_EMPTY_MESSAGE,
  candidateCountFor,
  selectAiItems,
} from './content'
import { parseAnagramLevel } from './levels'
import { ANAGRAM_THEME_SALT } from './theme'

const MAX_AI_ATTEMPTS = 3

/**
 * AI-only — there is no bundled word bank behind this.
 *
 * A packaged list would make every seller's book draw on the same few hundred
 * words, which is the fastest way to two KDP titles that look copied from each
 * other. Retrying with an avoid list and then failing visibly is the honest
 * alternative.
 *
 * Asks for the level's target count even though the page may print fewer: the
 * page size is not known here, and over-requesting costs one field in the same
 * call. Rejected words join the avoid list, so the retry is asked for something
 * new rather than being handed the same pool twice.
 */
export async function retirementAnagramPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<RetirementAnagramResponse> {
  const seed = Number(config.seed ?? 1)
  const level = parseAnagramLevel(config)
  const theme = resolveRetirementTheme(config, seed, ANAGRAM_THEME_SALT)
  const need = level.targetItems

  const promptTheme = (filterUnsafeThemeCopy(theme.prompt) ?? theme.prompt).slice(
    0,
    AI_THEME_MAX_LENGTH,
  )
  const varietyKey = studioVarietyKey(
    'retirement-anagram',
    theme.label || promptTheme,
    level.id,
  )

  const rejected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateRetirementAnagram(
        {
          theme: promptTheme,
          count: candidateCountFor(need),
          minLetters: level.minLetters,
          maxLetters: level.maxLetters,
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
        return { items: items.map((item) => ({ word: item.answer, clue: item.clue })) }
      }
      rejected.push(...items.map((item) => item.answer))
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[retirement-anagram] AI attempt ${attempt + 1} failed`, error)
    }
  }

  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(lastError.message.trim())
  }
  throw new Error(RETIREMENT_ANAGRAM_AI_EMPTY_MESSAGE)
}
