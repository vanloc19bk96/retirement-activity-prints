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
import { themeIpWarning } from '../cryptogram/content-quality'
import { FALLEN_PHRASE_INSTRUCTION } from './content'
import { fallenPhrasePrintNote } from './layout'
import {
  DEFAULT_FALLEN_PHRASE_LEVEL_ID,
  FALLEN_PHRASE_LEVEL_OPTIONS,
  parseFallenPhraseLevel,
} from './levels'

/** Instruction text the page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  return config.showInstructions === false ? '' : FALLEN_PHRASE_INSTRUCTION
}

/**
 * Two questions, and both are about the puzzle rather than the page.
 *
 * What the form does not ask for is the interesting part. Not the grid size:
 * columns come from the trim in Settings and rows come from the level, and a
 * seller asked for both could set a grid no page can print. Not the saying
 * length, because that *is* the level — a five-row grid needs a saying long
 * enough to fill it, so "how long" and "how hard" are one question asked
 * twice. Not letter size, not how much to shuffle, not whether to show the
 * answer: every page is large print, the shuffle is what makes it a puzzle,
 * and solution pages are added automatically.
 *
 * The theme picker is the same one the cryptogram and the crossword use, so a
 * book can put three games on one theme; its first option rotates the theme
 * per page, which is what a book wants, because twelve pages of "Gardening" is
 * twelve pages of the same vocabulary.
 */
export const FALLEN_PHRASE_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Theme',
    type: 'select',
    default: RETIREMENT_THEME_MIXED,
    options: retirementThemeSelectOptions(),
    helpWhen: (config) =>
      parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
        ? 'A different retirement theme each page — the right pick for a whole book.'
        : 'A fresh saying is written for this theme every time.',
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
    default: DEFAULT_FALLEN_PHRASE_LEVEL_ID,
    options: FALLEN_PHRASE_LEVEL_OPTIONS,
    helpWhen: (config, layout) =>
      fallenPhrasePrintNote({
        level: parseFallenPhraseLevel(config),
        page: layout,
        config,
        instruction: instructionFor(config),
      }),
  },
]

export function validateFallenPhraseConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  return validateRetirementThemeChoice(config)
}
