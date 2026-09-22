import type { WordSearchPuzzle } from '@/utils/puzzles/word-search-core'
import { countTokenReadings, placementsIntact } from '@/utils/puzzles/word-search-core'
import { isUnsafeCopy } from './content-quality'
import { LETTER_MIN, type WordSearchPagePlan } from './layout'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

/**
 * The last gate before a sheet is considered export-ready.
 *
 * Fit, safe area and type size are already structural: the grid is built at a
 * pitch chosen from the large-print floor, and a word too wide for its bank
 * column never reaches the page. What is left is the part a reader only
 * discovers after spending twenty minutes with a pencil — a word that is not
 * in the grid, a word that is in it twice, or a key that circles something
 * else. Every one of those is a refund, so none of them may print.
 */
export function runWordSearchKdpPreflight(options: {
  puzzle: WordSearchPuzzle
  plan: WordSearchPagePlan
}): KdpPreflightResult {
  const { puzzle, plan } = options
  const warnings: string[] = []
  const errors: string[] = []

  if (puzzle.words.length === 0) {
    errors.push('No words were placed in the grid.')
    return { ok: false, warnings, errors }
  }

  if (puzzle.words.length !== puzzle.displays.length) {
    errors.push('The word list and its printed labels do not line up.')
  }

  if (new Set(puzzle.words).size !== puzzle.words.length) {
    errors.push('The same word is listed twice.')
  }

  // Every listed word has a placement, and every placement is still spelled by
  // the grid it was written into — the filler pass must not have overwritten it.
  const placed = new Set(puzzle.placements.map((placement) => placement.word))
  if (puzzle.words.some((token) => !placed.has(token))) {
    errors.push('A listed word was never placed in the grid.')
  }
  if (puzzle.placements.length !== puzzle.words.length) {
    errors.push('The grid holds a placement that is not on the word list.')
  }
  if (!placementsIntact(puzzle)) {
    errors.push('A placed word no longer matches the grid.')
  }

  // The answer key circles one path per word, so there must only be one.
  for (const token of puzzle.words) {
    if (countTokenReadings(puzzle.grid, token) !== 1) {
      errors.push('A listed word reads in more than one place in the grid.')
      break
    }
  }

  if (puzzle.size !== plan.gridSide) {
    errors.push('The grid is not the size this page was laid out for.')
  }
  if (puzzle.words.some((token) => token.length > puzzle.size)) {
    errors.push('A listed word is longer than the grid is wide.')
  }

  if (plan.letterFont < LETTER_MIN) {
    errors.push('Grid letters must stay at large-print size.')
  }

  const unsafe = puzzle.displays.filter((display) => isUnsafeCopy(display))
  if (unsafe.length > 0) {
    errors.push('A listed word is not suitable for a published activity book.')
  }

  if (puzzle.words.length < plan.wordCount) {
    warnings.push(
      `Printed ${puzzle.words.length} of the ${plan.wordCount} words this page was sized for.`,
    )
  }

  return { ok: errors.length === 0, warnings, errors }
}
