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
  validateRetirementThemeChoice,
} from '../_shared/retirement-theme-config'
import { themeIpWarning } from './content-quality'
import { cryptogramInstruction } from './content'
import { cryptogramPrintNote } from './layout'
import {
  CRYPTOGRAM_LEVEL_OPTIONS,
  DEFAULT_CRYPTOGRAM_LEVEL_ID,
  parseCryptogramLevel,
} from './levels'

/** Instruction text the page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  if (config.showInstructions === false) return ''
  return cryptogramInstruction(parseCryptogramLevel(config).starterLetters)
}

/**
 * Two questions, and both are about the puzzle rather than the page.
 *
 * What it no longer asks for — saying length, print style, puzzles per page, a
 * write-my-own toggle and the category behind the theme list — is either fixed
 * (every page is large print), part of the level, or derived from the page size
 * in `layout.ts`. The level's help line reports what those decisions produced
 * on the trim currently set in Settings.
 */
export const CRYPTOGRAM_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Theme',
    type: 'select',
    default: RETIREMENT_THEME_MIXED,
    options: retirementThemeSelectOptions(),
    helpWhen: (config) =>
      parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
        ? 'A different retirement theme each page — the right pick for a whole book.'
        : 'Fresh sayings are written for this theme every time.',
  },
  {
    key: 'customTheme',
    label: 'Your theme',
    type: 'text',
    default: '',
    max: AI_THEME_MAX_LENGTH,
    visibleWhen: isCustomRetirementTheme,
    help: `What the sayings should be about — for example, weekends in the garden. Max ${AI_THEME_MAX_LENGTH} characters.`,
    warningWhen: (config) => themeIpWarning(String(config.customTheme ?? '')),
  },
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_CRYPTOGRAM_LEVEL_ID,
    options: CRYPTOGRAM_LEVEL_OPTIONS,
    helpWhen: (config, layout) =>
      cryptogramPrintNote(
        parseCryptogramLevel(config),
        layout,
        config,
        instructionFor(config),
      ),
  },
]

export function validateCryptogramConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  return validateRetirementThemeChoice(config)
}
