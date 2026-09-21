/**
 * Word Fit-In — the themed bank, written per page.
 *
 * The ten bundled themes carry 800 words each, which clears the §4.5 entropy
 * floor with room to spare: no two pages drawing twelve from eight hundred
 * make the same grid. What a fixed list cannot do is keep the *words* fresh —
 * a sixty-page book draws 720 entries from that pool, so by the back half the
 * reader is meeting OTTER and BADGER for the fourth time. That is the gap this
 * fetch closes: the theme the seller picked is sent to the model, and the bank
 * comes back written for that page alone.
 *
 * The theme sent is either a bundled preset's label or the phrase the seller
 * typed into the custom-theme switch; a blank custom box falls back to the
 * preset the dropdown still holds.
 *
 * Two consequences worth stating plainly:
 *
 * * **Themed pages are now AI-written, so they carry the KDP AI-content
 *   disclosure obligation (§5.4).** The numbers mode still does not — see
 *   `words.ts`.
 * * **A failed call is not a failed page.** The bundled pool stays behind this
 *   as the fallback, because `generate()` has to print a legible, single-answer
 *   grid with no network at all — that is what the print-QA, uniqueness and
 *   reprint gates in `_shared/procedural-pack.test.ts` exercise.
 */

import { generateThemeWords } from '@/api/studio-theme-words.api'
import type { StudioConfig } from '@/types/studio-template.types'
import type { ThemeWordsResponse } from '@/types/studio-theme-words.types'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import { parseWordFitCount, parseWordFitMode } from './types'
import {
  resolveCustomThemeText,
  WORD_FIT_MAX_LENGTH,
  WORD_FIT_MIN_LENGTH,
  wordFitThemeLabel,
} from './words'

/**
 * Entries to ask for, against a grid of `wordCount`.
 *
 * Over-requesting is not padding: `drawSpreadWords` fills a length ladder, and
 * a bank handed exactly twelve words has no choice to make — it takes whatever
 * lengths arrived. Three times the grid gives the ladder something to pick
 * from, and the model's own near-misses (too long, too short, duplicated) are
 * discarded before the count is met.
 */
const OVER_REQUEST = 3
/** Backend ceiling — `ThemeWordsRequest.item_count` is `le=40`. */
const MAX_REQUEST = 40

/** Below this the ladder cannot spread lengths, so the bundled pool serves better. */
const MIN_USABLE_WORDS = 12

function usableCount(items: readonly unknown[]): number {
  const seen = new Set<string>()
  for (const raw of items) {
    if (typeof raw !== 'string') continue
    const word = raw.toUpperCase().replace(/[^A-Z]/g, '')
    if (word.length < WORD_FIT_MIN_LENGTH || word.length > WORD_FIT_MAX_LENGTH) continue
    seen.add(word)
  }
  return seen.size
}

/**
 * A bank for one themed page, or `undefined` to let `generate()` use the
 * bundled theme.
 *
 * Never throws for a content reason. A book builder running sixty pages must
 * not lose the batch because one call was rate-limited, and the fallback under
 * this is a real 800-word theme, not a blank page.
 */
export async function wordFitPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<ThemeWordsResponse | undefined> {
  if (parseWordFitMode(config.mode) !== 'themed') return undefined

  const themeKey = String(config.theme ?? 'animals')
  const customTheme =
    config.customTheme === true ? resolveCustomThemeText(config) : ''
  const theme = customTheme || wordFitThemeLabel(themeKey)
  const varietyKey = studioVarietyKey(
    'word-fit',
    theme,
    `${WORD_FIT_MIN_LENGTH}-${WORD_FIT_MAX_LENGTH}`,
  )

  try {
    const remote = await generateThemeWords(
      {
        theme,
        itemCount: Math.min(MAX_REQUEST, parseWordFitCount(config.wordCount) * OVER_REQUEST),
        minLetters: WORD_FIT_MIN_LENGTH,
        // A word longer than the lattice can hold is discarded by `usableWords`
        // anyway — asking for one wastes a slot in the response.
        maxLetters: WORD_FIT_MAX_LENGTH,
        seed: Number(config.seed ?? 1),
        avoid: studioAvoidList(varietyKey),
      },
      signal,
    )

    const items = remote.items ?? []
    if (usableCount(items) < MIN_USABLE_WORDS) {
      console.warn(
        `[word-fit] AI bank too thin for "${theme}" (${usableCount(items)} usable); using the bundled theme`,
      )
      return undefined
    }

    rememberStudioContent(varietyKey, items)
    return remote
  } catch (error) {
    // An aborted generation is the user navigating away, not a failure to
    // report — and the caller is already unwinding.
    if (signal.aborted) throw error
    console.warn('[word-fit] AI theme words failed; using the bundled theme', error)
    return undefined
  }
}
