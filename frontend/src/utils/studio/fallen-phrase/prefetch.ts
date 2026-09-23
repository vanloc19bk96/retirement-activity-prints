import { generateFallenPhrase } from '@/api/studio-fallen-phrase.api'
import type { StudioConfig } from '@/types/studio-template.types'
import type { FallenPhraseResponse } from '@/types/studio-fallen-phrase.types'
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
  FALLEN_PHRASE_AI_EMPTY_MESSAGE,
  candidateCountFor,
  selectAiPhrases,
} from './content'
import { buildFallenPhraseGrid } from './grid'
import { COLUMN_FLEX, parseFallenPhraseLevel, rowCandidatesFor } from './levels'
import { FALLEN_PHRASE_THEME_SALT } from './theme'

const MAX_AI_ATTEMPTS = 3

/** Phrases a page needs before it starts discarding them. */
const NEED = 1

/**
 * AI-only — there is no bundled saying bank behind this.
 *
 * A packaged list would make every seller's book draw on the same few hundred
 * lines, which is the fastest way to two KDP titles that look copied from each
 * other. Retrying with an avoid list and then failing visibly is the honest
 * alternative.
 *
 * The attempt loop does something the cryptogram's does not: it *grids a
 * saying here* before accepting the reply. A phrase can pass every gate in
 * `content.ts` and still not settle into the level's rows — a saying of four
 * long words has nowhere to break — and finding that out in `generate` means
 * an error card where a page should be. Finding it out here costs a retry, and
 * the phrases that would not grid join the avoid list, so the retry is asked
 * for something new rather than handed the same shapes twice.
 *
 * It over-requests for the same reason: the page keeps the first candidate it
 * can both grid at the trim's own column count and validate, and the trim is
 * not known here.
 */
export async function fallenPhrasePrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<FallenPhraseResponse> {
  const seed = Number(config.seed ?? 1)
  const level = parseFallenPhraseLevel(config)
  const theme = resolveRetirementTheme(config, seed, FALLEN_PHRASE_THEME_SALT)

  const promptTheme = (filterUnsafeThemeCopy(theme.prompt) ?? theme.prompt).slice(
    0,
    AI_THEME_MAX_LENGTH,
  )
  const varietyKey = studioVarietyKey(
    'fallen-phrase',
    theme.label || promptTheme,
    level.id,
  )
  const rowCandidates = rowCandidatesFor(level)
  // The same spread of widths `layout.ts` would offer a mid-sized trim. A
  // stricter probe here would reject sayings the page could have printed.
  const widths = [
    level.preferredCols - COLUMN_FLEX,
    level.preferredCols,
    level.preferredCols + COLUMN_FLEX,
  ]

  const rejected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateFallenPhrase(
        {
          theme: promptTheme,
          itemCount: NEED,
          length: level.length,
          seed: seed + attempt * 97,
          avoid: [...studioAvoidList(varietyKey), ...rejected],
        },
        signal,
      )

      const phrases = selectAiPhrases(remote.items, {
        count: NEED,
        length: level.length,
      })
      const gridable = phrases.filter((phrase) =>
        buildFallenPhraseGrid({
          phrase,
          colCandidates: widths,
          rowCandidates,
          targetRows: level.rows,
          preferredCols: level.preferredCols,
          seed,
        }),
      )

      if (gridable.length >= NEED) {
        rememberStudioContent(varietyKey, phrases)
        // Every valid phrase, not only the ones that gridded here. The trim
        // decides the real column count and this call does not know it, so a
        // saying that will not settle at the level's own width may settle
        // perfectly at the narrower one a 5 x 8 interior prints. Filtering on
        // this width would throw that saying away before the page ever saw it.
        return { items: phrases.slice(0, candidateCountFor(NEED)) }
      }
      rejected.push(...phrases)
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[fallen-phrase] AI attempt ${attempt + 1} failed`, error)
    }
  }

  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(lastError.message.trim())
  }
  throw new Error(FALLEN_PHRASE_AI_EMPTY_MESSAGE)
}
