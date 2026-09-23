import type {
  RiddleScrambleRiddle,
  RiddleScrambleWord,
} from '@/types/studio-riddle-scramble.types'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'
import {
  hasUniqueAnagram,
  loadAnagramIndex,
  sortedKey,
  type AnagramIndex,
} from '../retirement-anagram/scramble'
import type { RiddleScrambleLevel } from './levels'

export const RIDDLE_SCRAMBLE_DEFAULT_TITLE = 'Riddle Scramble'

export const RIDDLE_SCRAMBLE_AI_EMPTY_MESSAGE =
  'Could not write a riddle and enough retirement words for this theme. Try again, or pick a broader theme.'

export const RIDDLE_SCRAMBLE_UNSPELLABLE_MESSAGE =
  'Could not spell this riddle out of the words written for this theme. Try again, or pick a broader theme.'

export const RIDDLE_SCRAMBLE_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a riddle scramble at this level. Pick a larger page in Settings, or a gentler level.'

/**
 * The instruction a solver needs, and nothing past it.
 *
 * Two sentences, because the page cannot show the chain by itself: boxes drawn
 * among the writing lines read as emphasis until someone says the letters in
 * them go somewhere. What the page *can* show is left out — which order to
 * read them in, and which box each one belongs to — because the little numbers
 * under the riddle's boxes already say it, and this strip is not free. It sits
 * above the puzzle on every page, and on a 5 x 8 trim a third wrapped line
 * costs a word off the sheet, which is a worse trade for the reader than the
 * clause was ever worth.
 */
export const RIDDLE_SCRAMBLE_INSTRUCTION =
  'Unscramble each word. The boxed letters answer the riddle below.'

/** Longest clue the printed line was planned for. */
export const MAX_CLUE_CHARS = 30
/** Below this a "clue" is a label, not a definition worth printing. */
export const MIN_CLUE_CHARS = 8

/** Longest riddle the printed band was planned for. */
export const MAX_RIDDLE_CHARS = 72
/** Below this the model has written a fragment, not a question. */
export const MIN_RIDDLE_CHARS = 16

/**
 * Letters a riddle answer may not contain.
 *
 * Every letter of the answer has to be found inside a themed word — that is
 * the whole mechanism — and everyday retirement vocabulary carries almost no
 * J, Q, X or Z. An answer holding one is not a hard puzzle, it is an
 * unbuildable one, and rejecting it here costs a candidate rather than a page.
 */
export const AWKWARD_ANSWER_LETTERS = new Set(['J', 'Q', 'X', 'Z'])

/** Riddles to ask for; the page keeps the first whose letters it can spell. */
export const RIDDLE_CANDIDATES = 8

/**
 * Words to ask for when the page prints `answerLetters` of them.
 *
 * Wildly over-requested, and deliberately. The page is not choosing the words
 * it likes best — it is looking for one word per answer letter that actually
 * contains that letter, and a thin pool fails on a single awkward letter. A
 * wider pool is one field in the same paid call; a failed match is a page.
 */
export function wordCandidateCountFor(answerLetters: number): number {
  return Math.max(20, answerLetters * 5)
}

export function normalizeWord(raw: unknown): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}

/**
 * One line of sentence-case prose, no trailing stop.
 *
 * A full stop after a clue sitting above a row of writing lines reads as a
 * stray mark at this size, and the clue is never a sentence to begin with.
 */
export function normalizeClue(raw: unknown): string {
  const text = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[.]+$/, '')
    .trim()
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * One sentence-case question.
 *
 * The question mark is restored rather than required: a model that drops it
 * has written the riddle correctly and punctuated it as a statement, and a
 * statement with an answer line under it reads to a buyer as a typo in their
 * book.
 */
export function normalizeRiddle(raw: unknown): string {
  const text = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!]+$/, '')
  if (!text) return ''
  const question = text.endsWith('?') ? text : `${text}?`
  return question.charAt(0).toUpperCase() + question.slice(1)
}

/**
 * Text that hands over the word it is supposed to lead to.
 *
 * Not just the word itself: asked to clue GARDENING a language model writes
 * "where a gardener spends the morning" as often as not, and a solver who
 * reads the stem has been given the scramble rather than asked it. Comparing
 * the first four letters catches the whole family — GARDEN, GARDENER,
 * GARDENS — without rejecting the honest near-misses a shorter prefix would.
 *
 * Used on both halves of the page: a riddle that leaks its own answer wastes
 * the chain the marked letters exist to build.
 */
export function givesWordAway(text: string, word: string): boolean {
  const stem = word.slice(0, 4)
  if (stem.length < 4) return text.toUpperCase().includes(word)
  for (const token of text.toUpperCase().split(/[^A-Z]+/)) {
    if (token.startsWith(stem)) return true
  }
  return false
}

