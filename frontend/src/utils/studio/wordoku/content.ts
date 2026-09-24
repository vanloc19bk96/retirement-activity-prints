import { createRng, deriveSeed } from '../studio-rng'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import targetData from '@/data/studio/wordoku/targets.json'
import { WORDOKU_SIZE } from './levels'

/**
 * The hidden word, and the alphabet the grid is written in.
 *
 * In Word-oku the two are the same thing: the nine letters of the target word
 * *are* the nine Sudoku symbols. That makes one property non-negotiable — the
 * word must hold nine different letters. A word with a repeat (GARDENING, with
 * its two G's and two N's) would hand the grid eight symbols for nine cells per
 * row, which is not a harder puzzle but an impossible one. So every candidate
 * is validated here, before any grid is built, and anything that fails is
 * simply never offered to the generator.
 */

export const WORDOKU_DEFAULT_TITLE = 'Word-oku'

export const WORDOKU_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a Word-oku — the letters would print below large-print size. ' +
  'Pick a larger page in Settings.'

export const WORDOKU_BUILD_FAILED_MESSAGE =
  'Could not build a Word-oku at this level. Try a fresh variation code, or a gentler level.'

/**
 * Hints stay short: they print on one line beside "Hidden word" on a 5 x 8
 * interior, and a hint long enough to wrap is a hint that says too much.
 */
export const WORDOKU_HINT_MAX_CHARS = 24

/**
 * How many recently printed words a new page refuses to reuse.
 *
 * Below the pool size, so a long book cycles through every word before any
 * repeats rather than failing a page. The store is the Studio's variety ledger,
 * which persists between sittings — a book built over three evenings still
 * spreads its words.
 */
export const WORDOKU_AVOID_WINDOW = 30

const VARIETY_KEY = studioVarietyKey('wordoku', 'target')

export interface WordokuTarget {
  /** Nine distinct letters A–Z, uppercase — read top-left to bottom-right. */
  word: string
  /** A theme nudge printed beside the answer boxes. Never the word itself. */
  hint: string
}

/** Uppercase A–Z only; everything else is dropped. */
export function normalizeTargetWord(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '')
}

/**
 * Why a word cannot be a Word-oku target, or an empty list when it can.
 *
 * Exported so any other source of words — a future AI prefetch, an import —
 * runs through the same gate the curated list does. Validation is on the
 * normalised form *and* the raw one, so "Bird-house" does not sneak past as
 * BIRDHOUSE with a hyphen printed nowhere.
 */
export function wordokuTargetFaults(target: { word: string; hint?: string }): string[] {
  const faults: string[] = []
  const word = target.word
  if (word !== normalizeTargetWord(word)) {
    faults.push('The hidden word must be plain capital letters A to Z.')
  }
  if (word.length !== WORDOKU_SIZE) {
    faults.push('The hidden word must be exactly nine letters long.')
  }
  if (new Set(word).size !== word.length) {
    faults.push('The hidden word repeats a letter, so it cannot fill a 9×9 grid.')
  }
  if (isUnsafeCopy(word)) {
    faults.push('The hidden word is not suitable for a published activity book.')
  }
  const hint = target.hint ?? ''
  if (hint) {
    if (hint.length > WORDOKU_HINT_MAX_CHARS) faults.push('The hint is too long to print.')
    if (normalizeTargetWord(hint).includes(word)) faults.push('The hint gives the word away.')
    if (isUnsafeCopy(hint)) faults.push('The hint is not suitable for a published activity book.')
  }
  return faults
}

export function isValidWordokuTarget(target: { word: string; hint?: string }): boolean {
  return wordokuTargetFaults(target).length === 0
}

let cachedTargets: WordokuTarget[] | null = null

/** Every curated word that clears the gate, de-duplicated, in file order. */
export function loadWordokuTargets(): WordokuTarget[] {
  if (!cachedTargets) {
    const seen = new Set<string>()
    cachedTargets = []
    for (const raw of targetData as { word: string; hint?: string }[]) {
      const target: WordokuTarget = {
        word: normalizeTargetWord(String(raw.word ?? '')),
        hint: String(raw.hint ?? '').trim(),
      }
      if (seen.has(target.word)) continue
      if (!isValidWordokuTarget(target)) continue
      seen.add(target.word)
      cachedTargets.push(target)
    }
  }
  return cachedTargets
}

/** The longest hint any page can print — what the page layout is sized for. */
export function longestWordokuHint(): string {
  return loadWordokuTargets().reduce(
    (longest, target) => (target.hint.length > longest.length ? target.hint : longest),
    '',
  )
}

/**
 * Candidate words for one page, best first.
 *
 * A seeded shuffle of the pool with everything this book printed lately moved
 * to the back, not removed: a word used recently still beats no puzzle, and the
 * caller walks the list until a grid builds.
 */
export function wordokuTargetCandidates(seed: number): WordokuTarget[] {
  const pool = loadWordokuTargets()
  const rng = createRng(deriveSeed(seed, 'wordoku:target'))
  const recent = new Set(studioAvoidList(VARIETY_KEY, WORDOKU_AVOID_WINDOW))
  const fresh = pool.filter((target) => !recent.has(target.word))
  const stale = pool.filter((target) => recent.has(target.word))
  return [...rng.shuffle(fresh), ...rng.shuffle(stale)]
}

/** Record a printed word so the next page of this book picks another. */
export function rememberWordokuTarget(word: string): void {
  rememberStudioContent(VARIETY_KEY, [word])
}
