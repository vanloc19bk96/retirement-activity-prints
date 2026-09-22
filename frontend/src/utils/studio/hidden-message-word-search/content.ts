import type { WordEntry } from '@/utils/puzzles/word-search-core'
import type { HiddenMessageResponse, HiddenMessageTone } from '@/types/studio-hidden-message.types'
import { createRng } from '../studio-rng'
import type { FontSpec } from '../studio-text-metrics'
import {
  selectWordEntries,
  sortForBank,
  worstBankEntryWidth,
} from '../retirement-word-search/content'
import type { HiddenMessageLevel } from './levels'

export { sortForBank, worstBankEntryWidth }

export const HIDDEN_MESSAGE_DEFAULT_TITLE = 'Hidden Message Word Search'

export const HIDDEN_MESSAGE_AI_EMPTY_MESSAGE =
  'We could not write enough clear retirement words and a saying for this theme. Try again, or pick a broader theme.'

export const HIDDEN_MESSAGE_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a hidden message word search at this level. Pick a larger page in Settings, or a gentler level.'

export const HIDDEN_MESSAGE_BUILD_FAILED_MESSAGE =
  'Could not fill the grid around this saying. Try again, or pick a broader theme.'

/** Longest saying a seller may type, before letters are counted. */
export const CUSTOM_MESSAGE_MAX_LENGTH = 80

/** The API contract's pool ceiling — mirrors `limits.poolSize` in prompt.json. */
export const HIDDEN_MESSAGE_POOL_SIZE = 40

/**
 * Words to ask for when the page may print up to `maxWords`.
 *
 * A hidden-message grid is filled exactly, so the placer needs far more slack
 * than a plain word search: it is not choosing fifteen words it likes, it is
 * choosing whichever words happen to add up to the free cells. Over-requesting
 * is one field in the same call and it is the only thing standing between a
 * stubborn arithmetic remainder and an error page.
 */
export function poolCountFor(maxWords: number): number {
  return Math.min(HIDDEN_MESSAGE_POOL_SIZE, Math.max(maxWords + 12, Math.ceil(maxWords * 1.8)))
}

/**
 * Sayings are written in one of these voices, rotated by seed.
 *
 * Not a form field. A seller filling a hundred-page book does not want to pick
 * a tone a hundred times, and picking one once is worse: a book whose every
 * hidden saying is heartfelt reads as one long greeting card. Rotating on the
 * puzzle's own seed keeps a given sheet reproducible while consecutive pages
 * land on different voices.
 *
 * "Sassy" is left out on purpose. It is the one voice in the API's set that
 * can land as a joke at the reader's expense rather than with them, and this
 * book is bought by the person solving it.
 */
const TONE_ROTATION: readonly HiddenMessageTone[] = ['heartfelt', 'funny', 'classy']

export function toneForSeed(seed: number): HiddenMessageTone {
  return createRng((seed >>> 0) ^ 0x746f_6e65).pick(TONE_ROTATION)
}

export interface NormalizedMessage {
  /** What the solution page prints, spaces and punctuation intact. */
  display: string
  /** The A–Z run the leftover cells must spell, in reading order. */
  letters: string
  /** Word-by-word letter runs — one write-in slot per letter, gaps between. */
  boxWords: string[]
}

export function letterToken(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '')
}

/**
 * Turn a written saying into the three shapes the page needs, or null.
 *
 * Null is not an error to apologise for: a saying outside the level's letter
 * band is one the grid cannot hold exactly, and the caller's job is to ask for
 * another rather than to print a puzzle whose leftover letters run out.
 */
export function normalizeMessage(
  raw: string,
  level: Pick<HiddenMessageLevel, 'minMessageLetters' | 'maxMessageLetters'>,
): NormalizedMessage | null {
  const display = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!display) return null

  const letters = letterToken(display)
  if (letters.length < level.minMessageLetters) return null
  if (letters.length > level.maxMessageLetters) return null

  const boxWords = display
    .split(' ')
    .map((word) => letterToken(word))
    .filter((word) => word.length > 0)
  if (boxWords.length === 0) return null

  return { display, letters, boxWords }
}

/** What the seller typed, or null when it is not a saying this level can hide. */
export function parseCustomMessage(
  raw: unknown,
  level: Pick<HiddenMessageLevel, 'minMessageLetters' | 'maxMessageLetters'>,
): NormalizedMessage | null {
  return normalizeMessage(String(raw ?? ''), level)
}

/**
 * The saying the seller typed, or '' when they left the field blank.
 *
 * The retired form had a three-way mode switch, and `customMessage` only
 * counted when it was set to "Custom saying". A sheet saved in one of the other
 * two modes can still be carrying whatever was typed before the seller changed
 * their mind — and under the new form, which has no mode switch, that stale
 * text would suddenly start printing on every page of their book.
 *
 * So a config that still has the old switch is read by the old rules.
 */
export function resolveTypedMessage(config: {
  customMessage?: unknown
  wordsFrom?: unknown
}): string {
  const legacyMode = config.wordsFrom
  if (legacyMode != null && String(legacyMode) !== 'custom-saying') return ''
  return String(config.customMessage ?? '').trim()
}

/** True when the seller typed a saying of their own. */
export function hasCustomMessage(raw: unknown): boolean {
  return String(raw ?? '').trim().length > 0
}

/**
 * Title Case for the word bank, whatever case the writer sent.
 *
 * The grid is capitals because a letter grid has to be. A bank of capitals
 * beside it is harder to read, not easier: word shape is most of how an older
 * reader scans a list, and ALL CAPS throws that away. The plain word search
 * prints Title Case, and two banks facing each other in one book should not
 * disagree about it.
 */
export function toBankDisplay(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    // Word starts only. Capitalising after an apostrophe turns "Sunday's" into
    // "Sunday'S", which is the kind of thing a reader blames the book for.
    .replace(/(^|[\s-])([a-z])/g, (_match, lead: string, letter: string) => lead + letter.toUpperCase())
}

export interface HiddenMessageWordPoolOptions {
  level: Pick<HiddenMessageLevel, 'minLetters'>
  /** The page's own ceiling — a word cannot be longer than the grid is wide. */
  maxLetters: number
  /** Widest an entry may print in the bank column the page planned. */
  maxDisplayWidth?: number
  bankFontSize?: number
  font?: FontSpec
}

/**
 * Normalize the writer's lines into printable bank entries.
 *
 * Every gate here belongs to the shared word-search pool builder — palindromes,
 * nested tokens, unsafe copy and entries too wide for their bank column. This
 * page adds nothing of its own beyond Title Case, because a word that is wrong
 * for one retirement word search is wrong for the other.
 */
export function selectHiddenMessageWords(
  raw: unknown,
  options: HiddenMessageWordPoolOptions,
): WordEntry[] {
  const lines = Array.isArray(raw) ? raw : []
  return selectWordEntries(
    lines.map((line) => toBankDisplay(String(line ?? ''))),
    {
      minLetters: options.level.minLetters,
      maxLetters: options.maxLetters,
      maxDisplayWidth: options.maxDisplayWidth,
      bankFontSize: options.bankFontSize,
      font: options.font,
    },
  )
}

export function parseRemotePayload(raw: unknown): HiddenMessageResponse | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as { message?: unknown; words?: unknown }
  if (typeof data.message !== 'string' || !data.message.trim()) return null
  if (!Array.isArray(data.words)) return null
  const words = data.words.filter((word): word is string => typeof word === 'string')
  return words.length > 0 ? { message: data.message, words } : null
}
