import { countTokenReadings, placementsIntact } from '@/utils/puzzles/word-search-core'
import type { Box } from '../studio-layout'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'
import { fitMessageStrip } from './draw'
import {
  hiddenMessagePageBands,
  LETTER_MIN,
  type HiddenMessagePagePlan,
} from './layout'
import type { HiddenMessageLevel } from './levels'
import type { HiddenMessagePuzzle } from './place'

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
 * discovers after twenty minutes with a pencil — a word that is not in the
 * grid, a word that is in it twice, a key that circles something else, or
 * leftover letters that spell most of a saying and then wander off. Every one
 * of those is a refund, so none of them may print.
 *
 * The hidden message adds one class of fault the plain word search cannot have:
 * the saying and the grid can disagree. That is checked here against the grid
 * that will actually be drawn, not against the intent that produced it.
 */
export function runHiddenMessageKdpPreflight(options: {
  puzzle: HiddenMessagePuzzle
  plan: HiddenMessagePagePlan
  level: HiddenMessageLevel
  /** The body column the puzzle page lays out in — the write-in strip is checked in it. */
  field: Box
}): KdpPreflightResult {
  const { puzzle, plan, level, field } = options
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

  // Every listed word has a placement, and every placement still spells the
  // word it was written as once the saying's letters are in the grid.
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
  if (puzzle.words.length > plan.maxWords) {
    errors.push('The word list is longer than the page reserved room for.')
  }
  if (puzzle.words.length < level.minWords) {
    errors.push('Too few words were placed for a publishable page.')
  }

  // The hidden message itself: the free cells, read the way the instruction
  // tells the solver to read them, must be the saying and nothing else.
  const letters = puzzle.messageLetters
  if (letters.length !== puzzle.leftoverCells.length) {
    errors.push('The leftover letters do not add up to the hidden message.')
  } else {
    const read = puzzle.leftoverCells
      .map((cell) => puzzle.grid[cell.r]?.[cell.c] ?? '')
      .join('')
    if (read !== letters) {
      errors.push('The leftover letters do not spell the hidden message.')
    }
  }
  const claimed = puzzle.grid.flat().filter((cell) => cell !== '').length
  if (claimed !== puzzle.size * puzzle.size) {
    errors.push('The grid has a cell that holds neither a word nor the message.')
  }
  if (
    letters.length < level.minMessageLetters ||
    letters.length > level.maxMessageLetters
  ) {
    errors.push('The hidden message is not a length this level can hide.')
  }

  if (plan.letterFont < LETTER_MIN) {
    errors.push('Grid letters must stay at large-print size.')
  }

  // The write-in rules are the one band whose height depends on content the
  // plan could only reserve for. Prove the real saying fits the real strip.
  const bands = hiddenMessagePageBands(field, plan)
  if (!fitMessageStrip(bands.message, puzzle.messageWords, plan.message)) {
    errors.push('The hidden message will not fit its writing lines on this page.')
  }

  if (puzzle.displays.some((display) => isUnsafeCopy(display))) {
    errors.push('A listed word is not suitable for a published activity book.')
  }
  if (isUnsafeCopy(puzzle.messageDisplay)) {
    errors.push('The hidden message is not suitable for a published activity book.')
  }

  if (puzzle.words.length < level.minWords + 2) {
    warnings.push(
      `Printed ${puzzle.words.length} words — a broader theme usually fills the grid with more.`,
    )
  }

  return { ok: errors.length === 0, warnings, errors }
}
