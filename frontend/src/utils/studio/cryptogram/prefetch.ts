import { generateCryptogram } from '@/api/studio-cryptogram.api'
import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import type { CryptogramResponse } from '@/types/studio-cryptogram.types'
import {
  STUDIO_AVOID_LIMIT,
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
  normalizeSaying,
  selectAiSayings,
} from './content'
import { filterUnsafeThemeCopy, withoutBookRepeats } from './content-quality'
import { CRYPTOGRAM_TEMPLATE_KEY, CRYPTOGRAM_THEME_SALT } from './theme'
import { parseCryptogramLevel } from './levels'

const MAX_AI_ATTEMPTS = 3

/** Book sayings sent to the writer as avoid hints, newest first. */
const BOOK_AVOID_HINTS = 40

/** Case-folded, order-kept, capped: the shape the service's avoid list takes. */
function dedupeLabels(labels: readonly string[], limit: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const label of labels) {
    const folded = label.trim().toLowerCase()
    if (!folded || seen.has(folded)) continue
    seen.add(folded)
    out.push(label)
    if (out.length >= limit) break
  }
  return out
}

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
 *
 * A saying this book already prints is dropped, not just discouraged: the
 * avoid list is a hint the writer can ignore, and past its last few dozen
 * entries a long single-theme book would otherwise meet its own answers again.
 */
export async function cryptogramPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<CryptogramResponse> {
  const seed = Number(config.seed ?? 1)
  const level = parseCryptogramLevel(config)
  const theme = resolveRetirementTheme(config, seed, CRYPTOGRAM_THEME_SALT)
  const need = level.targetPuzzles

  const promptTheme = (
    filterUnsafeThemeCopy(theme.prompt) ?? theme.prompt
  ).slice(0, AI_THEME_MAX_LENGTH)
  const varietyKey = studioVarietyKey(CRYPTOGRAM_TEMPLATE_KEY, theme.label || promptTheme, level.id)
  const book = (context?.bookContentLabels(CRYPTOGRAM_TEMPLATE_KEY) ?? [])
    .map(normalizeSaying)
    .filter(Boolean)
  const bookHints = book.slice(-BOOK_AVOID_HINTS).reverse()

  // Usable sayings are kept across attempts: a reply one short of the page is
  // topped up by the next one, not thrown away with it.
  let collected: string[] = []
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
          avoid: dedupeLabels(
            [...collected, ...rejected, ...bookHints, ...studioAvoidList(varietyKey)],
            STUDIO_AVOID_LIMIT,
          ),
        },
        signal,
      )
      const fresh = selectAiSayings(remote.items, { count: need, length: level.length })
      const unprinted = withoutBookRepeats(fresh, book)
      rejected.push(...fresh.filter((saying) => !unprinted.includes(saying)))
      collected = selectAiSayings([...collected, ...unprinted], {
        count: need,
        length: level.length,
      })
      if (collected.length >= need) {
        rememberStudioContent(varietyKey, collected)
        return { items: collected.slice(0, candidateCountFor(need)) }
      }
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
