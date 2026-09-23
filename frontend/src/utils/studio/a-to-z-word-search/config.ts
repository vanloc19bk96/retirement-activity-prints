import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import { ALPHABET, lettersWithoutWords } from './content'
import { ATOZ_MAX_SIDE, atoZPrintNote } from './layout'
import {
  ATOZ_LEVEL_OPTIONS,
  DEFAULT_ATOZ_LEVEL_ID,
  atoZInstruction,
  parseAtoZLevel,
} from './levels'

export { atoZInstruction as instructionFor }

/**
 * One question, and it is about the puzzle rather than the page.
 *
 * This is the shortest form in the library on purpose. The plain word search asks
 * for a theme and a level; this game cannot use a theme — twenty-six letters
 * cannot all be filled from one subject without reaching for words no reader
 * knows, and a page whose X word is XERISCAPE is a page that gets returned. The
 * vocabulary is a curated everyday-life lexicon instead, drawn fresh per puzzle
 * from a seeded shuffle, so a long book does not repeat itself.
 *
 * Word count is not a setting either, and cannot be: the puzzle *is* the
 * alphabet. Grid size, cell pitch, type sizes, how many columns the letters and
 * the answers run in — all of it comes from `layout.ts`, which can see the trim in
 * Settings, and the level's help line reports what that produced. What is left is
 * genuinely one decision, and it is the one a seller can answer without knowing
 * anything technical: how hard should the hunt be.
 */
export const ATOZ_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_ATOZ_LEVEL_ID,
    options: ATOZ_LEVEL_OPTIONS,
    helpWhen: (config, layout) =>
      atoZPrintNote(parseAtoZLevel(config), layout, config, atoZInstruction(config)),
  },
]

/**
 * Refuse a level the bundled lexicon cannot fill.
 *
 * Nothing a seller types can cause this — there is no word input on this form —
 * so it exists for the one thing that can: an edit to `lexicon.json` that leaves
 * a letter with no printable word inside a level's length bounds. Without the
 * gate, that edit would ship as a puzzle quietly missing a letter, which is the
 * one fault this page cannot survive.
 */
export function validateAtoZConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  const level = parseAtoZLevel(config)
  const missing = lettersWithoutWords({
    minLetters: level.minLetters,
    maxLetters: level.maxLetters,
    gridSide: ATOZ_MAX_SIDE,
  })
  if (missing.length === 0) return null
  return {
    field: 'level',
    message:
      `This level has no word for ${missing.length === ALPHABET.length ? 'any letter' : missing.join(', ')}. ` +
      'Pick another level.',
  }
}
