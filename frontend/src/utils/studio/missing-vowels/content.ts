import type {
  MissingVowelsClue,
  MissingVowelsItem,
} from '@/types/studio-missing-vowels.types'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'
import { answerWords, isPlayableAnswer, letterToken, maskedText } from './mask'
import {
  hasUniqueAnswerFill,
  loadVowelPatternIndex,
  type VowelPatternIndex,
} from './pattern'
import type { MissingVowelsLevel } from './levels'

export type { MissingVowelsItem }

export const MISSING_VOWELS_DEFAULT_TITLE = 'Missing Vowels'

export const MISSING_VOWELS_AI_EMPTY_MESSAGE =
  'Could not write enough retirement words for this theme. Try again, or pick a broader theme.'

/**
 * The instruction a solver actually needs, and nothing past it.
 *
 * Naming the five letters is the one thing the page cannot show by itself. Y is
 * printed like any other consonant, and a reader who has decided Y counts will
 * spend the sheet looking for a blank that is not there. Everything else the
 * row says for itself: a rule under a gap is somewhere to write.
 */
export const MISSING_VOWELS_INSTRUCTION =
  'Write the missing vowels (A, E, I, O, U) on the lines.'

export function missingVowelsInstruction(): string {
  return MISSING_VOWELS_INSTRUCTION
}

/** Longest clue the printed column was planned for. */
export const MAX_CLUE_CHARS = 42
/** Below this a "clue" is a label, not a definition worth printing. */
export const MIN_CLUE_CHARS = 8

/**
 * Ask the writer for this many extra candidates.
 *
 * Larger than the other games' over-request, and deliberately: the vowel-
 * pattern gate in `pattern.ts` is the strictest filter any of these sheets
 * applies, and it rejects perfectly good retirement words for sharing their
 * blanks with a word the seller has never thought about. A second paid call
 * costs far more than a longer list.
 */
export const CANDIDATE_OVERREQUEST = 16

export function candidateCountFor(count: number): number {
  return count + CANDIDATE_OVERREQUEST
}

/** Uppercase, single-spaced, letters only: "Road trip!" -> "ROAD TRIP". */
export function normalizeAnswer(raw: unknown): string {
  return answerWords(String(raw ?? '')).join(' ')
}

/**
 * One line of sentence-case prose, no trailing stop.
 *
 * A full stop after a clue that sits under a row of writing rules reads as a
 * stray mark at this size, and the clue is never a sentence to begin with.
 */
export function normalizeClue(raw: unknown): string {
  const text = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.…]+$/, '')
    .trim()
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * A clue that hands over the answer.
 *
 * Not just the word itself: a model asked to define GARDENING writes "where a
 * gardener spends the morning" as often as not, and the consonants are already
 * on the page — a solver who reads GARDEN in the clue has been handed the row
 * rather than asked it. Comparing the first four letters catches the whole
 * family without rejecting the honest near-misses a shorter prefix would.
 */
export function clueGivesAnswerAway(clue: string, answer: string): boolean {
  const tokens = clue.toUpperCase().split(/[^A-Z]+/).filter(Boolean)
  for (const word of answerWords(answer)) {
    const stem = word.slice(0, 4)
    if (stem.length < 4) {
      if (tokens.includes(word)) return true
      continue
    }
    if (tokens.some((token) => token.startsWith(stem))) return true
  }
  return false
}

export function isValidClue(clue: string, answer: string): boolean {
  if (clue.length < MIN_CLUE_CHARS || clue.length > MAX_CLUE_CHARS) return false
  if (clueGivesAnswerAway(clue, answer)) return false
  return !isUnsafeCopy(clue)
}

export function isValidAnswerShape(
  answer: string,
  level: MissingVowelsLevel,
): boolean {
  const words = answerWords(answer)
  if (words.length < 1 || words.length > level.maxWords) return false
  const letters = letterToken(answer)
  return letters.length >= level.minLetters && letters.length <= level.maxLetters
}

