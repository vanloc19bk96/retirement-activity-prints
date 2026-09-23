import { readEntry } from '../crossword/validate'
import { distinctGridLetters, type CodewordPuzzle } from './build'
import { isExcludedCodewordWord } from './content'
import {
  KEY_FONT_MIN,
  NUMBER_MIN_SIZE,
  codewordCellMetrics,
  codewordKeyItems,
  starterPairs,
  type CodewordKeyPlan,
  type StarterCaption,
} from './draw'
import { CODEWORD_MIN_CELL } from './layout'
import type { CodewordLevel } from './levels'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

/**
 * The last gate before a codeword is considered export-ready.
 *
 * Fit, safe area and type size are already structural — the grid is built at a
 * pitch chosen from the writable floor, and a key strip that would overrun its
 * budget is never drawn. What is left is the part a reader only discovers after
 * an evening with a pencil, and every one of those is a refund.
 *
 * A codeword can be wrong in a way no other page in this library can. There are
 * no clues: the only thing telling a solver they are right is that the code
 * stays consistent. So the promises the page makes about that code are checked
 * against the drawn artefacts themselves rather than trusted from the module
 * that built them — one number per letter, one letter per number, every word
 * reading back off the grid through the inverse of the very mapping the cells
 * print, and starter pairs that agree with it.
 */