export function isValidClue(clue: string, answer: string): boolean {
  if (clue.length < MIN_CLUE_CHARS || clue.length > MAX_CLUE_CHARS) return false
  if (givesWordAway(clue, answer)) return false
  return !isUnsafeCopy(clue)
}

export function isValidWordLength(word: string, level: RiddleScrambleLevel): boolean {
  return word.length >= level.minLetters && word.length <= level.maxLetters
}

/** One printed word row, before it is matched to a letter of the answer. */
export interface RiddleScrambleCandidate {
  word: string
  clue: string
}

/**
 * Everything that has to be true of one word before it may print.
 *
 * The letter-set check is the one that decides whether the sheet is honest. A
 * word whose letters also spell another common word has two right answers,
 * the solution page prints one of them — and here it is worse than on a plain
 * anagram sheet, because the wrong-but-fair reading also feeds a wrong letter
 * into the riddle and breaks a puzzle the reader had solved correctly.
 */
export function isValidCandidate(
  item: RiddleScrambleCandidate,
  level: RiddleScrambleLevel,
  index: AnagramIndex = loadAnagramIndex(),
): boolean {
  if (!isValidWordLength(item.word, level)) return false
  if (!/^[A-Z]+$/.test(item.word)) return false
  if (isUnsafeCopy(item.word)) return false
  if (!isValidClue(item.clue, item.word)) return false
  return hasUniqueAnagram(item.word, index)
}

/** Everything that has to be true of a riddle before its answer may be spelled. */
export function isValidRiddle(
  riddle: { riddle: string; answer: string },
  level: RiddleScrambleLevel,
): boolean {
  const { answer, riddle: text } = riddle
  if (answer.length !== level.answerLetters) return false
  if (!/^[A-Z]+$/.test(answer)) return false
  if ([...answer].some((letter) => AWKWARD_ANSWER_LETTERS.has(letter))) return false
  if (text.length < MIN_RIDDLE_CHARS || text.length > MAX_RIDDLE_CHARS) return false
  if (!text.endsWith('?')) return false
  if (givesWordAway(text, answer)) return false
  return !isUnsafeCopy(text) && !isUnsafeCopy(answer)
}

/** Normalize → gate → dedupe by answer. Order is kept: the writer's is fine. */
export function selectRiddles(
  remote: readonly RiddleScrambleRiddle[] | undefined,
  level: RiddleScrambleLevel,
): RiddleScrambleRiddle[] {
  const out: RiddleScrambleRiddle[] = []
  const seen = new Set<string>()

  for (const raw of remote ?? []) {
    const item = {
      riddle: normalizeRiddle(raw?.riddle),
      answer: normalizeWord(raw?.answer),
    }
    if (!isValidRiddle(item, level)) continue
    if (seen.has(item.answer)) continue
    seen.add(item.answer)
    out.push(item)
  }
  return out
}

/**
 * Normalize → gate → dedupe → keep.
 *
 * Words are deduped by their letter *set*, not their spelling: two rows whose
 * letters sort to the same key print two scrambles a reader cannot tell apart,
 * and one of their answers will look wrong on the solution page.
 */
export function selectWords(
  remote: readonly RiddleScrambleWord[] | undefined,
  options: { level: RiddleScrambleLevel; index?: AnagramIndex },
): RiddleScrambleCandidate[] {
  const { level } = options
  const index = options.index ?? loadAnagramIndex()
  const out: RiddleScrambleCandidate[] = []
  const seenLetters = new Set<string>()

  for (const raw of remote ?? []) {
    const item: RiddleScrambleCandidate = {
      word: normalizeWord(raw?.word),
      clue: normalizeClue(raw?.clue),
    }
    if (!isValidCandidate(item, level, index)) continue
    const key = sortedKey(item.word)
    if (seenLetters.has(key)) continue
    seenLetters.add(key)
    out.push(item)
  }
  return out
}

/**
 * The hardest page these settings could be handed.
 *
 * The form has to report what a level prints before a single word exists, so
 * it measures against the worst admissible row: the longest word the band
 * allows beside the longest clue the line accepts, under the longest riddle
 * the band accepts. Anything the gates above let through fits wherever this
 * one does, which is what makes the form's note a promise rather than a guess.
 */
export function worstCaseCandidates(
  level: RiddleScrambleLevel,
): RiddleScrambleCandidate[] {
  // "Wandering" is an ordinary-width run in a serif face: no narrow stems to
  // flatter the measurement, no double-width m/w to make it pessimistic.
  const clue = 'Wandering '.repeat(4).slice(0, MAX_CLUE_CHARS).trim()
  const word = 'N'.repeat(level.maxLetters)
  return Array.from({ length: level.answerLetters }, () => ({ word, clue }))
}

/** The longest riddle the band must hold, used by the same worst-case probe. */
export function worstCaseRiddle(): string {
  return `${'Wandering '.repeat(8).slice(0, MAX_RIDDLE_CHARS - 1).trim()}?`
}
