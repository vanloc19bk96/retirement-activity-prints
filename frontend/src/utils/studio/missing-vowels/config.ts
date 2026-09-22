import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import {
  AI_THEME_MAX_LENGTH,
  RETIREMENT_THEME_MIXED,
  isCustomRetirementTheme,
  parseRetirementThemeChoice,
  retirementThemeSelectOptions,
  validateRetirementThemeChoice,
} from '../_shared/retirement-theme-config'
import { themeIpWarning } from '../retirement-word-search/content-quality'
import { missingVowelsInstruction } from './content'
import { missingVowelsPrintNote } from './layout'
import {
  DEFAULT_MISSING_VOWELS_LEVEL_ID,
  MISSING_VOWELS_LEVEL_OPTIONS,
  parseMissingVowelsLevel,
} from './levels'

/** Instruction text the page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  if (config.showInstructions === false) return ''
  return missingVowelsInstruction()
}

/**
 * Two questions, and both are about the puzzle rather than the page.
 *
 * The form this replaces asked six. A category, then a theme inside it, then a
 * toggle and a box for a theme of the seller's own — three fields to answer one
 * question, and a category list that existed only to shorten the theme list,
 * which meant a book could not run this game and the crossword on one theme.
 * Then a difficulty, a "print style" that offered to drop the puzzle below
 * large print on a page sold to people who bought it *for* the large print, and
 * a "Number of items" spinner the page had no say in.
 *
 * What is left is a theme and a level. Everything the old form asked about the
 * page — how many puzzles, how big the letters, one column or two — is derived
 * from the trim in Settings, because the page is the only thing that knows. The
 * theme picker is the one the crossword, the cryptogram and the anagram use, so
 * a book can put four games on one theme; its first option rotates the theme
 * per page, which is what a book wants, because twelve pages of "Gardening" is
 * twelve pages of the same vocabulary.
 *
 * The level's help line reports what those decisions produced on the trim
 * currently set in Settings, so the form never promises a page it cannot print.
 */
export const MISSING_VOWELS_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Theme',
    type: 'select',
    default: RETIREMENT_THEME_MIXED,
    options: retirementThemeSelectOptions(),
    helpWhen: (config) =>
      parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
        ? 'A different retirement theme each page — the right pick for a whole book.'
        : 'Fresh words and clues are written for this theme every time.',
  },
  {
    key: 'customTheme',
    label: 'Your theme',
    type: 'text',
    default: '',
    max: AI_THEME_MAX_LENGTH,
    visibleWhen: isCustomRetirementTheme,
    help: `What the words should be about — for example, weekends in the garden. Max ${AI_THEME_MAX_LENGTH} characters.`,
    warningWhen: (config) => themeIpWarning(String(config.customTheme ?? '')),
  },
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_MISSING_VOWELS_LEVEL_ID,
    options: MISSING_VOWELS_LEVEL_OPTIONS,
    helpWhen: (config, layout) =>
      missingVowelsPrintNote({
        level: parseMissingVowelsLevel(config),
        page: layout,
        config,
        instruction: instructionFor(config),
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
      }),
  },
]

export function validateMissingVowelsConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  return validateRetirementThemeChoice(config, 'words')
}
