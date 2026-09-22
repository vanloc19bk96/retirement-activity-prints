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
import { anagramInstruction } from './content'
import { anagramPrintNote } from './layout'
import {
  ANAGRAM_LEVEL_OPTIONS,
  DEFAULT_ANAGRAM_LEVEL_ID,
  parseAnagramLevel,
} from './levels'

/** Instruction text the page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  if (config.showInstructions === false) return ''
  return anagramInstruction(parseAnagramLevel(config))
}

/**
 * Two questions, and both are about the puzzle rather than the page.
 *
 * What it no longer asks for — a topic list of its own, a separate custom-topic
 * box, a word count and a "word length" band — is either shared with the other
 * games, part of the level, or derived from the page size in `layout.ts`. The
 * theme picker is the same one the crossword and the cryptogram use, so a book
 * can put three games on one theme; its first option rotates the theme per
 * page, which is what a book wants, because twelve pages of "Gardening" is
 * twelve pages of the same vocabulary.
 *
 * The level's help line reports what those decisions produced on the trim
 * currently set in Settings, so the form never promises a page it cannot print.
 */
export const RETIREMENT_ANAGRAM_CONFIG_SCHEMA: StudioConfigField[] = [
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
    default: DEFAULT_ANAGRAM_LEVEL_ID,
    options: ANAGRAM_LEVEL_OPTIONS,
    helpWhen: (config, layout) =>
      anagramPrintNote({
        level: parseAnagramLevel(config),
        page: layout,
        config,
        instruction: instructionFor(config),
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
      }),
  },
]

export function validateRetirementAnagramConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  return validateRetirementThemeChoice(config, 'words')
}
