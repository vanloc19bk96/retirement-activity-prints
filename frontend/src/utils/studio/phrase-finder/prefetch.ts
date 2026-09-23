import { generatePhraseFinder } from '@/api/studio-phrase-finder.api'
import type { StudioConfig } from '@/types/studio-template.types'
import type { PhraseFinderResponse } from '@/types/studio-phrase-finder.types'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import {
  AI_THEME_MAX_LENGTH,
  resolveRetirementTheme,
} from '../_shared/retirement-theme-config'
import { filterUnsafeThemeCopy } from '../cryptogram/content-quality'
import {
  MAX_CLUE_CHARS,
  PHRASE_FINDER_AI_EMPTY_MESSAGE,
  candidateCountFor,
  selectAiItems,
} from './content'
import { parsePhraseFinderLevel } from './levels'
import { PHRASE_FINDER_THEME_SALT } from './theme'

const MAX_AI_ATTEMPTS = 3

/**
 * AI-only — there is no bundled phrase bank behind this.
 *
 * A packaged list would make every seller's book draw on the same few hundred
 * lines, which is the fastest way to two KDP titles that look copied from each
 * other. Retrying with an avoid list and then failing visibly is the honest
 * alternative.
 *
 * Asks for the level's target count even though the page may print fewer: the
 * trim is not known here, and over-requesting costs one field in the same call.
 * The phrases that came back but did not pass the gates join the avoid list, so
 * a retry is asked for something new rather than handed the same shapes twice.
 *
 * The clue budget goes out with the request rather than being trimmed on the
 * way back, because a clue cut to fit a column stops being a clue: it is the
 * one line that makes the saying reachable, and half of one points nowhere.
 */
export async function phraseFinderPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<PhraseFinderResponse> {
  const seed = Number(config.seed ?? 1)
  const level = parsePhraseFinderLevel(config)
  const theme = resolveRetirementTheme(config, seed, PHRASE_FINDER_THEME_SALT)
  const need = level.targetPuzzles

  const promptTheme = (filterUnsafeThemeCopy(theme.prompt) ?? theme.prompt).slice(
    0,
    AI_THEME_MAX_LENGTH,
  )
  const varietyKey = studioVarietyKey(
    'phrase-finder',
    theme.label || promptTheme,
    level.id,
  )

  const rejected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generatePhraseFinder(
        {
          theme: promptTheme,
          itemCount: need,
          length: level.length,
          maxClueChars: MAX_CLUE_CHARS,
          seed: seed + attempt * 97,
          avoid: [...studioAvoidList(varietyKey), ...rejected],
        },
        signal,
      )
      const items = selectAiItems(remote.items, { count: need, length: level.length })
      if (items.length >= need) {
        rememberStudioContent(
          varietyKey,
          items.map((item) => item.text),
        )
        return { items: items.slice(0, candidateCountFor(need)) }
      }
      rejected.push(...items.map((item) => item.text))
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[phrase-finder] AI attempt ${attempt + 1} failed`, error)
    }
  }

  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(lastError.message.trim())
  }
  throw new Error(PHRASE_FINDER_AI_EMPTY_MESSAGE)
}
