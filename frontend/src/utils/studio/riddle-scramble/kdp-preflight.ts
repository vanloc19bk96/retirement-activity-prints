import { isUnsafeCopy } from '../retirement-word-search/content-quality'
import {
  hasUniqueAnagram,
  loadAnagramIndex,
  sortedKey,
} from '../retirement-anagram/scramble'
import { markedLetters, type RiddleScramblePuzzle } from './build'
import {
  AWKWARD_ANSWER_LETTERS,
  MAX_CLUE_CHARS,
  MAX_RIDDLE_CHARS,
  givesWordAway,
  isValidWordLength,
} from './content'
import type { RiddleScrambleLevel } from './levels'
import {
  MAX_RIDDLE_LINES,
  SLOT_MIN_W,
  type RiddleScramblePagePlan,
} from './layout'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

/**
 * The last gate before a sheet is considered export-ready.
 *
 * Wrap, safe area and type size are already structural: a row that will not
 * fit is never laid out, and the slot pitch is chosen from a floor. What is
 * left is the part a reader only discovers after an evening with a pencil.
 *
 * On this page that part is longer than usual, because the page makes a
 * promise no other game makes: solve every word, read the marked letters, and
 * they spell the riddle's answer. A scramble that cannot be rearranged into
 * its word breaks one row; a marked letter in the wrong place breaks the whole
 * page, silently, for a reader who did everything right. So the chain is
 * re-derived here from what was actually laid out — not from the plan that
 * produced it — and a page whose marked letters do not spell its own answer
 * never prints.
 */
export function runRiddleScrambleKdpPreflight(options: {
  puzzle: RiddleScramblePuzzle
  level: RiddleScrambleLevel
  plan: RiddleScramblePagePlan
}): KdpPreflightResult {
  const { puzzle, level, plan } = options
  const errors: string[] = []
  const warnings: string[] = []
  const index = loadAnagramIndex()
  const { rows, answer, riddle } = puzzle

  if (rows.length === 0) {
    errors.push('No scrambled words were laid out.')
    return { ok: false, warnings, errors }
  }
  if (rows.length !== plan.rowCount) {
    errors.push('The page holds a different number of words than it was laid out for.')
  }

  // The chain, checked end to end. Everything else in this function is a
  // detail; this is the page.
  if (rows.length !== answer.length) {
    errors.push('The page prints a different number of words than the answer has letters.')
  }
  if (markedLetters(rows) !== answer) {
    errors.push('The marked letters do not spell the riddle answer.')
  }

  if (!/^[A-Z]+$/.test(answer)) {
    errors.push('The riddle answer holds something other than letters.')
  }
  if (answer.length !== level.answerLetters) {
    errors.push('The riddle answer is not the length this level prints.')
  }
  if ([...answer].some((letter) => AWKWARD_ANSWER_LETTERS.has(letter))) {
    errors.push('The riddle answer uses a letter ordinary words cannot supply.')
  }
  if (isUnsafeCopy(answer)) {
    errors.push('The riddle answer is not suitable for a published activity book.')
  }

  const question = riddle.trim()
  if (!question) {
    errors.push('The page was laid out without a riddle.')
  } else {
    if (!question.endsWith('?')) errors.push('The riddle is not written as a question.')
    if (question.length > MAX_RIDDLE_CHARS) {
      errors.push('The riddle is longer than the band was laid out for.')
    }
    if (givesWordAway(question, answer)) {
      errors.push('The riddle gives its own answer away.')
    }
    if (isUnsafeCopy(question)) {
      errors.push('The riddle is not suitable for a published activity book.')
    }
  }

  const words = rows.map((row) => row.word)
  if (new Set(words).size !== words.length) {
    errors.push('The same word appears twice on one page.')
  }
  // Two different words built from the same letters print two scrambles a
  // reader cannot tell apart, and the key answers only one of them.
  const letterSets = words.map((word) => sortedKey(word))
  if (new Set(letterSets).size !== letterSets.length) {
    errors.push('Two words on this page are built from the same letters.')
  }
  const scrambles = rows.map((row) => row.scrambled)
  if (new Set(scrambles).size !== scrambles.length) {
    errors.push('The same scramble is printed twice on one page.')
  }

  for (const row of rows) {
    if (!/^[A-Z]+$/.test(row.word)) {
      errors.push('A word holds something other than letters.')
      continue
    }
    if (!isValidWordLength(row.word, level)) {
      errors.push('A word is not a length this level can print.')
    }
    if (row.word === answer || row.word.includes(answer)) {
      errors.push('A scrambled word gives the riddle answer away.')
    }

    // The round trip is what the solver actually does: these letters, in some
    // order, must be that word. Checking it here means a sheet can only print
    // if every scramble on it rearranges into its own word.
    if (sortedKey(row.scrambled) !== sortedKey(row.word)) {
      errors.push('A scrambled word does not rearrange into its answer.')
    }
    if (row.scrambled === row.word) {
      errors.push('A word was printed unscrambled.')
    }
    if (!hasUniqueAnagram(row.word, index)) {
      errors.push('A word shares its letters with another common word.')
    }

    // A mark outside the word is the one fault that survives every other check
    // here: the row reads correctly, and the box sits on nothing.
    if (row.markIndex < 0 || row.markIndex >= row.word.length) {
      errors.push('A marked letter sits outside its word.')
    }

    const clue = row.clue.trim()
    if (!clue) {
      errors.push('A word was printed without a clue.')
      continue
    }
    if (clue.length > MAX_CLUE_CHARS) {
      errors.push('A clue is longer than the line was laid out for.')
    }
    if (givesWordAway(clue, row.word)) {
      errors.push('A clue gives its own answer away.')
    }
    if (givesWordAway(clue, answer)) {
      errors.push('A clue gives the riddle answer away.')
    }
    if (isUnsafeCopy(clue)) {
      errors.push('A clue is not suitable for a published activity book.')
    }
  }

  if (plan.metrics.slotW < SLOT_MIN_W) {
    errors.push('Answer slots must stay wide enough to write in.')
  }
  if (plan.riddle.lines.length > MAX_RIDDLE_LINES) {
    errors.push('The riddle needs more lines than the band reserved.')
  }

  // Every mark in the same column is still a valid puzzle, and still the sort
  // of thing a reader notices and mistrusts on the next page.
  if (rows.length > 3 && new Set(rows.map((row) => row.markIndex)).size === 1) {
    warnings.push('Every marked letter sits in the same column.')
  }

  return { ok: errors.length === 0, warnings, errors }
}
