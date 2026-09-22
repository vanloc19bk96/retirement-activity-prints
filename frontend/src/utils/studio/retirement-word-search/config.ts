import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import {
  AI_THEME_MAX_LENGTH,
  RETIREMENT_THEME_MIXED,
  isCustomRetirementTheme,
  parseRetirementThemeChoice,
  retirementThemeSelectOptions,
} from '../_shared/retirement-theme-config'
import { themeIpWarning } from './content-quality'
import { wordSearchPrintNote } from './layout'
import {
  DEFAULT_WORD_SEARCH_LEVEL_ID,
  WORD_SEARCH_LEVEL_OPTIONS,
  parseWordSearchLevel,
  wordSearchInstruction,
} from './levels'

export { wordSearchInstruction as instructionFor }

/**
 * Two questions, and both are about the puzzle rather than the page.
 *
 * What it no longer asks for — where the words come from, a category behind
 * the theme list, a print style, a difficulty, and a hand-typed word list — is
 * either fixed (every page is large print), part of the level, or derived from
 * the page size in `layout.ts`. Grid size and word count were never on the
 * form at all: they came from a table that could not see the trim, which is
 * how the same 12 x 12 grid ended up on a 5 x 8 interior and on 8.5 x 11.
 *
 * The level's help line reports what those decisions produced on the page size
 * currently set in Settings, so nothing the form decided stays hidden.
 */
export const WORD_SEARCH_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Theme',
    type: 'select',
    default: RETIREMENT_THEME_MIXED,
    options: retirementThemeSelectOptions(),
    helpWhen: (config) =>
      parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
        ? 'A different retirement theme each page — the right pick for a whole book.'
        : 'Fresh words are written for this theme every time.',
  },
  {
    key: 'customTheme',
    label: 'Your theme',
    type: 'text',
    default: '',
    max: AI_THEME_MAX_LENGTH,
    placeholder: 'e.g. Weekends in the garden',
    visibleWhen: isCustomRetirementTheme,
    help: `What the words should be about. Max ${AI_THEME_MAX_LENGTH} characters.`,
    warningWhen: (config) => themeIpWarning(String(config.customTheme ?? '')),
  },
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_WORD_SEARCH_LEVEL_ID,
    options: WORD_SEARCH_LEVEL_OPTIONS,
    helpWhen: (config, layout) =>
      wordSearchPrintNote(
        parseWordSearchLevel(config),
        layout,
        config,
        wordSearchInstruction(config),
      ),
  },
]

export function validateWordSearchConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  if (!isCustomRetirementTheme(config)) return null

  const typed = String(config.customTheme ?? '').trim()
  if (!typed) {
    return { field: 'customTheme', message: 'Enter a theme for the words.' }
  }
  if (typed.length > AI_THEME_MAX_LENGTH) {
    return {
      field: 'customTheme',
      message: `Keep the theme under ${AI_THEME_MAX_LENGTH} characters.`,
    }
  }
  return null
}
