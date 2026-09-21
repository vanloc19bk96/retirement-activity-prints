import type { StudioConfig, StudioConfigField } from '@/types/studio-template.types'
import { BOX_DIMS, type SudokuSize } from './solver'
import type { SudokuDifficulty } from './rate'
import { parsePrintStyle, type RetirementPrintStyle } from '../crossword/config'

export type { SudokuDifficulty } from './rate'
export type { RetirementPrintStyle }

export function parseSize(raw: unknown): SudokuSize {
  if (raw === 6 || raw === '6' || raw === '6x6') return 6
  if (raw === 9 || raw === '9' || raw === '9x9') return 9
  if (raw === 4 || raw === '4' || raw === '4x4') return 6
  return 9
}

export function parseDifficulty(raw: unknown): SudokuDifficulty {
  const value = String(raw ?? 'classic')
  if (value === 'relaxed' || value === 'classic' || value === 'challenge') return value
  if (value === 'easy') return 'relaxed'
  if (value === 'hard' || value === 'expert') return 'challenge'
  return 'classic'
}

export function allowsTwoPuzzles(size: SudokuSize, printStyle: RetirementPrintStyle): boolean {
  return size === 6 || printStyle === 'standard'
}

export function parsePuzzlesPerPage(
  raw: unknown,
  size: SudokuSize,
  printStyle: RetirementPrintStyle,
): 1 | 2 {
  if (!allowsTwoPuzzles(size, printStyle)) return 1
  return raw === 2 || raw === '2' ? 2 : 1
}

export function instructionFor(size: SudokuSize): string {
  const [boxW, boxH] = BOX_DIMS[size]
  return `Fill the grid so every row, column, and ${boxW}×${boxH} box contains the numbers 1–${size} exactly once.`
}

/** 8.5" landscape-independent: convert print points to canvas pixels. */
export function printPointsToPx(pt: number, pageWidth: number): number {
  return Math.max(1, Math.round((pt * pageWidth) / (8.5 * 72)))
}

export function minDigitPx(printStyle: RetirementPrintStyle, pageWidth: number): number {
  return printPointsToPx(printStyle === 'large-print' ? 18 : 12, pageWidth)
}

export const SUDOKU_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'size',
    label: 'Grid size',
    type: 'select',
    default: '9x9',
    options: [
      { label: '9×9 (classic)', value: '9x9' },
      { label: '6×6 (2×3 boxes)', value: '6x6' },
    ],
    help: '6×6 is easier to read in large print. 9×9 is standard Sudoku.',
  },
  {
    key: 'difficulty',
    label: 'Difficulty',
    type: 'select',
    default: 'classic',
    options: [
      { label: 'Relaxed (singles and basic elimination)', value: 'relaxed' },
      { label: 'Classic (moderate logic, no guessing)', value: 'classic' },
      { label: 'Challenge (harder deductions, still no guessing)', value: 'challenge' },
    ],
  },
  {
    key: 'printStyle',
    label: 'Print style',
    type: 'select',
    default: 'large-print',
    options: [
      { label: 'Large print (default)', value: 'large-print' },
      { label: 'Standard', value: 'standard' },
    ],
    help: 'Large print keeps digits at least 18 pt and one 9×9 per page.',
  },
  {
    key: 'puzzlesPerPage',
    label: 'Puzzles per page',
    type: 'select',
    default: 1,
    options: [
      { label: '1 (default)', value: 1 },
      { label: '2', value: 2 },
    ],
    visibleWhen: (c: StudioConfig) =>
      allowsTwoPuzzles(parseSize(c.size), parsePrintStyle(c.printStyle)),
    help: 'Two per page for 6×6, or for 9×9 in standard print.',
  },
]
