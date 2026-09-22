import type {
  RetirementAnagramClue,
  RetirementAnagramItem,
} from '@/types/studio-retirement-anagram.types'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'
import { hasUniqueAnagram, loadAnagramIndex, type AnagramIndex } from './scramble'
import type { AnagramLevel } from './levels'

export type { RetirementAnagramItem }

export const RETIREMENT_ANAGRAM_DEFAULT_TITLE = 'Anagrams'

export const RETIREMENT_ANAGRAM_AI_EMPTY_MESSAGE =
  'Could not write enough retirement words for this theme. Try again, or pick a broader theme.'

/**
 * The instruction a solver actually needs, and nothing past it.
 *
 * "Write one letter per line" was in an earlier draft and is gone: a row of
 * separate short rules already says it, and the strip is not free. It sits
 * above the puzzle on every page, and on a 5 x 8 trim a second wrapped line
 * costs a whole word off the sheet — a worse deal for the reader than the
 * sentence was ever worth.
 *
 * The gentle level spends that room on the one thing the page cannot show by
 * itself: an unexplained letter already sitting in the first slot reads like a
 * misprint rather than a head start.
 */
export function anagramInstruction(level: AnagramLevel): string {
  if (level.firstLetterGiven) {
    return 'Use the clue to unscramble each word. The first letter is given.'
  }
  return 'Use the clue to unscramble each word.'
}

/** Longest clue the printed column was planned for. */
export const MAX_CLUE_CHARS = 42
/** Below this a "clue" is a label, not a definition worth printing. */
export const MIN_CLUE_CHARS = 8

/** Ask the writer for this many extra candidates — filtering costs some. */
export const CANDIDATE_OVERREQUEST = 8

export function candidateCountFor(count: number): number {
  return count + CANDIDATE_OVERREQUEST
}

export function normalizeWord(raw: unknown): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}

/**
 * One line of sentence-case prose, no trailing stop.
 *
 * A full stop after a clue that sits above a row of writing lines reads as a
 * stray mark at this size, and the clue is never a sentence to begin with.
 */
export function normalizeClue(raw: unknown): string {
  const text = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[.…]+$/, '')
    .trim()
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * A clue that hands over the answer.
 *
 * Not just the word itself: a language model asked to define GARDENING writes
 * "where a gardener spends the morning" as often as not, and a reader who sees
 * the stem has been given the anagram rather than asked it. Comparing the
 * first four letters catches the whole family — GARDEN, GARDENER, GARDENS —
 * without rejecting the honest near-misses a shorter prefix would.
 */
export function clueGivesAnswerAway(clue: string, answer: string): boolean {
  const stem = answer.slice(0, 4)
  if (stem.length < 4) return clue.toUpperCase().includes(answer)
  for (const token of clue.toUpperCase().split(/[^A-Z]+/)) {
    if (token.startsWith(stem)) return true
  }
  return false
}

export function isValidClue(clue: string, answer: string): boolean {
  if (clue.length < MIN_CLUE_CHARS || clue.length > MAX_CLUE_CHARS) return false
  if (clueGivesAnswerAway(clue, answer)) return false
  return !isUnsafeCopy(clue)
}

export function isValidWordLength(word: string, level: AnagramLevel): boolean {
  return word.length >= level.minLetters && word.length <= level.maxLetters
}

/**
 * Everything that has to be true of one printed row.
 *
 * The letter-set check is the one that decides whether the sheet is honest. A
 * word whose letters also spell another common word has two right answers, and
 * the answer page prints only one of them — so it never reaches the page, clue
 * or no clue.
 */
export function isValidAnagramItem(
  item: RetirementAnagramItem,
  level: AnagramLevel,
  index: AnagramIndex = loadAnagramIndex(),
): boolean {
  if (!isValidWordLength(item.answer, level)) return false
  if (!/^[A-Z]+$/.test(item.answer)) return false
  if (isUnsafeCopy(item.answer)) return false
  if (!isValidClue(item.clue, item.answer)) return false
  return hasUniqueAnagram(item.answer, index)
}

/**
 * Normalize → gate → dedupe → take `count`.
 *
 * Words are deduped by their letter *set*, not their spelling: two rows whose
 * letters sort to the same key print two scrambles a reader cannot tell apart,
 * and one of their answers will look wrong on the solution page.
 */
export function selectAiItems(
  remote: readonly RetirementAnagramClue[] | undefined,
  options: { count: number; level: AnagramLevel; index?: AnagramIndex },
): RetirementAnagramItem[] {
  const { count, level } = options
  const index = options.index ?? loadAnagramIndex()
  const out: RetirementAnagramItem[] = []
  const seenLetters = new Set<string>()

  for (const raw of remote ?? []) {
    const item: RetirementAnagramItem = {
      answer: normalizeWord(raw?.word),
      clue: normalizeClue(raw?.clue),
    }
    if (!isValidAnagramItem(item, level, index)) continue
    const key = [...item.answer].sort().join('')
    if (seenLetters.has(key)) continue
    seenLetters.add(key)
    out.push(item)
    if (out.length >= count) break
  }
  return out
}

/**
 * The hardest page these settings could be handed.
 *
 * The form has to report how many words a page holds before a single word
 * exists, so it measures against the worst admissible row: the longest answer
 * the band allows, beside the longest clue the column accepts. Anything
 * `isValidAnagramItem` lets through fits wherever this one does, which is what
 * makes the form's note a promise rather than a guess.
 */
export function worstCaseItems(
  level: AnagramLevel,
  count: number,
): RetirementAnagramItem[] {
  // "Wandering" is an ordinary-width run in a serif face: no narrow stems to
  // flatter the measurement, no double-width m/w to make it pessimistic.
  const clue = 'Wandering '.repeat(8).slice(0, MAX_CLUE_CHARS).trim()
  const answer = 'N'.repeat(level.maxLetters)
  return Array.from({ length: Math.max(1, count) }, () => ({ answer, clue }))
}
