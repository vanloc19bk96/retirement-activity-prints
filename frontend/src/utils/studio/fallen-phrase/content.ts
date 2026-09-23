import { isNearDuplicateSaying, isUnsafeCopy } from '../cryptogram/content-quality'
import { FALLEN_PHRASE_MIN_COLS } from './layout'
import type { FallenPhraseLength } from './levels'

export const FALLEN_PHRASE_DEFAULT_TITLE = 'Fallen Phrase'

export const FALLEN_PHRASE_AI_EMPTY_MESSAGE =
  'We could not write enough clear retirement sayings for this theme. Try again, or pick a broader theme.'

export const FALLEN_PHRASE_UNBUILDABLE_MESSAGE =
  'None of the sayings written for this theme would settle into a tidy grid. Generate again, or pick a gentler level.'

export const FALLEN_PHRASE_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a Fallen Phrase grid. Pick a larger page in Settings.'

/**
 * What the page tells a first-time solver, in two sentences.
 *
 * The rule a solver cannot work out by looking is that a letter never leaves
 * its column — without it the page reads as an anagram of the whole saying,
 * which is a far harder puzzle than the one they bought. Everything past that
 * is cut: the instruction strip is set at 20 px across the full column, so a
 * third sentence is two more printed lines, and on a 5 x 8 interior those
 * lines come straight out of the grid.
 */
export const FALLEN_PHRASE_INSTRUCTION =
  'The letters under each column have fallen out of the boxes above them. ' +
  'Write every letter back into a box in its own column — never in another — to rebuild the saying.'

/** Phrases are letters and single spaces. Nothing else ever reaches the grid. */
const ALLOWED_RE = /^[A-Z]+(?: [A-Z]+)*$/

/**
 * Longest word the grid can set.
 *
 * A word is never broken across rows — half a word on each of two lines is
 * unsolvable — so no word may be wider than the narrowest grid any trim
 * prints. That is the floor in `layout.ts`, not a number chosen here.
 */
export const MAX_WORD_LETTERS = FALLEN_PHRASE_MIN_COLS

export interface FallenPhraseBand {
  minLetters: number
  maxLetters: number
  /**
   * Words the saying must hold.
   *
   * Both ends are the grid's constraint rather than a stylistic one, and the
   * floor is the one that surprises. A justified row is stretched at its word
   * gaps, so a row of two words has a single gap to put all its slack in and a
   * row of one word has none at all — which means a saying needs about three
   * words per row, not two, before the wrap has enough joints to work with.
   * The ceiling is about ink: every word boundary is a blocked cell, and past
   * the cap the grid is more gap than puzzle.
   */
  minWords: number
  maxWords: number
}

/**
 * Letters and words a saying needs to fill its level's grid.
 *
 * Mirrors `bands` in `backend/app/data/studio/fallen-phrase/prompt.json`. The
 * numbers are the grid read backwards. A grid of `cols x rows` cells holds the
 * letters, plus one blocked cell per word break, plus whatever slack the wrap
 * could not avoid — and English prose runs nearer three and a half letters to
 * the word than the five a first guess assumes, so the word breaks alone claim
 * something like a quarter of the grid. The letter ceiling is what is left.
 *
 * Letters and words are banded together rather than separately, because
 * neither one decides a grid on its own. Forty letters in nine long words and
 * forty in fourteen short ones want quite different grids, and only one of
 * them wraps into four tidy rows.
 */
const BANDS: Record<FallenPhraseLength, FallenPhraseBand> = {
  // 13 x 3 = 39 cells.
  short: { minLetters: 28, maxLetters: 34, minWords: 8, maxWords: 10 },
  // 13 x 4 = 52 cells.
  medium: { minLetters: 38, maxLetters: 46, minWords: 11, maxWords: 14 },
  // 13 x 5 = 65 cells.
  long: { minLetters: 48, maxLetters: 57, minWords: 14, maxWords: 17 },
}

export function bandFor(length: FallenPhraseLength): FallenPhraseBand {
  return BANDS[length]
}

/**
 * Phrases to ask for when the page needs one.
 *
 * Over-requesting is one field in the same call, and it is the only defence
 * against a page whose single saying turns out not to grid: the page keeps the
 * first candidate it can both wrap and validate, so a reply of one is a reply
 * that may not print.
 */
export function candidateCountFor(need: number): number {
  return Math.max(need + 5, need * 6)
}

export function normalizePhrase(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function letterCount(text: string): number {
  return text.replace(/ /g, '').length
}

export function isValidPhrase(text: string, length?: FallenPhraseLength): boolean {
  if (!text || !ALLOWED_RE.test(text)) return false
  const words = text.split(' ').filter(Boolean)
  if (words.some((word) => word.length > MAX_WORD_LETTERS)) return false

  const letters = letterCount(text)
  const bands = length ? [BANDS[length]] : Object.values(BANDS)
  return bands.some(
    (band) =>
      letters >= band.minLetters &&
      letters <= band.maxLetters &&
      words.length >= band.minWords &&
      words.length <= band.maxWords,
  )
}

/**
 * Normalize and gate the writer's lines: drop malformed text, anything outside
 * the printable band, repeats of a line already taken, and copy that has no
 * business in a book sold on KDP.
 */
export function selectAiPhrases(
  remote: readonly string[] | undefined,
  options: { count: number; length: FallenPhraseLength },
): string[] {
  const { count, length } = options
  const out: string[] = []
  const seen = new Set<string>()
  const limit = Math.max(count, candidateCountFor(count))
  for (const raw of remote ?? []) {
    const cleaned = normalizePhrase(String(raw ?? ''))
    if (!cleaned || seen.has(cleaned)) continue
    if (!isValidPhrase(cleaned, length)) continue
    if (isUnsafeCopy(cleaned)) continue
    if (out.some((existing) => isNearDuplicateSaying(existing, cleaned))) continue
    seen.add(cleaned)
    out.push(cleaned)
    if (out.length >= limit) break
  }
  return out
}
