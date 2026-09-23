import { countTokenReadings, placementsIntact } from '@/utils/puzzles/word-search-core'
import type { Box } from '../studio-layout'
import { isPalindrome, isUnsafeCopy } from '../retirement-word-search/content-quality'
import { clueEchoesAnswer } from './content'
import { MAX_CLUE_LINES, type TriviaListPlan } from './draw'
import { LETTER_MIN, triviaListBudget, type TriviaPagePlan } from './layout'
import type { TriviaLevel } from './levels'
import type { TriviaPuzzle } from './place'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

/**
 * The last gate before a sheet is considered export-ready.
 *
 * Fit, safe area and type size are already structural: the grid is built at a
 * pitch chosen from the large-print floor, and a clue too long for its column
 * never reaches the page. What is left is the part a reader only discovers
 * after twenty minutes with a pencil, and every one of those is a refund.
 *
 * This page can be wrong in one way the plain word search cannot: the clue and
 * the grid can disagree. So the three things that must line up are checked
 * against each other here rather than assumed from the code that built them —
 * every clue has exactly one answer, every answer is in the grid exactly once,
 * and the numbers the solution prints are the numbers the clues carry.
 */
export function runTriviaKdpPreflight(options: {
  puzzle: TriviaPuzzle
  plan: TriviaPagePlan
  level: TriviaLevel
  /** The body column the page lays out in — both blocks are checked in it. */
  field: Box
  clueList: TriviaListPlan
  answerList: TriviaListPlan
}): KdpPreflightResult {
  const { puzzle, plan, level, field, clueList, answerList } = options
  const warnings: string[] = []
  const errors: string[] = []

  if (puzzle.entries.length === 0) {
    errors.push('No clues were written for this page.')
    return { ok: false, warnings, errors }
  }

  /* --- the clue list and the answer list are the same list ---------------- */

  if (puzzle.entries.length !== puzzle.words.length) {
    errors.push('The clue list and the answer list do not line up.')
  }
  if (puzzle.words.length !== puzzle.displays.length) {
    errors.push('The answer list and its printed labels do not line up.')
  }
  if (
    puzzle.entries.some((entry, index) => entry.token !== puzzle.words[index])
  ) {
    errors.push('A clue is numbered against a different answer than the key prints.')
  }
  if (clueList.items.length !== answerList.items.length) {
    errors.push('The solution page lists a different number of answers than there are clues.')
  }
  if (new Set(puzzle.words).size !== puzzle.words.length) {
    errors.push('The same answer is used for two clues.')
  }

  /* --- every clue resolves to one answer, and says so honestly ------------ */

  for (const entry of puzzle.entries) {
    if (!entry.clue.trim()) {
      errors.push('A clue on this page is blank.')
      break
    }
  }
  if (puzzle.entries.some((entry) => clueEchoesAnswer(entry.token, entry.clue))) {
    errors.push('A clue prints the answer it is asking for.')
  }
  const clueKeys = puzzle.entries.map((entry) =>
    entry.clue.toLowerCase().replace(/[^a-z0-9 ]/g, ''),
  )
  if (new Set(clueKeys).size !== clueKeys.length) {
    errors.push('Two clues on this page read the same.')
  }
  if (puzzle.entries.some((entry) => isPalindrome(entry.token))) {
    errors.push('An answer reads the same backwards, so the key cannot mark it.')
  }
  if (
    puzzle.entries.some((entry) =>
      puzzle.entries.some(
        (other) => other !== entry && other.token.includes(entry.token),
      ),
    )
  ) {
    errors.push('One answer is contained inside another, so one circle marks two clues.')
  }

  /* --- every answer is in the grid, exactly once -------------------------- */

  const placed = new Set(puzzle.placements.map((placement) => placement.word))
  if (puzzle.words.some((token) => !placed.has(token))) {
    errors.push('An answer was never placed in the grid.')
  }
  if (puzzle.placements.length !== puzzle.words.length) {
    errors.push('The grid holds a placement that is not on the answer list.')
  }
  if (!placementsIntact(puzzle)) {
    errors.push('A placed answer no longer matches the grid.')
  }
  for (const token of puzzle.words) {
    // The key circles one path per answer, so there must only be one.
    if (countTokenReadings(puzzle.grid, token) !== 1) {
      errors.push('An answer reads in more than one place in the grid.')
      break
    }
  }

  /* --- the page it was laid out for is the page it prints on -------------- */

  if (puzzle.size !== plan.gridSide) {
    errors.push('The grid is not the size this page was laid out for.')
  }
  if (puzzle.words.some((token) => token.length > puzzle.size)) {
    errors.push('An answer is longer than the grid is wide.')
  }
  if (puzzle.entries.length > plan.clueCount) {
    errors.push('The clue list is longer than the page reserved room for.')
  }
  if (puzzle.entries.length < level.minClues) {
    errors.push('Too few clues were placed for a publishable page.')
  }
  if (plan.letterFont < LETTER_MIN) {
    errors.push('Grid letters must stay at large-print size.')
  }

  const budget = triviaListBudget(field, plan)
  if (clueList.height > budget) {
    errors.push('The clues will not fit under the grid on this page.')
  }
  if (answerList.height > budget) {
    errors.push('The answers will not fit under the grid on the solution page.')
  }
  if (clueList.items.some((item) => item.lines > MAX_CLUE_LINES)) {
    errors.push('A clue runs longer than the page reserved lines for.')
  }

  /* --- nothing here should put a KDP title at risk ------------------------ */

  if (puzzle.entries.some((entry) => isUnsafeCopy(entry.clue) || isUnsafeCopy(entry.token))) {
    errors.push('A clue or answer is not suitable for a published activity book.')
  }

  if (puzzle.entries.length < plan.clueCount) {
    warnings.push(
      `Printed ${puzzle.entries.length} of the ${plan.clueCount} clues this page was sized for.`,
    )
  }

  return { ok: errors.length === 0, warnings, errors }
}