/**
 * Everything that has to be true of one printed row.
 *
 * The pattern check is the one that decides whether the sheet is honest: blanks
 * a second common word could fill have two right answers, and the solution page
 * prints only one of them — so they never reach the page, clue or no clue.
 */
export function isValidMissingVowelsItem(
  item: MissingVowelsItem,
  level: MissingVowelsLevel,
  index: VowelPatternIndex = loadVowelPatternIndex(),
): boolean {
  if (!/^[A-Z]+(?: [A-Z]+)*$/.test(item.answer)) return false
  if (!isValidAnswerShape(item.answer, level)) return false
  if (!isPlayableAnswer(item.answer)) return false
  if (isUnsafeCopy(item.answer)) return false
  if (!isValidClue(item.clue, item.answer)) return false
  return hasUniqueAnswerFill(item.answer, index)
}

/**
 * GARDEN / GARDENING — two rows off one stem read as the same puzzle twice.
 *
 * Their blanks differ, so neither the answer check nor the mask check catches
 * it, but a reader who solved G_RD_N four rows ago is not being asked anything
 * new by G_RD_N_NG.
 */
export function isNearDuplicate(a: string, b: string): boolean {
  const left = letterToken(a)
  const right = letterToken(b)
  if (left === right) return true
  const shorter = left.length <= right.length ? left : right
  const longer = left.length > right.length ? left : right
  if (shorter.length < 4) return false
  return longer.startsWith(shorter)
}

/**
 * Normalize -> gate -> dedupe -> take `count`.
 *
 * Rows are deduped three ways because they can collide three ways: the same
 * answer twice, two answers that print the same row of blanks, and two answers
 * off one stem. The middle one is the one a reader notices — two identical
 * prompts with different answers on the key is a sheet that looks misprinted.
 */
export function selectAiItems(
  remote: readonly MissingVowelsClue[] | undefined,
  options: { count: number; level: MissingVowelsLevel; index?: VowelPatternIndex },
): MissingVowelsItem[] {
  const { count, level } = options
  const index = options.index ?? loadVowelPatternIndex()
  const out: MissingVowelsItem[] = []
  const seenAnswers = new Set<string>()
  const seenMasks = new Set<string>()

  for (const raw of remote ?? []) {
    const item: MissingVowelsItem = {
      answer: normalizeAnswer(raw?.answer),
      clue: normalizeClue(raw?.clue),
    }
    if (!isValidMissingVowelsItem(item, level, index)) continue
    if (seenAnswers.has(item.answer)) continue
    const mask = maskedText(item.answer)
    if (seenMasks.has(mask)) continue
    if (out.some((prev) => isNearDuplicate(prev.answer, item.answer))) continue
    seenAnswers.add(item.answer)
    seenMasks.add(mask)
    out.push(item)
    if (out.length >= count) break
  }
  return out
}

/**
 * The hardest page these settings could be handed.
 *
 * The form has to report how many rows a page holds before a single word
 * exists, so it measures against the worst admissible row: the longest answer
 * the band allows, split into as many words as the level permits — a word gap
 * is wider than a letter slot, so a phrase is the wide case — beside the
 * longest clue the column accepts. Anything `isValidMissingVowelsItem` lets
 * through fits wherever this one does, which is what makes the form's note a
 * promise rather than a guess.
 */
export function worstCaseItems(
  level: MissingVowelsLevel,
  count: number,
): MissingVowelsItem[] {
  // "Wandering" is an ordinary-width run in a serif face: no narrow stems to
  // flatter the measurement, no double-width m/w to make it pessimistic.
  const clue = 'Wandering '.repeat(8).slice(0, MAX_CLUE_CHARS).trim()
  const words = Math.max(1, level.maxWords)
  const tail = Math.floor(level.maxLetters / words)
  const answer = Array.from({ length: words }, (_, i) =>
    'N'.repeat(i === 0 ? level.maxLetters - tail * (words - 1) : tail),
  ).join(' ')
  return Array.from({ length: Math.max(1, count) }, () => ({ answer, clue }))
}
