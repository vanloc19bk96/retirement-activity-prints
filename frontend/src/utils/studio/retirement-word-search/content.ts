import {
  sanitizeWordEntries,
  type WordEntry,
} from '@/utils/puzzles/word-search-core'
import type { WordSearchResponse } from '@/types/studio-word-search.types'
import { measureRunWidth, type FontSpec } from '../studio-text-metrics'
import { isPalindrome, isUnsafeCopy } from './content-quality'

export const WORD_SEARCH_DEFAULT_TITLE = 'Word Search'

export const WORD_SEARCH_AI_EMPTY_MESSAGE =
  'We could not write enough clear retirement words for this theme. Try again, or pick a broader theme.'

export const WORD_SEARCH_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a word search at this level. Pick a larger page in Settings, or a gentler level.'

/** The API contract's pool ceiling — mirrors `limits.poolSize` in prompt.json. */
export const WORD_SEARCH_POOL_SIZE = 30

/**
 * Words to ask for when the page needs `need`.
 *
 * Over-requesting is one field in the same call, and it is the only defence
 * against a page that comes back short after the safety, palindrome,
 * containment and column-width gates below have run. It also gives the
 * placement ladder room to swap a stubborn word out rather than print fewer.
 */
export function candidateCountFor(need: number): number {
  return Math.min(WORD_SEARCH_POOL_SIZE, Math.max(need + 8, Math.ceil(need * 1.6)))
}

/**
 * The widest bank entry this level could be handed, as a printable string.
 *
 * The form has to say how many words a page holds before a single word
 * exists, and the answer depends on how many columns the word bank can be
 * split into — which depends on the widest entry. So it is measured against
 * the worst admissible shape: the widest capital this font has, the level's
 * full letter budget, and a space, because a two-word entry such as "Road
 * Trip" pays for a word break and a second capital.
 *
 * Anything `selectWordEntries` lets through is narrower than this, so a column
 * count chosen against it always holds the words that actually print.
 */
export function worstBankEntry(maxLetters: number): string {
  if (maxLetters <= 3) return 'M'.repeat(Math.max(1, maxLetters))
  return `M${'a'.repeat(maxLetters - 2)} M`
}

export function worstBankEntryWidth(
  maxLetters: number,
  fontSize: number,
  spec: FontSpec,
): number {
  return measureRunWidth(worstBankEntry(maxLetters), fontSize, spec)
}

export interface WordPoolOptions {
  minLetters: number
  maxLetters: number
  /**
   * Widest an entry may print in the bank column the page planned, at the
   * large-print floor. An entry past this would be soft-wrapped by Fabric onto
   * a second line and collide with the row under it.
   */
  maxDisplayWidth?: number
  bankFontSize?: number
  font?: FontSpec
}

/**
 * Two entries a solver would treat as one.
 *
 * GARDEN inside GARDENING is not a duplicate in the word list, but it is one
 * in the grid: circling the longer word circles the shorter, so the page has
 * two clues with a single answer and a key that looks wrong.
 */
function dropContained(entries: WordEntry[]): WordEntry[] {
  const longestFirst = [...entries].sort(
    (a, b) => b.token.length - a.token.length || a.token.localeCompare(b.token),
  )
  const kept: WordEntry[] = []
  for (const entry of longestFirst) {
    if (kept.some((other) => other.token.includes(entry.token))) continue
    kept.push(entry)
  }
  return kept
}

/**
 * Normalize the writer's lines into printable bank entries.
 *
 * `display` keeps the spaces a reader sees; `token` is the compact A–Z run the
 * grid is built from. Everything dropped here is dropped because the page
 * cannot print it honestly — not because it is unusual.
 */
export function selectWordEntries(
  raw: unknown,
  options: WordPoolOptions,
): WordEntry[] {
  const { minLetters, maxLetters, maxDisplayWidth, bankFontSize, font } = options
  const entries = sanitizeWordEntries(raw, {
    gridSize: maxLetters,
    minLetters,
    maxLetters,
  }).filter((entry) => {
    if (isPalindrome(entry.token)) return false
    if (isUnsafeCopy(entry.display)) return false
    if (maxDisplayWidth != null && bankFontSize != null) {
      if (measureRunWidth(entry.display, bankFontSize, font ?? {}) > maxDisplayWidth) {
        return false
      }
    }
    return true
  })
  return dropContained(entries)
}

/** Alphabetical by what the reader sees — the order a word bank is scanned in. */
export function sortForBank(entries: readonly WordEntry[]): WordEntry[] {
  return [...entries].sort((a, b) =>
    a.display.localeCompare(b.display, 'en', { sensitivity: 'base' }),
  )
}

export function parseRemotePayload(raw: unknown): WordSearchResponse | null {
  if (!raw || typeof raw !== 'object') return null
  const words = (raw as { words?: unknown }).words
  if (!Array.isArray(words)) return null
  const strings = words.filter((word): word is string => typeof word === 'string')
  return strings.length > 0 ? { words: strings } : null
}
