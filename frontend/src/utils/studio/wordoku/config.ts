import type { StudioConfig, StudioConfigField } from '@/types/studio-template.types'
import { wordokuPrintNote } from './layout'
import {
  DEFAULT_WORDOKU_LEVEL_ID,
  WORDOKU_LEVEL_OPTIONS,
  parseWordokuLevel,
  wordokuInstruction,
} from './levels'

export { wordokuInstruction as instructionFor }

/**
 * One question, and it is about the puzzle rather than the page.
 *
 * Almost everything a Word-oku could be asked is decided by what the puzzle is.
 * Grid size is not a setting — nine letters need nine cells a row. The hidden
 * word is not one either: it has to hold nine *different* letters to be a
 * Sudoku alphabet at all, and it has to be safe to print, and a seller typing
 * one would be the first place either rule broke. So the word comes from a
 * curated, pre-validated retirement list and rotates through a book on its
 * own. Cell size, letter size and the shading of the diagonal come from
 * `layout.ts`, which can see the trim in Settings.
 *
 * There are deliberately no toggles for "shade the diagonal", "show the letter
 * bank" or "show the hint". Each of them is the page explaining itself to an
 * older reader, and a seller switching one off would be making the book harder
 * to use without making the puzzle any different.
 *
 * What is left is one question a seller can answer without knowing any of that:
 * how hard should this page be.
 */
export const WORDOKU_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_WORDOKU_LEVEL_ID,
    options: WORDOKU_LEVEL_OPTIONS,
    helpWhen: (config: StudioConfig, layout) =>
      wordokuPrintNote(parseWordokuLevel(config), layout, config, wordokuInstruction(config)),
  },
]
