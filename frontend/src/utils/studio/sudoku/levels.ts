import type { StudioConfig, StudioSelectOption } from '@/types/studio-template.types'
import type { SudokuSize } from './solver'
import type { SudokuDifficulty } from './rate'

/**
 * The ladder a retirement activity book actually ships.
 *
 * A seller picks one plain-language level; grid size, technique ceiling and
 * clue count are consequences of that choice, never separate form controls.
 *
 * The ceiling is capped at `classic` (naked/hidden pairs, pointing pairs) on
 * purpose. The rater can also recognise `challenge` work — naked triples and
 * X-wing — but that is expert-league deduction: it belongs in a specialist
 * title, not a book sold for relaxed solving, and carving down to the ~24
 * clues it needs costs roughly twenty times as long per page. Keeping the
 * rater aware of it is still what lets us *reject* a puzzle that drifted
 * there, so no reader ever hits a wall the cover did not promise.
 */
export type SudokuLevelId = 'gentle' | 'easy' | 'medium' | 'challenging'

export interface SudokuLevel {
  id: SudokuLevelId
  /** Option label in the form — short enough not to truncate in the panel. */
  label: string
  size: SudokuSize
  /** Hardest technique a solver may need. Guessing is never acceptable. */
  ceiling: SudokuDifficulty
  /** Where carving aims. The band below is what actually ships. */
  targetClues: number
  /** Comfort band. Two pages of one level should look like siblings. */
  minClues: number
  maxClues: number
}

export const SUDOKU_LEVELS: readonly SudokuLevel[] = [
  {
    id: 'gentle',
    label: 'Gentle — 6×6 grid',
    size: 6,
    ceiling: 'relaxed',
    targetClues: 20,
    minClues: 18,
    maxClues: 24,
  },
  {
    id: 'easy',
    label: 'Easy — most numbers given',
    size: 9,
    ceiling: 'relaxed',
    targetClues: 40,
    minClues: 36,
    maxClues: 46,
  },
  {
    id: 'medium',
    label: 'Medium — the classic puzzle',
    size: 9,
    ceiling: 'relaxed',
    targetClues: 32,
    minClues: 30,
    maxClues: 36,
  },
  {
    id: 'challenging',
    label: 'Challenging — fewest numbers given',
    size: 9,
    ceiling: 'classic',
    targetClues: 30,
    minClues: 27,
    maxClues: 34,
  },
]

export const DEFAULT_SUDOKU_LEVEL_ID: SudokuLevelId = 'medium'

const LEVEL_INDEX = new Map(SUDOKU_LEVELS.map((level) => [level.id, level]))

export const SUDOKU_LEVEL_OPTIONS: StudioSelectOption[] = SUDOKU_LEVELS.map((level) => ({
  label: level.label,
  value: level.id,
}))

function getSudokuLevel(id: string): SudokuLevel | undefined {
  return LEVEL_INDEX.get(id as SudokuLevelId)
}

function defaultSudokuLevel(): SudokuLevel {
  return LEVEL_INDEX.get(DEFAULT_SUDOKU_LEVEL_ID)!
}

/**
 * Sheets saved before the ladder replaced the grid-size / difficulty pair.
 * A book row or bulk job carried in from that form still has to generate.
 */
function legacyLevelId(config: StudioConfig): SudokuLevelId | null {
  const size = String(config.size ?? '')
  if (size === '6' || size === '6x6' || size === '4' || size === '4x4') return 'gentle'
  const difficulty = String(config.difficulty ?? '')
  if (!size && !difficulty) return null
  if (difficulty === 'relaxed' || difficulty === 'easy') return 'easy'
  if (difficulty === 'challenge' || difficulty === 'hard' || difficulty === 'expert') {
    return 'challenging'
  }
  return 'medium'
}

export function parseSudokuLevel(config: StudioConfig): SudokuLevel {
  const chosen = getSudokuLevel(String(config.level ?? ''))
  if (chosen) return chosen
  const legacy = legacyLevelId(config)
  return (legacy ? LEVEL_INDEX.get(legacy) : undefined) ?? defaultSudokuLevel()
}
