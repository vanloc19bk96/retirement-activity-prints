import { generateWordSearchWords } from '@/api/studio-word-search.api'
import type { StudioConfig } from '@/types/studio-template.types'
import type { WordSearchResponse } from '@/types/studio-word-search.types'
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
  WORD_SEARCH_AI_EMPTY_MESSAGE,
  candidateCountFor,
  selectWordEntries,
} from './content'
import { filterUnsafeThemeCopy } from './content-quality'
import { parseWordSearchLevel, type WordSearchLevel } from './levels'
import { WORD_SEARCH_THEME_SALT } from './theme'

const MAX_AI_ATTEMPTS = 3

/**
 * Entries that must survive the gates before a pool is accepted.
 *
 * The page has not been measured yet — this runs before any geometry is known
 * — so the reserve is sized for the level's full target plus room for the page
 * to shorten the letter ceiling to whatever the grid turns out to be. Coming
 * back here for a second call costs a paid request against a per-minute quota,
 * so it is worth over-asking once.
 */
function minUsablePool(level: WordSearchLevel): number {
  return Math.min(candidateCountFor(level.targetWords), level.targetWords + 5)
}

/**
 * AI-only — there is no bundled retirement word bank behind this.
 *
 * A packaged list would make every seller's book draw on the same few hundred
 * words, which is the fastest way to two KDP titles that look copied from each
 * other. Retrying with an avoid list and then failing visibly is the honest
 * alternative.
 */
export async function wordSearchPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<WordSearchResponse> {
  const seed = Number(config.seed ?? 1)
  const level = parseWordSearchLevel(config)
  const theme = resolveRetirementTheme(config, seed, WORD_SEARCH_THEME_SALT)
  const need = minUsablePool(level)

  const promptTheme = (filterUnsafeThemeCopy(theme.prompt) ?? theme.prompt).slice(
    0,
    AI_THEME_MAX_LENGTH,
  )
  const varietyKey = studioVarietyKey('word-search', theme.label || promptTheme, level.id)

  const rejected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateWordSearchWords(
        {
          theme: promptTheme,
          count: candidateCountFor(level.targetWords),
          minLetters: level.minLetters,
          maxLetters: level.maxLetters,
          seed: seed + attempt * 97,
          avoid: [...studioAvoidList(varietyKey), ...rejected],
          locale: String(config.locale ?? 'en'),
        },
        signal,
      )
      const entries = selectWordEntries(remote.words, {
        minLetters: level.minLetters,
        maxLetters: level.maxLetters,
      })
      if (entries.length >= need) {
        rememberStudioContent(varietyKey, entries.map((entry) => entry.display))
        return { words: entries.map((entry) => entry.display) }
      }
      // A short pool is still usable copy — tell the next attempt not to
      // repeat it, so the retry spends its tokens on new words.
      rejected.push(...entries.map((entry) => entry.display))
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[word-search] AI attempt ${attempt + 1} failed`, error)
    }
  }

  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(lastError.message.trim())
  }
  throw new Error(WORD_SEARCH_AI_EMPTY_MESSAGE)
}
