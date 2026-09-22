import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { BOX_DIMS, type SudokuSize } from './solver'
import {
  DEFAULT_SUDOKU_LEVEL_ID,
  SUDOKU_LEVEL_OPTIONS,
  parseSudokuLevel,
  type SudokuLevel,
} from './levels'
import { sudokuGridField, sudokuGridGeometry } from './layout'

export function instructionFor(size: SudokuSize): string {
  const [boxW, boxH] = BOX_DIMS[size]
  return `Fill every row, column and ${boxW}×${boxH} box with the numbers 1 to ${size}.`
}

/**
 * Below this the page stops being a large-print page.
 *
 * Every KDP trim clears it comfortably at the margins this app sets; the note
 * exists for the seller who has pushed the gutter out for a 600-page book on
 * the smallest trim, where the honest answer is "use a bigger page".
 */
const LARGE_PRINT_FLOOR_PT = 16

function formatInches(px: number): string {
  return (Math.round((px / DPI) * 10) / 10).toFixed(1)
}

/**
 * What this level will actually print on the page size the seller has chosen.
 *
 * Grid size, digit size and clue count are all decided for them, so the form
 * owes them a plain sentence about the result rather than the knobs.
 */
export function sudokuPrintNote(
  level: SudokuLevel,
  layout: StudioConfigLayoutContext | undefined,
  config: StudioConfig,
): string {
  const shape = `${level.size}×${level.size} grid, about ${level.targetClues} numbers already filled in.`
  if (!layout) return `${shape} Every puzzle has one solution and gets its own answer page.`

  const field = sudokuGridField(layout, config, instructionFor(level.size))
  const geometry = sudokuGridGeometry(field, level.size, layout.pageWidth)
  const digitPt = Math.round((geometry.digitFontSize * PDF_POINTS_PER_INCH) / DPI)
  const measurements = `Prints ${formatInches(geometry.bounds.width)} in wide with ${digitPt} pt numbers`

  if (digitPt < LARGE_PRINT_FLOOR_PT) {
    return `${shape} ${measurements} — a larger page size in Settings gives bigger, clearer numbers.`
  }
  return `${shape} ${measurements}, plus a matching answer page.`
}

export const SUDOKU_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_SUDOKU_LEVEL_ID,
    options: SUDOKU_LEVEL_OPTIONS,
    helpWhen: (config, layout) => sudokuPrintNote(parseSudokuLevel(config), layout, config),
  },
]
