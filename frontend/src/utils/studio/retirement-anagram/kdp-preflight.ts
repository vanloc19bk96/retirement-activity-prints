import { isUnsafeCopy } from '../retirement-word-search/content-quality'
import {
  MAX_CLUE_CHARS,
  clueGivesAnswerAway,
  isValidWordLength,
} from './content'
import type { AnagramPuzzleItem } from './draw'
import type { AnagramLevel } from './levels'
import { MAX_CLUE_LINES, SLOT_MIN_W, type AnagramPagePlan } from './layout'
import { hasUniqueAnagram, loadAnagramIndex, sortedKey } from './scramble'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

/**
 * The last gate before a sheet is considered export-ready.
 *
 * Wrap, safe area and type size are already structural: a row that will not fit
 * is never laid out, and the slot pitch is chosen from a floor. What is left is
 * the part a reader only discovers after an evening with a pencil — a scramble
 * that cannot be rearranged into its own answer, a clue pointing at a different
 * word, or two rows that are the same puzzle twice.
 *
 * Every one of those is a refund, so none of them may print.
 */
export function runAnagramKdpPreflight(options: {
  items: readonly AnagramPuzzleItem[]
  level: AnagramLevel
  plan: AnagramPagePlan
}): KdpPreflightResult {
  const { items, level, plan } = options
  const errors: string[] = []
  const warnings: string[] = []
  const index = loadAnagramIndex()

  if (items.length === 0) {
    errors.push('No anagrams were laid out.')
    return { ok: false, warnings, errors }
  }
  if (items.length !== plan.itemCount) {
    errors.push('The page holds a different number of words than it was laid out for.')
  }

  const answers = items.map((item) => item.answer)
  if (new Set(answers).size !== answers.length) {
    errors.push('The same word appears twice on one page.')
  }
  // Two different words built from the same letters print two scrambles a
  // reader cannot tell apart, and the key answers only one of them.
  const letterSets = answers.map((answer) => sortedKey(answer))
  if (new Set(letterSets).size !== letterSets.length) {
    errors.push('Two words on this page are built from the same letters.')
  }
  const scrambles = items.map((item) => item.scrambled)
  if (new Set(scrambles).size !== scrambles.length) {
    errors.push('The same scramble is printed twice on one page.')
  }

  for (const item of items) {
    if (!/^[A-Z]+$/.test(item.answer)) {
      errors.push('An answer holds something other than letters.')
      continue
    }
    if (!isValidWordLength(item.answer, level)) {
      errors.push('An answer is not a length this level can print.')
    }

    // The round trip is what the solver actually does: these letters, in some
    // order, must be that word. Checking it here means a sheet can only print
    // if every scramble on it rearranges into its own answer.
    if (sortedKey(item.scrambled) !== sortedKey(item.answer)) {
      errors.push('A scrambled word does not rearrange into its answer.')
    }
    if (item.scrambled === item.answer) {
      errors.push('A word was printed unscrambled.')
    }
    if (!hasUniqueAnagram(item.answer, index)) {
      errors.push('An answer shares its letters with another common word.')
    }

    const clue = item.clue.trim()
    if (!clue) {
      errors.push('A word was printed without a clue.')
      continue
    }
    if (clue.length > MAX_CLUE_CHARS) {
      errors.push('A clue is longer than the column was laid out for.')
    }
    if (clueGivesAnswerAway(clue, item.answer)) {
      errors.push('A clue gives its own answer away.')
    }
    if (isUnsafeCopy(clue)) {
      errors.push('A clue is not suitable for a published activity book.')
    }
  }

  if (plan.metrics.slotW < SLOT_MIN_W) {
    errors.push('Answer slots must stay wide enough to write in.')
  }
  if (plan.clueLineCount > MAX_CLUE_LINES) {
    errors.push('A clue needs more lines than the row reserved.')
  }

  if (items.length < 4) {
    warnings.push(
      `Printed ${items.length} words — a larger page size in Settings fits more.`,
    )
  }

  return { ok: errors.length === 0, warnings, errors }
}
