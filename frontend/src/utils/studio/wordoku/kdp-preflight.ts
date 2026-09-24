import type { Box } from '../studio-layout'
import { WORDOKU_SIZE, type WordokuLevel } from './levels'
import { WORDOKU_LETTER_MIN, type WordokuPagePlan } from './layout'
import { wordokuFaults, wordokuLetterBank, type WordokuPuzzle } from './puzzle'

export interface KdpPreflightResult {
  ok: boolean
  errors: string[]
}

function inside(inner: Box, outer: Box): boolean {
  return (
    inner.left >= outer.left - 1 &&
    inner.top >= outer.top - 1 &&
    inner.left + inner.width <= outer.left + outer.width + 1 &&
    inner.top + inner.height <= outer.top + outer.height + 1
  )
}

/**
 * The last gate before a Word-oku is allowed onto a page.
 *
 * Two kinds of fault, both invisible on the page itself. The puzzle can be
 * wrong — a second solution, a diagonal that does not spell its word, a page
 * harder than its label — and a reader who hits one cannot tell the book is at
 * fault; they assume they are. Or the layout can be wrong: letters below large
 * print, or a block pushed past the column into the margin KDP trims. Every
 * check runs against the built puzzle and the plan it will be drawn from, never
 * trusted from the code that produced them.
 */
export function runWordokuKdpPreflight(options: {
  puzzle: WordokuPuzzle
  level: WordokuLevel
  plan: WordokuPagePlan
  /** The body column the page lays out in, header already taken off. */
  field: Box
}): KdpPreflightResult {
  const { puzzle, level, plan, field } = options
  const errors = wordokuFaults(puzzle, level)

  const bank = wordokuLetterBank(puzzle.target)
  if (bank.length !== WORDOKU_SIZE || new Set(bank).size !== WORDOKU_SIZE) {
    errors.push('The letter bank does not hold nine different letters.')
  }
  if (bank.join('') === puzzle.target.word) {
    errors.push('The letter bank spells the hidden word.')
  }

  if (plan.letterFont < WORDOKU_LETTER_MIN) {
    errors.push('Grid letters must stay at large-print size.')
  }
  if (plan.letterFont > plan.cell * 0.75) {
    errors.push('Grid letters are too large for their cells.')
  }
  if (Math.abs(plan.grid.width - plan.grid.height) > 1) {
    errors.push('The grid is not square.')
  }
  if (!inside(plan.stack, field)) {
    errors.push('The puzzle does not fit the printable area of this page.')
  }
  if (!inside(plan.grid, field) || !inside(plan.bank.frame, field)) {
    errors.push('The grid or letter bank runs past the printable column.')
  }
  if (plan.word.width > field.width || plan.word.boxesTop + plan.word.box > field.top + field.height + 1) {
    errors.push('The hidden-word boxes run past the printable area.')
  }

  return { ok: errors.length === 0, errors }
}
