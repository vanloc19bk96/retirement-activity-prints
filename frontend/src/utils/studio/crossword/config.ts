import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import { themeIpWarning } from './content-quality'
import {
  CROSSWORD_LEVEL_OPTIONS,
  DEFAULT_CROSSWORD_LEVEL_ID,
  parseCrosswordLevel,
} from './levels'
import { crosswordPrintNote } from './layout'
import {
  AI_THEME_MAX_LENGTH,
  CROSSWORD_DEFAULT_THEME,
  CROSSWORD_THEME_CUSTOM,
  crosswordThemeSelectOptions,
  isCustomCrosswordTheme,
  parseCrosswordThemeChoice,
} from './theme'

export const CROSSWORD_INSTRUCTION =
  'Solve each clue and write the answers into the grid.'

/** Instruction text the page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  return config.showInstructions === false ? '' : CROSSWORD_INSTRUCTION
}

/**
 * Two questions, and both are about the puzzle rather than the page.
 *
 * What it no longer asks for — print style, answer count, letter range,
 * category — is either fixed (every page is large print) or derived from the
 * page size in `layout.ts`. The level's help line reports what those decisions
 * produced on the trim currently set in Settings.
 */
export const CROSSWORD_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Theme',
    type: 'select',
    default: CROSSWORD_DEFAULT_THEME,
    options: crosswordThemeSelectOptions(),
    helpWhen: (config) =>
      parseCrosswordThemeChoice(config) === CROSSWORD_DEFAULT_THEME
        ? 'A different retirement theme each puzzle — the right pick for a whole book.'
        : 'Fresh answers and clues are written for this theme every time.',
  },
  {
    key: 'customTheme',
    label: 'Your theme',
    type: 'text',
    default: '',
    max: AI_THEME_MAX_LENGTH,
    placeholder: 'e.g. Weekends in the garden',
    visibleWhen: isCustomCrosswordTheme,
    help: `What the answers should be about. Max ${AI_THEME_MAX_LENGTH} characters.`,
    warningWhen: (config) => themeIpWarning(String(config.customTheme ?? '')),
  },
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_CROSSWORD_LEVEL_ID,
    options: CROSSWORD_LEVEL_OPTIONS,
    helpWhen: (config, layout) =>
      crosswordPrintNote(
        parseCrosswordLevel(config),
        layout,
        config,
        instructionFor(config),
      ),
  },
]

export function validateCrosswordConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  if (parseCrosswordThemeChoice(config) !== CROSSWORD_THEME_CUSTOM) return null

  const typed = String(config.customTheme ?? '').trim()
  if (!typed) {
    return { field: 'customTheme', message: 'Enter a theme for the answers and clues.' }
  }
  if (typed.length > AI_THEME_MAX_LENGTH) {
    return {
      field: 'customTheme',
      message: `Keep the theme under ${AI_THEME_MAX_LENGTH} characters.`,
    }
  }
  return null
}
