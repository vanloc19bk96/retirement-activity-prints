import {
  sanitizeWordEntry,
  type WordEntry,
} from '@/utils/puzzles/word-search-core'
import { createRng, deriveSeed } from '../studio-rng'
import { isPalindrome, isUnsafeCopy } from '../retirement-word-search/content-quality'
import lexicon from '@/data/studio/a-to-z-word-search/lexicon.json'
import type { AtoZLevel } from './levels'

export const ATOZ_DEFAULT_TITLE = 'A to Z Word Search'

export const ATOZ_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for an A to Z word search — twenty-six words need a wider grid. ' +
  'Pick a larger page in Settings (7.5 x 9.25 in or 8.5 x 11 in both work well).'

export const ATOZ_BUILD_FAILED_MESSAGE =
  'Could not hide a word for all twenty-six letters in a grid this size. ' +
  'Try a fresh variation code, or a larger page in Settings.'

/** The alphabet, in the order the page prints it. */
export const ALPHABET: readonly string[] = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']

export const ATOZ_WORD_COUNT = ALPHABET.length

/**
 * One letter and the word hidden for it.
 *
 * `token` is the run in the grid; `display` is what the solution prints. The
 * two differ for exactly one word in the bundled lexicon — X-RAY hides as XRAY
 * — which is why the split is carried rather than assumed away. `letter` is
 * stored rather than re-read from the token so nothing downstream can pair a
 * word with a letter it does not begin with.
 */
export interface AtoZEntry extends WordEntry {
  letter: string
}

/** Solution line for one letter: "A   APRON". */
export function formatAnswerLabel(entry: AtoZEntry): string {
  return entry.display.toUpperCase()
}

/**
 * Words this page may hide for one letter, at this level and grid size.
 *
 * The gates are the ones a printed page cannot recover from. A palindrome reads
 * the same backwards, so the key cannot say which way round it was found. A word
 * longer than the grid is wide has nowhere to go. Copy that would put a KDP
 * title at risk is dropped whatever the letter, even if it leaves the letter
 * with nothing — a page that refuses to generate is cheaper than a listing that
 * is taken down.
 */
export function candidatesForLetter(
  letter: string,
  options: { minLetters: number; maxLetters: number; gridSide: number },
): AtoZEntry[] {
  const { minLetters, maxLetters, gridSide } = options
  const raw = (lexicon as Record<string, readonly string[]>)[letter] ?? []
  const out: AtoZEntry[] = []
  for (const word of raw) {
    const entry = sanitizeWordEntry(word, {
      gridSize: gridSide,
      minLetters,
      maxLetters: Math.min(maxLetters, gridSide),
    })
    if (!entry) continue
    if (!entry.token.startsWith(letter)) continue
    if (isPalindrome(entry.token)) continue
    if (isUnsafeCopy(entry.display)) continue
    out.push({ ...entry, letter })
  }
  return out
}

/**
 * Every word these bounds admit, as the page would print it.
 *
 * The band under the grid has to be sized before any word has been drawn, and
 * its column count turns on the widest word rather than on the longest — nine
 * capitals of one word set narrower than seven of another. So the layout is
 * handed the whole pool and measures it.
 */
export function candidateDisplays(options: {
  minLetters: number
  maxLetters: number
  gridSide: number
}): string[] {
  return ALPHABET.flatMap((letter) =>
    candidatesForLetter(letter, options).map((entry) => entry.display),
  )
}

/** Letters this level can print nothing for — empty when the lexicon covers it. */
export function lettersWithoutWords(options: {
  minLetters: number
  maxLetters: number
  gridSide: number
}): string[] {
  return ALPHABET.filter((letter) => candidatesForLetter(letter, options).length === 0)
}

/**
 * Two words a solver would treat as one.
 *
 * GARDEN inside GARDENING is not a duplicate on a word list, but it is one in
 * the grid: the circle round the longer word also circles the shorter, so two
 * letters of the alphabet are answered by a single mark and the key looks wrong.
 * The reverse test is the same fault seen from the other side — at the
 * challenging level words may be written backwards, so a word whose reverse is
 * another letter's word puts two answers on one run of cells.
 */
function conflicts(candidate: AtoZEntry, picked: readonly AtoZEntry[]): boolean {
  const reversed = [...candidate.token].reverse().join('')
  return picked.some(
    (other) =>
      other.token === candidate.token ||
      other.token.includes(candidate.token) ||
      candidate.token.includes(other.token) ||
      other.token === reversed,
  )
}

/**
 * One word for every letter from A to Z, or null.
 *
 * Takes a seeded shuffle of each letter's candidates and keeps the first that
 * does not collide with what is already picked. Null means this draw painted
 * itself into a corner — the caller tries again with a different one rather than
 * printing a puzzle that is missing a letter.
 *
 * The letters are taken rarest-first rather than A to Z, so a scarce letter
 * chooses before a plentiful one has had the chance to take a word it needed. X
 * is the whole reason: it has three printable words in this lexicon that an
 * adult reader would recognise, so it cannot afford to lose one to a
 * coincidence, while S can lose eleven and still fill.
 */
export function selectAlphabetSet(options: {
  level: AtoZLevel
  gridSide: number
  seed: number
}): AtoZEntry[] | null {
  const { level, gridSide, seed } = options
  const bounds = {
    minLetters: level.minLetters,
    maxLetters: level.maxLetters,
    gridSide,
  }

  const pools = new Map<string, AtoZEntry[]>()
  for (const letter of ALPHABET) {
    const candidates = candidatesForLetter(letter, bounds)
    // A letter with nothing printable cannot be hidden, and a puzzle missing a
    // letter is not this puzzle. Fail here rather than shipping twenty-five.
    if (candidates.length === 0) return null
    pools.set(letter, candidates)
  }

  const scarcestFirst = [...ALPHABET].sort(
    (a, b) => pools.get(a)!.length - pools.get(b)!.length || a.localeCompare(b),
  )

  const rng = createRng(deriveSeed(seed, 'a-to-z-words'))
  const picked: AtoZEntry[] = []
  for (const letter of scarcestFirst) {
    const choice = rng
      .shuffle(pools.get(letter)!)
      .find((candidate) => !conflicts(candidate, picked))
    if (!choice) return null
    picked.push(choice)
  }

  return sortByLetter(picked)
}

/** A to Z — the order the alphabet list and the solution both print in. */
export function sortByLetter(entries: readonly AtoZEntry[]): AtoZEntry[] {
  return [...entries].sort((a, b) => a.letter.localeCompare(b.letter))
}
