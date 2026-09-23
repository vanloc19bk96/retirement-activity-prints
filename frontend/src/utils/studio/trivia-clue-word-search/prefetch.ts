import { generateTriviaClues } from '@/api/studio-trivia-clues.api'
import type { StudioConfig } from '@/types/studio-template.types'
import type { TriviaCluesResponse } from '@/types/studio-trivia-clues.types'
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
  TRIVIA_AI_EMPTY_MESSAGE,
  candidateCountFor,
  parseRemotePayload,
  selectTriviaEntries,
} from './content'
import { parseTriviaLevel, type TriviaLevel } from './levels'
import { TRIVIA_THEME_SALT } from './theme'

const MAX_AI_ATTEMPTS = 3

/**
 * Pairs that must survive the gates before a pool is accepted.
 *
 * The page has not been measured yet — this runs before any geometry is known
 * — so the reserve is sized for the level's full target plus room for the page
 * to shorten both the letter ceiling and the clue column to whatever the trim
 * turns out to be. Coming back here for a second call costs a paid request
 * against a per-minute quota, so it is worth over-asking once.
 */
function minUsablePool(level: TriviaLevel): number {
  return Math.min(candidateCountFor(level.targetClues), level.targetClues + 6)
}

/**
 * AI-only — there is no bundled bank of retirement trivia behind this.
 *
 * A packaged list would make every seller's book ask the same few hundred
 * questions, which is the fastest way to two KDP titles that look copied from
 * each other. Retrying with an avoid list and then failing visibly is the
 * honest alternative.
 */
export async function triviaCluesPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<TriviaCluesResponse> {
  const seed = Number(config.seed ?? 1)
  const level = parseTriviaLevel(config)
  const theme = resolveRetirementTheme(config, seed, TRIVIA_THEME_SALT)
  const need = minUsablePool(level)

  const promptTheme = (filterUnsafeThemeCopy(theme.prompt) ?? theme.prompt).slice(
    0,
    AI_THEME_MAX_LENGTH,
  )
  const varietyKey = studioVarietyKey(
    'trivia-clue-word-search',
    theme.label || promptTheme,
    level.id,
  )

  const rejected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateTriviaClues(
        {
          theme: promptTheme,
          difficulty: level.apiDifficulty,
          count: candidateCountFor(level.targetClues),
          minLetters: level.minLetters,
          maxLetters: level.maxLetters,
          maxClueChars: level.clueMaxChars,
          seed: seed + attempt * 97,
          avoid: [...studioAvoidList(varietyKey), ...rejected],
          locale: String(config.locale ?? 'en'),
        },
        signal,
      )

      const payload = parseRemotePayload(remote)
      // Measured against the level's bands only: the page's own clue column is
      // not known here, so the width gate runs again at generate time.
      const entries = payload
        ? selectTriviaEntries(payload.items, {
            minLetters: level.minLetters,
            maxLetters: level.maxLetters,
            maxClueChars: level.clueMaxChars,
          })
        : []

      if (entries.length >= need) {
        rememberStudioContent(
          varietyKey,
          entries.map((entry) => entry.token),
        )
        return {
          items: entries.map((entry) => ({ answer: entry.token, clue: entry.clue })),
        }
      }

      // A short pool is still usable copy — tell the next attempt not to repeat
      // it, so the retry spends its tokens on new clues.
      rejected.push(...entries.map((entry) => entry.token))
      lastError = new Error(TRIVIA_AI_EMPTY_MESSAGE)
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[trivia-clue-word-search] AI attempt ${attempt + 1} failed`, error)
    }
  }

  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(lastError.message.trim())
  }
  throw new Error(TRIVIA_AI_EMPTY_MESSAGE)
}
