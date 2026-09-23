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
import { themeIpWarning } from '../cryptogram/content-quality'
import { PHRASE_FINDER_INSTRUCTION } from './content'
import { phraseFinderPrintNote } from './layout'
import {
  DEFAULT_PHRASE_FINDER_LEVEL_ID,
  PHRASE_FINDER_LEVEL_OPTIONS,
  parsePhraseFinderLevel,
} from './levels'

/** Instruction text the page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  return config.showInstructions === false ? '' : PHRASE_FINDER_INSTRUCTION
}

/**
 * Two questions, and both are about the puzzle rather than the page.
 *
 * What the form does not ask for is the interesting part. Not how many letters
 * to give away — that is the difficulty, asked once as a level instead of twice
 * as a level and a percentage that could be set against it. Not which letters,
 * because choosing them well is the whole craft of this puzzle and `reveal.ts`
 * does it better than a spinner ever could. Not whether to print the clues:
 * these sayings are written rather than quoted, so a page without them has no
 * answer a solver could reach, which makes the clue part of the puzzle rather
 * than a setting to turn off. Not how many phrases a page holds,
 * how big the letters set, or where the rows break: the page is the only thing
 * that knows its own trim, and a seller asked to guess would be guessing about
 * a page size they set in another panel.
 *
 * The theme picker is the one the cryptogram, the crossword and the anagram use,
 * so a book can put four games on one theme; its first option rotates the theme
 * per page, which is what a book wants, because twelve pages of "Gardening" is
 * twelve pages of the same vocabulary. The level's help line reports what its
 * choices produced on the trim currently set in Settings, so the form never
 * promises a page it cannot print.
 */
export const PHRASE_FINDER_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Theme',
    type: 'select',
    default: RETIREMENT_THEME_MIXED,
    options: retirementThemeSelectOptions(),
    helpWhen: (config) =>
      parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
        ? 'A different retirement theme each page — the right pick for a whole book.'
        : 'Fresh phrases and clues are written for this theme every time.',
  },
  {
    key: 'customTheme',
    label: 'Your theme',
    type: 'text',
    default: '',
    max: AI_THEME_MAX_LENGTH,
    visibleWhen: isCustomRetirementTheme,
    help: `What the phrases should be about — for example, weekends in the garden. Max ${AI_THEME_MAX_LENGTH} characters.`,
    warningWhen: (config) => themeIpWarning(String(config.customTheme ?? '')),
  },
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_PHRASE_FINDER_LEVEL_ID,
    options: PHRASE_FINDER_LEVEL_OPTIONS,
    helpWhen: (config, layout) =>
      phraseFinderPrintNote({
        level: parsePhraseFinderLevel(config),
        page: layout,
        config,
        instruction: instructionFor(config),
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
      }),
  },
]

export function validatePhraseFinderConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  return validateRetirementThemeChoice(config, 'phrases')
}
