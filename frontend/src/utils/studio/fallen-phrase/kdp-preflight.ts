import { isUnsafeCopy } from '../cryptogram/content-quality'
import { isValidPhrase, letterCount } from './content'
import {
  GAP,
  columnLetters,
  reconstructPhrase,
  type FallenPhraseGrid,
} from './grid'
import {
  FALLEN_PHRASE_MAX_COLS,
  FALLEN_PHRASE_MIN_CELL,
  FALLEN_PHRASE_MIN_COLS,
  FALLEN_PHRASE_MIN_LETTER,
  type FallenPhraseMetrics,
} from './layout'
import { FALLEN_PHRASE_MAX_ROWS, FALLEN_PHRASE_MIN_ROWS, type FallenPhraseLength } from './levels'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

const LETTER_RE = /^[A-Z]$/

function sortedLetters(letters: readonly string[]): string {
  return [...letters].sort().join('')
}

/**
 * The last gate before a sheet is considered export-ready.
 *
 * Wrap, safe area and type size are already structural: a saying that will not
 * fit is never gridded, and the cell pitch is chosen from a floor. What is
 * left is the part a reader only discovers after spending an evening on the
 * page — a column whose letters are not the letters its boxes want, a saying
 * the filled grid does not spell, or a puzzle with a column the solver cannot
 * place anything in.
 *
 * Every check here restates the promise the page makes to its solver, and
 * restates it against the built puzzle rather than against the plan that
 * produced it. The builder is careful; this is where we find out if it ever
 * stops being careful.
 */
export function runFallenPhraseKdpPreflight(options: {
  grid: FallenPhraseGrid
  length: FallenPhraseLength
  metrics: FallenPhraseMetrics
}): KdpPreflightResult {
  const { grid, length, metrics } = options
  const errors: string[] = []
  const warnings: string[] = []

  if (!isValidPhrase(grid.phrase, length)) {
    errors.push('The saying is not valid for this level.')
  }
  if (isUnsafeCopy(grid.phrase)) {
    errors.push('The saying is not safe to print.')
  }

  /* ---- The grid itself ------------------------------------------------- */

  if (grid.cols < FALLEN_PHRASE_MIN_COLS || grid.cols > FALLEN_PHRASE_MAX_COLS) {
    errors.push('The grid is not a printable width.')
  }
  if (
    grid.rows.length < FALLEN_PHRASE_MIN_ROWS ||
    grid.rows.length > FALLEN_PHRASE_MAX_ROWS
  ) {
    errors.push('The grid is not a printable height.')
  }
  for (const row of grid.rows) {
    if (row.length !== grid.cols) {
      errors.push('A grid row is not the full width of the grid.')
      break
    }
  }
  for (const row of grid.rows) {
    // A row of nothing is a row of the saying that went missing.
    if (!row.trim()) {
      errors.push('A grid row holds no letters at all.')
      break
    }
  }
  for (const row of grid.rows) {
    if ([...row].some((ch) => ch !== GAP && !LETTER_RE.test(ch))) {
      errors.push('A grid cell holds something other than a letter.')
      break
    }
  }

  /* ---- The promise the columns make ------------------------------------ */

  if (grid.columns.length !== grid.cols) {
    errors.push('The page does not carry one letter group per column.')
  } else {
    let emptyColumn = false
    let mismatched = false
    let miscounted = false
    for (let c = 0; c < grid.cols; c++) {
      const column = grid.columns[c]!
      const fromGrid = columnLetters(grid.rows, c)
      if (fromGrid.length === 0) emptyColumn = true
      // The letters printed under a column must be that column's own boxes,
      // rearranged and nothing else: no letter borrowed from a neighbour, none
      // dropped, none added.
      if (sortedLetters(column.letters) !== sortedLetters(fromGrid)) mismatched = true
      if (sortedLetters(column.fallen) !== sortedLetters(fromGrid)) mismatched = true
      // What a solver counts before they start: boxes above, letters below.
      if (column.fallen.length !== fromGrid.length) miscounted = true
    }
    if (mismatched) {
      errors.push('A column is printed with letters that do not belong to it.')
    }
    if (miscounted) {
      errors.push('A column shows a different number of letters than it has boxes.')
    }
    // Not an error. A column with no boxes has no letters printed under it
    // either, so the page still says exactly what it means and the puzzle is
    // solvable; it just prints as a blank stripe. `grid.ts` already weighs it
    // heavily against every other arrangement, and refusing it here would only
    // throw away the sayings for which every arrangement has one.
    if (emptyColumn) warnings.push('A column has no boxes to fill.')
  }

  const placed = grid.columns.reduce((sum, column) => sum + column.fallen.length, 0)
  if (placed !== letterCount(grid.phrase)) {
    errors.push('The fallen letters do not add up to the saying.')
  }

  /* ---- The round trip a solver actually makes -------------------------- */

  if (reconstructPhrase(grid.rows) !== grid.phrase) {
    errors.push('The filled grid does not spell the saying.')
  }

  /* ---- Print floors ----------------------------------------------------- */

  if (metrics.cell < FALLEN_PHRASE_MIN_CELL) {
    errors.push('Boxes must stay wide enough to write a letter in.')
  }
  if (
    metrics.letterSize < FALLEN_PHRASE_MIN_LETTER ||
    metrics.bankLetterSize < FALLEN_PHRASE_MIN_LETTER
  ) {
    errors.push('Letters must stay large enough to read.')
  }

  /* ---- Worth saying, not worth refusing over ---------------------------- */

  const givenAway = grid.columns.filter(
    (column) =>
      column.letters.length >= 3 &&
      new Set(column.letters).size > 1 &&
      column.fallen.join('') === column.letters.join(''),
  )
  if (givenAway.length > 0) {
    warnings.push('A column prints its letters in solved order.')
  }

  return { ok: errors.length === 0, warnings, errors }
}
