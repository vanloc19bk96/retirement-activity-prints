/**
 * Word Fit-In — where the bank comes from.
 *
 * Two modes, and they do not carry the same obligations:
 *
 * * **Themed** pages ask the model for a bank written for that page
 *   (`prefetch.ts`). The theme is either one of the ten bundled presets or a
 *   phrase the seller typed into the custom-theme switch. The bundled themes
 *   clear the §4.5 entropy floor on their own — twelve drawn from eight hundred
 *   never repeats a grid — but a sixty-page book draws 720 entries from that
 *   pool, so the *words* start coming round again long before the grids do. A
 *   per-page bank is the fix. The cost is that these pages are AI-written and so
 *   carry the KDP AI-content disclosure at upload (§5.4).
 * * **Numbers** pages remain fully offline and procedural: no language-model
 *   call, and no disclosure obligation.
 *
 * The bundled preset stays behind the themed path as its fallback, so a page
 * still prints with no network — a typed custom theme falls back to whichever
 * preset the dropdown still holds. The clues those files carry are ignored
 * either way: a fill-in has no clues, so it has no clue that can be wrong,
 * ambiguous, or need fact-checking before publishing.
 */

import type { StudioRng } from '../studio-rng'
import {
  listCrosswordThemeMeta,
  loadThemeEntries,
  crosswordThemeLabel,
  CUSTOM_THEME_MAX_LENGTH,
  resolveCustomThemeText,
} from '../crossword/words'
import { digitToProxy, WORD_FIT_COUNT_MIN } from './types'

export { CUSTOM_THEME_MAX_LENGTH, resolveCustomThemeText }

/** Shortest and longest entry a fill-in slot can hold and still print legibly. */
export const WORD_FIT_MIN_LENGTH = 3
export const WORD_FIT_MAX_LENGTH = 11

/**
 * Share of the bank one length may occupy.
 *
 * Same-length words are what a fill-in's ambiguity is made of: two five-letter
 * words in two five-letter slots that cross nothing in common are freely
 * swappable, and the puzzle then has two answers. Spreading the lengths is the
 * cheap half of the fix — the solver in `solver.ts` is the half that guarantees
 * it — and it is the difference between a one-starter puzzle and a three-
 * starter one.
 */
const MAX_LENGTH_SHARE = 0.4

export interface WordFitTheme {
  key: string
  label: string
}

export function listWordFitThemes(): WordFitTheme[] {
  return listCrosswordThemeMeta().map(({ key, label }) => ({ key, label }))
}

export function wordFitThemeLabel(key: string): string {
  return crosswordThemeLabel(key)
}

function usableWords(pool: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of pool) {
    const word = raw.toUpperCase().replace(/[^A-Z]/g, '')
    if (word.length < WORD_FIT_MIN_LENGTH || word.length > WORD_FIT_MAX_LENGTH) continue
    if (seen.has(word)) continue
    seen.add(word)
    out.push(word)
  }
  return out
}

const themedCache = new Map<string, string[]>()

export function themedPool(themeKey: string): string[] {
  const cached = themedCache.get(themeKey)
  if (cached) return cached
  const pool = usableWords(loadThemeEntries(themeKey).map((entry) => entry.word))
  themedCache.set(themeKey, pool)
  return pool
}

/**
 * A bank of numbers, generated rather than drawn from a list.
 *
 * The leading symbol is never zero — "0413" reads as a typo in print, not as a
 * four-digit number — and the bank is deduped, because two identical entries
 * would be freely swappable and give the page two answers.
 */
export function numberBank(rng: StudioRng, count: number, lengths: readonly number[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (let guard = 0; out.length < count && guard < count * 40; guard++) {
    const length = lengths[out.length % lengths.length]!
    const digits = [rng.int(1, 9), ...Array.from({ length: length - 1 }, () => rng.int(0, 9))]
    const word = digits.map(digitToProxy).join('')
    if (seen.has(word)) continue
    seen.add(word)
    out.push(word)
  }
  return out
}

/**
 * Lengths a bank of `count` entries should span, longest first.
 *
 * Long entries are placed first by the interlocking builder and are what hold a
 * grid together, so the spread is weighted toward the middle of the band rather
 * than being uniform.
 */
export function lengthLadder(count: number): number[] {
  const ladder: number[] = []
  const steps = [6, 5, 7, 4, 6, 5, 3, 7, 5, 4, 6, 3, 5, 4, 7, 6, 4, 5]
  for (let i = 0; i < count; i++) ladder.push(steps[i % steps.length]!)
  return ladder
}

/**
 * Draw `count` words with their lengths spread out.
 *
 * Sampling the pool flat gives whatever length distribution the theme happens
 * to have, and English themes lean heavily on five and six letters. Filling a
 * length ladder instead keeps any one length under `MAX_LENGTH_SHARE` of the
 * bank, which is what keeps the starter count down.
 */
export function drawSpreadWords(
  rng: StudioRng,
  pool: readonly string[],
  count: number,
): string[] {
  const byLength = new Map<number, string[]>()
  for (const word of pool) {
    byLength.set(word.length, [...(byLength.get(word.length) ?? []), word])
  }
  for (const [length, words] of byLength) byLength.set(length, rng.shuffle(words))

  const cursor = new Map<number, number>()
  const cap = Math.max(2, Math.floor(count * MAX_LENGTH_SHARE))
  const used = new Map<number, number>()
  const chosen: string[] = []
  const seen = new Set<string>()

  const takeLength = (length: number): string | null => {
    const words = byLength.get(length)
    if (!words) return null
    if ((used.get(length) ?? 0) >= cap) return null
    let index = cursor.get(length) ?? 0
    while (index < words.length && seen.has(words[index]!)) index++
    cursor.set(length, index + 1)
    const word = words[index]
    if (!word) return null
    seen.add(word)
    used.set(length, (used.get(length) ?? 0) + 1)
    return word
  }

  for (const length of lengthLadder(count)) {
    const word = takeLength(length)
    if (word) chosen.push(word)
    if (chosen.length >= count) break
  }

  // Backfill from any length still under the cap — a theme short on
  // seven-letter words must not produce a short bank.
  const lengths = rng.shuffle([...byLength.keys()])
  for (let guard = 0; chosen.length < count && guard < count * 12; guard++) {
    for (const length of lengths) {
      if (chosen.length >= count) break
      const word = takeLength(length)
      if (word) chosen.push(word)
    }
  }

  return chosen
}

export function resolveWordPool(options: {
  /**
   * The bundled preset key. It is always a real preset — a typed custom theme
   * steers only the fetch, never this offline pool — so the fallback below can
   * rely on it covering the length ladder.
   */
  themeKey: string
  /** The bank `prefetch.ts` fetched for this page, when it got one. */
  remoteWords?: readonly string[]
}): string[] {
  const { themeKey, remoteWords } = options

  /*
   * Themed always draws from the AI theme, falling back to the bundled preset
   * when no bank was fetched. A short bank is worse than no bank:
   * `drawSpreadWords` fills a length ladder, and a pool that cannot cover the
   * ladder hands the builder a set of near-identical lengths, which is what a
   * fill-in's ambiguity is made of. Below a full grid's worth, the bundled
   * preset is the better page. Numbers never calls this — it generates its own
   * bank — so the themed path is all that is left to serve.
   */
  const remote = usableWords(Array.from(remoteWords ?? [], (word) => String(word)))
  if (remote.length >= WORD_FIT_COUNT_MIN) return remote
  return themedPool(themeKey)
}
