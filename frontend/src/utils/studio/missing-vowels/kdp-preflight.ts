import type { MissingVowelsItem } from '@/types/studio-missing-vowels.types'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'
import { MAX_CLUE_CHARS, clueGivesAnswerAway, isValidAnswerShape } from './content'
import type { MissingVowelsLevel } from './levels'
import { MAX_CLUE_LINES, SLOT_MIN_W, type MissingVowelsPagePlan } from './layout'
import {
  answerWords,
  isPlayableAnswer,
  letterToken,
  maskedText,
  toSlots,
  vowelCount,
} from './mask'
import { hasUniqueAnswerFill, loadVowelPatternIndex } from './pattern'

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
 * the part a reader only discovers after an evening with a pencil — a row whose
 * blanks spell a second word just as well, a clue pointing at something else,
 * or two rows that are the same puzzle twice.
 *
 * Every one of those is a refund, so none of them may print.
 */
export function runMissingVowelsKdpPreflight(options: {
  items: readonly MissingVowelsItem[]
  level: MissingVowelsLevel
  plan: MissingVowelsPagePlan
}): KdpPreflightResult {
  const { items, level, plan } = options
  const errors: string[] = []
  const warnings: string[] = []
  const index = loadVowelPatternIndex()

  if (items.length === 0) {
    errors.push('No missing-vowels puzzles were laid out.')
    return { ok: false, warnings, errors }
  }
  if (items.length !== plan.itemCount) {
    errors.push('The page holds a different number of puzzles than it was laid out for.')
  }

  const answers = items.map((item) => item.answer)
  if (new Set(answers).size !== answers.length) {
    errors.push('The same answer appears twice on one page.')
  }
  // Two rows printing the same blanks are the same puzzle to a reader, and the
  // key answers them differently.
  const masks = answers.map((answer) => maskedText(answer))
  if (new Set(masks).size !== masks.length) {
    errors.push('The same row of blanks is printed twice on one page.')
  }

  for (const item of items) {
    if (!/^[A-Z]+(?: [A-Z]+)*$/.test(item.answer)) {
      errors.push('An answer holds something other than letters.')
      continue
    }
    if (!isValidAnswerShape(item.answer, level)) {
      errors.push('An answer is not a length this level can print.')
    }
    if (answerWords(item.answer).length > level.maxWords) {
      errors.push('An answer runs to more words than the row was laid out for.')
    }

    // The round trip is what the solver actually does: the slots the page
    // draws, read straight across with every blank written back in, have to
    // spell this answer. The page draws from the same slot list, so a sheet can
    // only print when each printed row restores to its own word.
    const restored = toSlots(item.answer)
      .map((slot) => (slot.gap ? ' ' : slot.letter))
      .join('')
    if (restored !== item.answer) {
      errors.push('A row of blanks does not restore to its own answer.')
    }
    if (!isPlayableAnswer(item.answer)) {
      errors.push('An answer does not leave enough blanks to be a puzzle.')
    }
    if (vowelCount(item.answer) === letterToken(item.answer).length) {
      errors.push('An answer is all vowels, so the row prints nothing to read.')
    }
    if (!hasUniqueAnswerFill(item.answer, index)) {
      errors.push('Another common word fits the same blanks as an answer.')
    }

    const clue = item.clue.trim()
    if (!clue) {
      errors.push('A puzzle was printed without a clue.')
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
    errors.push('Answer blanks must stay wide enough to write in.')
  }
  if (plan.clueLineCount > MAX_CLUE_LINES) {
    errors.push('A clue needs more lines than the row reserved.')
  }

  if (items.length < 4) {
    warnings.push(
      `Printed ${items.length} puzzles — a larger page size in Settings fits more.`,
    )
  }

  return { ok: errors.length === 0, warnings, errors }
}
