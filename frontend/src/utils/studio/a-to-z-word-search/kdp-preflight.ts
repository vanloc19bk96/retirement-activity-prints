import { countTokenReadings, placementsIntact } from '@/utils/puzzles/word-search-core'
import { isPalindrome, isUnsafeCopy } from '../retirement-word-search/content-quality'
import { ALPHABET, ATOZ_WORD_COUNT } from './content'
import type { AtoZListPlan } from './draw'
import { ATOZ_CELL_MIN, LETTER_MIN, atoZBandBudget, type AtoZPagePlan } from './layout'
import type { AtoZLevel } from './levels'
import type { AtoZPuzzle } from './place'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

/**
 * The last gate before a sheet is considered export-ready.
 *
 * Fit, safe area and type size are already structural: the grid is built at a
 * pitch chosen from the large-print floor, and a band that would overrun its
 * reservation never gets drawn. What is left is the part a reader only discovers
 * after twenty minutes with a pencil, and every one of those is a refund.
 *
 * This page can be wrong in one way no other word search can: the alphabet and
 * the grid can disagree. The puzzle page prints no words at all, so a solver has
 * nothing to check a missing letter against — they simply hunt for a word that
 * was never hidden. So the three things that have to line up are checked against
 * each other here rather than assumed from the code that built them: every letter
 * from A to Z appears exactly once, every word begins with the letter it is
 * printed against, and every one of those words is in the grid exactly once.
 */
export function runAtoZKdpPreflight(options: {
  puzzle: AtoZPuzzle
  plan: AtoZPagePlan
  level: AtoZLevel
  lettersBand: AtoZListPlan
  answersBand: AtoZListPlan
}): KdpPreflightResult {
  const { puzzle, plan, level, lettersBand, answersBand } = options
  const warnings: string[] = []
  const errors: string[] = []

  /* --- the alphabet is complete, in order, and each letter is answered ---- */

  if (puzzle.entries.length !== ATOZ_WORD_COUNT) {
    errors.push(`This page hides ${puzzle.entries.length} words, not all twenty-six letters.`)
    return { ok: false, warnings, errors }
  }
  const letters = puzzle.entries.map((entry) => entry.letter)
  if (new Set(letters).size !== ATOZ_WORD_COUNT) {
    errors.push('A letter of the alphabet is answered twice on this page.')
  }
  if (letters.some((letter, index) => letter !== ALPHABET[index])) {
    errors.push('The letters on this page do not run from A to Z.')
  }
  for (const entry of puzzle.entries) {
    if (!entry.token.startsWith(entry.letter)) {
      errors.push('A hidden word does not begin with the letter it is printed against.')
      break
    }
    if (!entry.display.toUpperCase().startsWith(entry.letter)) {
      errors.push('A printed answer does not begin with the letter it is printed against.')
      break
    }
  }

  /* --- the band, the grid and the key are all the same list --------------- */

  if (puzzle.entries.length !== puzzle.words.length) {
    errors.push('The letter list and the word list do not line up.')
  }
  if (puzzle.words.length !== puzzle.displays.length) {
    errors.push('The word list and its printed labels do not line up.')
  }
  if (puzzle.entries.some((entry, index) => entry.token !== puzzle.words[index])) {
    errors.push('A letter is numbered against a different word than the key prints.')
  }
  if (new Set(puzzle.words).size !== puzzle.words.length) {
    errors.push('The same word is hidden for two different letters.')
  }
  if (lettersBand.items.length !== ATOZ_WORD_COUNT) {
    errors.push('The puzzle page does not print all twenty-six letters.')
  }
  if (answersBand.items.length !== ATOZ_WORD_COUNT) {
    errors.push('The solution page does not print all twenty-six answers.')
  }
  if (answersBand.items.some((item) => !item.word?.trim())) {
    errors.push('A letter on the solution page has no word beside it.')
  }
  if (
    answersBand.items.some((item, index) => item.letter !== puzzle.entries[index]?.letter)
  ) {
    errors.push('The solution page lists the letters in a different order than the puzzle.')
  }

  /* --- no two words a single circle would answer -------------------------- */

  if (puzzle.entries.some((entry) => isPalindrome(entry.token))) {
    errors.push('A hidden word reads the same backwards, so the key cannot mark it.')
  }
  for (const entry of puzzle.entries) {
    const reversed = [...entry.token].reverse().join('')
    const clash = puzzle.entries.find(
      (other) =>
        other !== entry &&
        (other.token.includes(entry.token) || other.token === reversed),
    )
    if (clash) {
      errors.push('One hidden word marks another, so two letters share a single answer.')
      break
    }
  }

  /* --- every word is in the grid, exactly once --------------------------- */

  const placed = new Set(puzzle.placements.map((placement) => placement.word))
  if (puzzle.words.some((token) => !placed.has(token))) {
    errors.push('A word was never placed in the grid.')
  }
  if (puzzle.placements.length !== puzzle.words.length) {
    errors.push('The grid holds a placement that is not on the answer list.')
  }
  if (!placementsIntact(puzzle)) {
    errors.push('A placed word no longer matches the grid.')
  }
  for (const token of puzzle.words) {
    // The key circles one path per word, so there must only be one.
    if (countTokenReadings(puzzle.grid, token) !== 1) {
      errors.push('A hidden word reads in more than one place in the grid.')
      break
    }
  }

  /* --- the page it was laid out for is the page it prints on -------------- */

  if (puzzle.size !== plan.gridSide) {
    errors.push('The grid is not the size this page was laid out for.')
  }
  if (puzzle.words.some((token) => token.length > puzzle.size)) {
    errors.push('A hidden word is longer than the grid is wide.')
  }
  if (puzzle.words.some((token) => token.length < level.minLetters)) {
    errors.push('A hidden word is shorter than this level prints.')
  }
  if (plan.letterFont < LETTER_MIN) {
    errors.push('Grid letters must stay at large-print size.')
  }
  if (plan.cell < ATOZ_CELL_MIN) {
    errors.push('The grid pitch is too tight for large-print letters.')
  }

  const budget = atoZBandBudget(plan)
  if (lettersBand.height > budget) {
    errors.push('The letters will not fit under the grid on this page.')
  }
  if (answersBand.height > budget) {
    errors.push('The answers will not fit under the grid on the solution page.')
  }

  /* --- nothing here should put a KDP title at risk ------------------------ */

  if (puzzle.entries.some((entry) => isUnsafeCopy(entry.display))) {
    errors.push('A hidden word is not suitable for a published activity book.')
  }

  if (!answersBand.captioned) {
    warnings.push('The solution page dropped its caption to fit the answers.')
  }

  return { ok: errors.length === 0, warnings, errors }
}