export function runCodewordKdpPreflight(options: {
  puzzle: CodewordPuzzle
  level: CodewordLevel
  key: CodewordKeyPlan
  gridCell: number
  /** The starter line as it will print. Absent only on a page that omits it. */
  starterCaption?: StarterCaption | null
}): KdpPreflightResult {
  const { puzzle, level, key, gridCell, starterCaption } = options
  const warnings: string[] = []
  const errors: string[] = []

  /* --- the grid is a grid --------------------------------------------- */

  if (puzzle.entries.length < level.minWords) {
    errors.push('This page interlocks fewer words than the level prints.')
    return { ok: false, warnings, errors }
  }
  if (new Set(puzzle.entries.map((entry) => entry.word)).size !== puzzle.entries.length) {
    errors.push('The same word is placed twice in one grid.')
  }
  for (const entry of puzzle.entries) {
    if (!/^[A-Z]+$/.test(entry.word)) {
      errors.push('A word in the grid is not spelled in plain letters.')
      break
    }
  }
  if (puzzle.entries.some((entry) => entry.word.length < level.minLetters)) {
    errors.push('A word in the grid is shorter than this level prints.')
  }
  if (puzzle.entries.some((entry) => entry.word.length > level.maxLetters)) {
    errors.push('A word in the grid is longer than this level prints.')
  }
  if (new Set(puzzle.entries.map((entry) => entry.dir)).size < 2) {
    errors.push('Every word in the grid runs the same way.')
  }

  /* --- the code is a code ---------------------------------------------- */

  const letters = distinctGridLetters(puzzle.grid)
  if (letters.length < level.minDistinctLetters) {
    errors.push('This grid uses too few letters to make a codeword.')
  }
  if (letters.length !== puzzle.letters.length) {
    errors.push('The grid and the code disagree about which letters appear.')
  }
  if (puzzle.letterToNumber.size !== letters.length) {
    errors.push('A letter in the grid has no number.')
  }
  if (new Set(puzzle.letterToNumber.values()).size !== puzzle.letterToNumber.size) {
    errors.push('Two letters share a number.')
  }
  if (puzzle.numberToLetter.size !== puzzle.letterToNumber.size) {
    errors.push('A number stands for more than one letter.')
  }
  for (const letter of letters) {
    const number = puzzle.letterToNumber.get(letter)
    if (number == null) {
      errors.push('A letter in the grid has no number.')
      break
    }
    if (!Number.isInteger(number) || number < 1 || number > letters.length) {
      errors.push('A code number falls outside the range the key prints.')
      break
    }
    if (puzzle.numberToLetter.get(number) !== letter) {
      errors.push('The code does not read the same way in both directions.')
      break
    }
  }

  /* --- the code, read back, spells the words the page promises ---------- */

  const inverse = new Map<number, string>()
  for (const [letter, number] of puzzle.letterToNumber) inverse.set(number, letter)
  const decoded = puzzle.grid.map((row) =>
    row.map((cell) => {
      if (cell === null) return null
      const number = puzzle.letterToNumber.get(cell)
      return number == null ? null : (inverse.get(number) ?? null)
    }),
  )
  for (const entry of puzzle.entries) {
    if (readEntry(puzzle.grid, entry) !== entry.word) {
      errors.push('A word does not read back off the grid it is placed in.')
      break
    }
    if (readEntry(decoded, entry) !== entry.word) {
      errors.push('Decoding the numbers in the grid does not spell the intended words.')
      break
    }
  }

  /* --- the starters are correct, and neither too much nor too little --- */

  if (puzzle.starters.size !== level.starterLetters) {
    errors.push('This page gives away a different number of letters than the level.')
  }
  for (const starter of puzzle.starters) {
    if (!letters.includes(starter)) {
      errors.push('A starter letter does not appear in the grid.')
      break
    }
    if (puzzle.letterToNumber.get(starter) == null) {
      errors.push('A starter letter has no number to print beside it.')
      break
    }
  }
  const pairs = starterPairs(puzzle)
  if (pairs.length !== puzzle.starters.size) {
    errors.push('The starter line does not print every letter that was given.')
  }
  for (const pair of pairs) {
    const [rawNumber, rawLetter] = pair.split(' = ')
    if (puzzle.numberToLetter.get(Number(rawNumber)) !== rawLetter) {
      errors.push('A starter pair on the page does not match the code.')
      break
    }
  }
  if (letters.length - puzzle.starters.size < level.starterLetters) {
    errors.push('Too little of the code is left for the solver to work out.')
  }
  // The page reserves one line for the pairs. A second line prints on top of
  // the number key, which is the one collision this layout can produce.
  if (starterCaption && !starterCaption.fitsOneLine) {
    errors.push('The starter letters will not fit on one line.')
  }
  if (starterCaption) {
    for (const pair of starterPairs(puzzle)) {
      if (!starterCaption.text.includes(pair)) {
        errors.push('The starter line does not print every letter that was given.')
        break
      }
    }
  }

  /* --- the key strip is the whole code, once each ----------------------- */

  const items = codewordKeyItems(puzzle)
  if (key.items.length !== letters.length) {
    errors.push('The number key does not print one box for every number.')
  }
  if (new Set(key.items.map((item) => item.number)).size !== key.items.length) {
    errors.push('A number appears twice in the number key.')
  }
  if (key.items.some((item, index) => item.number !== items[index]?.number)) {
    errors.push('The number key is not printed in number order.')
  }
  for (const item of key.items) {
    if (puzzle.numberToLetter.get(item.number) !== item.letter) {
      errors.push('A box in the number key holds the wrong letter.')
      break
    }
    if (item.given !== puzzle.starters.has(item.letter)) {
      errors.push('The number key disagrees about which letters were given.')
      break
    }
  }

  /* --- the page it was laid out for is the page it prints on ------------ */

  if (gridCell < CODEWORD_MIN_CELL) {
    errors.push('The grid cells are too small to write a letter into.')
  }
  if (codewordCellMetrics(gridCell).numberSize < NUMBER_MIN_SIZE) {
    errors.push('The numbers in the grid are too small to read.')
  }
  if (key.fontSize < KEY_FONT_MIN) {
    errors.push('The numbers under the key boxes are too small to read.')
  }

  /* --- nothing here should put a KDP title at risk ---------------------- */

  if (puzzle.entries.some((entry) => isExcludedCodewordWord(entry.word))) {
    errors.push('A word in the grid is not suitable for a published activity book.')
  }

  return { ok: errors.length === 0, warnings, errors }
}
