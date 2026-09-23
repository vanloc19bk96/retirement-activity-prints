import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import {
  RETIREMENT_THEME_MIXED,
  parseRetirementThemeChoice,
} from '../_shared/retirement-theme-config'
import { codewordThemeSelectOptions, codewordWordPool, resolveCodewordTheme } from './content'
import { codewordPrintNote } from './layout'
import {
  CODEWORD_LEVEL_OPTIONS,
  DEFAULT_CODEWORD_LEVEL_ID,
  codewordInstruction,
  parseCodewordLevel,
} from './levels'

export { codewordInstruction as instructionFor }

/**
 * Two questions, and both are about the puzzle rather than the page.
 *
 * This is deliberately the same shape as the crossword's form, because a seller
 * building a book meets them side by side — but it asks strictly less. There is
 * no "write my own theme" box, and that is not a simplification for its own
 * sake: the crossword's custom theme exists to steer a language model that
 * writes clues, and a codeword has no clues to write. Its words come from the
 * bundled retirement wordlists, so a typed theme would have nothing to read it.
 * Offering a field that quietly does nothing is worse than not offering it.
 *
 * Everything else a codeword could be asked about — grid size, cell pitch,
 * number size, how many words interlock, how many columns the key runs in, how
 * many letters are given — is either fixed, part of the level, or derived from
 * the trim in Settings by `layout.ts`. The level's help line reports what those
 * decisions produced on the page currently set, so the note and the printed
 * page can never disagree.
 */
export const CODEWORD_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Theme',
    type: 'select',
    default: RETIREMENT_THEME_MIXED,
    options: codewordThemeSelectOptions(),
    helpWhen: (config) =>
      parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
        ? 'A different retirement theme each puzzle — the right pick for a whole book.'
        : 'The hidden words are drawn from this theme’s vocabulary.',
  },
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_CODEWORD_LEVEL_ID,
    options: CODEWORD_LEVEL_OPTIONS,
    helpWhen: (config, layout) =>
      codewordPrintNote(
        parseCodewordLevel(config),
        layout,
        config,
        codewordInstruction(config),
      ),
  },
]

/**
 * Refuse a level whose vocabulary cannot fill a grid.
 *
 * Nothing a seller types can cause this — there is no word input on this form —
 * so it guards the one thing that can: an edit to the bundled wordlists that
 * leaves a level's length band with too few single words to interlock. Without
 * the gate that edit would ship as a page of error copy inside a finished book.
 */
export function validateCodewordConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  const level = parseCodewordLevel(config)
  // Seed-independent: the pool is the same whichever theme the mix lands on,
  // because a thin theme borrows from the rest of the corpus.
  const pool = codewordWordPool(resolveCodewordTheme(config, 1).id, {
    minLetters: level.minLetters,
    maxLetters: level.maxLetters,
  })
  if (pool.length >= level.targetWords) return null
  return {
    field: 'level',
    message: 'There are not enough words for this level. Pick another level.',
  }
}
