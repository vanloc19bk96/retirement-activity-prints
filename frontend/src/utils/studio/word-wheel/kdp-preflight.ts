import { isUnsafeCopy } from '../retirement-word-search/content-quality'
import {
  fitsLetters,
  letterCounts,
  wordWheelFaults,
  type WordWheelPuzzle,
} from './content'
import {
  WHEEL_LETTER_MIN,
  WHEEL_MIN_DIAMETER,
  wordWheelWorkBudget,
  type WordWheelPagePlan,
} from './layout'
import type { WordWheelLevel } from './levels'
import type { WordWheelSheet } from './page'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

/**
 * The last gate before a sheet is considered export-ready.
 *
 * Fit and type size are already structural here — the wheel is sized from the
 * large-print floor, and a block that would overrun its reservation never gets
 * planned, let alone drawn. What is left is the class of fault a reader only
 * discovers after twenty minutes with a pencil, and every one of those is a
 * refund.
 *
 * This page can be wrong in three ways no other word game can, and all three
 * are invisible on the page itself. The nine letters might not spell the word
 * the page promises. A word on the answer list might need a letter the wheel
 * does not hold, or need one of them twice. And the puzzle page might ask for
 * more words than the solution can show. A solver hitting any of them cannot
 * tell the page is wrong — they assume they are. So each is checked against the
 * built puzzle rather than trusted from the code that built it.
 */
export function runWordWheelKdpPreflight(options: {
  puzzle: WordWheelPuzzle
  plan: WordWheelPagePlan
  sheet: WordWheelSheet
  level: WordWheelLevel
  /** The content column both blocks are centred in. */
  bandWidth: number
}): KdpPreflightResult {
  const { puzzle, plan, sheet, level, bandWidth } = options
  const warnings: string[] = []
  const errors: string[] = [...wordWheelFaults(puzzle)]
  if (errors.length > 0) return { ok: false, warnings, errors }

  /* --- every printed answer is a word this wheel really makes ------------- */

  const available = letterCounts(puzzle.target)
  const printed = sheet.list.words
  if (printed.length === 0) {
    errors.push('The answer page has no words to print.')
    return { ok: false, warnings, errors }
  }
  if (new Set(printed).size !== printed.length) {
    errors.push('The answer page prints the same word twice.')
  }
  for (const word of printed) {
    if (word === puzzle.target) {
      errors.push('The answer list gives away the nine-letter word.')
      break
    }
    if (word.length < puzzle.minWordLength) {
      errors.push('An answer is shorter than this level prints.')
      break
    }
    if (!word.includes(puzzle.center)) {
      errors.push('An answer does not use the center letter.')
      break
    }
    if (!fitsLetters(word, available)) {
      errors.push('An answer uses letters the wheel does not hold.')
      break
    }
    if (isUnsafeCopy(word)) {
      errors.push('An answer is not suitable for a published activity book.')
      break
    }
  }
  // The solution may print fewer words than the wheel makes when a tight band
  // drops the shortest finds — but never a word the wheel does not make.
  const claimed = new Set(puzzle.answers)
  if (printed.some((word) => !claimed.has(word))) {
    errors.push('The answer page lists a word the puzzle never found.')
  }

  /* --- the page asks for a number it can then show ------------------------ */

  if (sheet.goal < 1) {
    errors.push('This page asks the solver to find no words at all.')
  }
  if (sheet.goal > printed.length) {
    errors.push('This page asks for more words than the answer page lists.')
  }
  if (sheet.goal > sheet.lines.capacity) {
    errors.push('This page asks for more words than it leaves lines to write.')
  }
  if (printed.length < level.minAnswers) {
    warnings.push('The answer page dropped its shortest words to fit this page size.')
  }
  if (!sheet.list.captioned) {
    warnings.push('The answer page dropped its caption to fit the words.')
  }

  /* --- the page it was laid out for is the page it prints on -------------- */

  if (plan.diameter < WHEEL_MIN_DIAMETER) {
    errors.push('The wheel is too small to print its letters at large-print size.')
  }
  if (plan.outerLetterFont < WHEEL_LETTER_MIN) {
    errors.push('Wheel letters must stay at large-print size.')
  }
  if (plan.centerLetterFont <= plan.outerLetterFont) {
    errors.push('The center letter must be set larger than the letters around it.')
  }

  const budget = wordWheelWorkBudget(plan)
  if (sheet.lines.height > budget) {
    errors.push('The write-in lines will not fit under the wheel on this page.')
  }
  if (sheet.list.height > budget) {
    errors.push('The answers will not fit under the wheel on the solution page.')
  }
  if (plan.slots.blockWidth > bandWidth || sheet.list.blockWidth > bandWidth) {
    errors.push('A block under the wheel is wider than the printable column.')
  }

  return { ok: errors.length === 0, warnings, errors }
}
