import { generateHiddenMessage } from '@/api/studio-hidden-message.api'
import type { StudioConfig } from '@/types/studio-template.types'
import type { HiddenMessageResponse } from '@/types/studio-hidden-message.types'
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
  HIDDEN_MESSAGE_AI_EMPTY_MESSAGE,
  hasCustomMessage,
  normalizeMessage,
  parseRemotePayload,
  poolCountFor,
  resolveTypedMessage,
  selectHiddenMessageWords,
  toneForSeed,
} from './content'
import { parseHiddenMessageLevel, type HiddenMessageLevel } from './levels'
import { HIDDEN_MESSAGE_THEME_SALT } from './theme'

const MAX_AI_ATTEMPTS = 3

/**
 * Entries that must survive the gates before a pool is accepted.
 *
 * The page has not been measured yet — this runs before any geometry is known —
 * so the reserve is sized for the level's full word ceiling plus room for the
 * page to shorten the letter ceiling to whatever the grid turns out to be.
 * Coming back here for a second call costs a paid request against a per-minute
 * quota, so it is worth over-asking once.
 */
function minUsablePool(level: HiddenMessageLevel): number {
  return Math.min(poolCountFor(level.maxWords), level.maxWords + 8)
}

/**
 * AI-only — there is no bundled bank of retirement sayings behind this.
 *
 * A packaged list would make every seller's book hide the same few dozen
 * sayings, which is the fastest way to two KDP titles that look copied from
 * each other. Retrying with an avoid list and then failing visibly is the
 * honest alternative.
 */
export async function hiddenMessagePrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<HiddenMessageResponse> {
  const seed = Number(config.seed ?? 1)
  const level = parseHiddenMessageLevel(config)
  const theme = resolveRetirementTheme(config, seed, HIDDEN_MESSAGE_THEME_SALT)
  const tone = toneForSeed(seed)
  const custom = resolveTypedMessage(config)
  const customMessage = hasCustomMessage(custom)
    ? (normalizeMessage(custom, level)?.display ?? custom)
    : undefined
  const need = minUsablePool(level)

  const promptTheme = (filterUnsafeThemeCopy(theme.prompt) ?? theme.prompt).slice(
    0,
    AI_THEME_MAX_LENGTH,
  )
  const varietyKey = studioVarietyKey(
    'hidden-message-word-search',
    theme.label || promptTheme,
    level.id,
  )

  const rejected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateHiddenMessage(
        {
          theme: promptTheme,
          tone,
          count: poolCountFor(level.maxWords),
          minLetters: level.minLetters,
          maxLetters: level.maxLetters,
          minMessageLetters: level.minMessageLetters,
          maxMessageLetters: level.maxMessageLetters,
          seed: seed + attempt * 97,
          ...(customMessage ? { customMessage } : {}),
          avoid: [...studioAvoidList(varietyKey), ...rejected],
          locale: String(config.locale ?? 'en'),
        },
        signal,
      )

      const payload = parseRemotePayload(remote)
      if (!payload) {
        lastError = new Error(HIDDEN_MESSAGE_AI_EMPTY_MESSAGE)
        continue
      }

      // The saying is checked here rather than at generate, because a saying
      // outside the level's band is the one failure a second call can fix.
      const message = normalizeMessage(customMessage ?? payload.message, level)
      const entries = selectHiddenMessageWords(payload.words, {
        level,
        maxLetters: level.maxLetters,
      })
      if (message && entries.length >= need) {
        rememberStudioContent(varietyKey, [
          message.display,
          ...entries.map((entry) => entry.display),
        ])
        return { message: message.display, words: entries.map((entry) => entry.display) }
      }

      // A short pool is still usable copy — tell the next attempt not to repeat
      // it, so the retry spends its tokens on new words.
      rejected.push(...entries.map((entry) => entry.display))
      lastError = new Error(HIDDEN_MESSAGE_AI_EMPTY_MESSAGE)
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[hidden-message-word-search] AI attempt ${attempt + 1} failed`, error)
    }
  }

  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(lastError.message.trim())
  }
  throw new Error(HIDDEN_MESSAGE_AI_EMPTY_MESSAGE)
}
