import type { StudioConfig, StudioSelectOption } from '@/types/studio-template.types'
import type { SudokuDifficulty } from '../sudoku/rate'

/**
 * The one difficulty decision a Word-oku page asks for.
 *
 * Grid size is not a setting: the game is nine letters of a nine-letter word
 * on a 9×9 grid, and a 6×6 would have no word to hide. Which word, which cells
 * are given and how the diagonal is shaded are all decided for the seller. What
 * is left is how hard the page should be, and it moves three things at once
 * because they are one decision seen from three sides — how many letters are
 * printed, the hardest deduction the solve may need, and how much of the hidden
 * word is given away as a foothold.
 *
 * The ladder sits one rung gentler than the number Sudoku's on purpose. Letters
 * carry no order, so a reader cannot count up "what's missing from 1 to 9" the
 * way they can with digits: every candidate check is a scan of the letter bank.
 * The same clue count therefore reads harder in letters, and the bands below
 * are set higher to land each level where its Sudoku namesake feels.
 */
export type WordokuLevelId = 'gentle' | 'classic' | 'challenging'

export interface WordokuLevel {
  id: WordokuLevelId
  /** Option label in the form — short enough not to truncate in the panel. */
  label: string
  /**
   * Hardest technique a solver may need, and the one the rating must land on.
   * Guessing is never acceptable at any level.
   */
  ceiling: SudokuDifficulty
  /** Where carving aims. The band below is what actually ships. */
  targetClues: number
  /** Comfort band. Two pages of one level should look like siblings. */
  minClues: number
  maxClues: number
  /**
   * Letters of the hidden word printed on the shaded diagonal.
   *
   * The word is the reward, so most of it is left to be earned — but a couple
   * of letters in place give a reader who has spotted the theme somewhere to
   * start, and that foothold is what Gentle is for. Always the exact count:
   * a page of one level never gives away more of its word than its siblings.
   */
  diagonalGivens: number
}

/** Letters in the grid alphabet, in the hidden word, and cells on the diagonal. */
export const WORDOKU_SIZE = 9

export const WORDOKU_LEVELS: readonly WordokuLevel[] = [
  {
    id: 'gentle',
    label: 'Gentle — most letters given',
    ceiling: 'relaxed',
    targetClues: 42,
    minClues: 40,
    maxClues: 46,
    diagonalGivens: 3,
  },
  {
    id: 'classic',
    label: 'Classic — the everyday puzzle',
    ceiling: 'relaxed',
    targetClues: 35,
    minClues: 33,
    maxClues: 38,
    diagonalGivens: 2,
  },
  {
    id: 'challenging',
    label: 'Challenging — fewer letters given',
    ceiling: 'classic',
    targetClues: 31,
    minClues: 28,
    maxClues: 34,
    diagonalGivens: 1,
  },
]

export const DEFAULT_WORDOKU_LEVEL_ID: WordokuLevelId = 'classic'

const LEVEL_INDEX = new Map(WORDOKU_LEVELS.map((level) => [level.id, level]))

export const WORDOKU_LEVEL_OPTIONS: StudioSelectOption[] = WORDOKU_LEVELS.map((level) => ({
  label: level.label,
  value: level.id,
}))

/** Rows saved from a form that spoke in difficulties rather than levels. */
function legacyLevelId(config: StudioConfig): WordokuLevelId | null {
  const difficulty = String(config.difficulty ?? '')
  if (!difficulty) return null
  if (difficulty === 'easy' || difficulty === 'relaxed' || difficulty === 'gentle') {
    return 'gentle'
  }
  if (difficulty === 'hard' || difficulty === 'challenge' || difficulty === 'expert') {
    return 'challenging'
  }
  return 'classic'
}

export function parseWordokuLevel(config: StudioConfig): WordokuLevel {
  const chosen = LEVEL_INDEX.get(String(config.level ?? '') as WordokuLevelId)
  if (chosen) return chosen
  const legacy = legacyLevelId(config)
  return (
    (legacy ? LEVEL_INDEX.get(legacy) : undefined) ??
    LEVEL_INDEX.get(DEFAULT_WORDOKU_LEVEL_ID)!
  )
}

/**
 * The sentence under the heading: the Sudoku rule, then the reward.
 *
 * Says "letter" rather than "the letters A to I" because the alphabet is the
 * word's, printed in the bank right under this line.
 */
export const WORDOKU_INSTRUCTION =
  'Write each letter once in every row, column and 3×3 box. The shaded diagonal spells the hidden word.'

/** What the page tells the solver, unless the heading strip is switched off. */
export function wordokuInstruction(config: StudioConfig): string {
  if (config.showInstructions === false) return ''
  return WORDOKU_INSTRUCTION
}
