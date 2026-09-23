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
import { instructionFor, riddleScramblePrintNote } from './layout'
import {
  DEFAULT_RIDDLE_SCRAMBLE_LEVEL_ID,
  RIDDLE_SCRAMBLE_LEVEL_OPTIONS,
  parseRiddleScrambleLevel,
} from './levels'

export { instructionFor }

/**
 * Two questions, and both are about the puzzle rather than the page.
 *
 * What the form deliberately does not ask for is the interesting part. Not how
 * many words — that is the length of the riddle's answer, one word per letter,
 * and a form offering both could be answered inconsistently. Not the riddle
 * itself, because a seller typing one would then owe the page an answer whose
 * every letter their theme's vocabulary can supply, which is arithmetic nobody
 * bought this app to do. Not letter size, column count or slot width: those
 * come from the trim in Settings, and `layout.ts` reports what they produced.
 *
 * The theme picker is the same one the anagram and the crossword use, so a
 * book can put three games on one theme; its first option rotates the theme
 * per page, which is what a book wants, because twelve pages of "Gardening" is
 * twelve pages of the same vocabulary.
 */
export const RIDDLE_SCRAMBLE_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Theme',
    type: 'select',
    default: RETIREMENT_THEME_MIXED,
    options: retirementThemeSelectOptions(),
    helpWhen: (config) =>
      parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
        ? 'A different retirement theme each page — the right pick for a whole book.'
        : 'A fresh riddle and new words are written for this theme every time.',
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
    default: DEFAULT_RIDDLE_SCRAMBLE_LEVEL_ID,
    options: RIDDLE_SCRAMBLE_LEVEL_OPTIONS,
    helpWhen: (config, layout) =>
      riddleScramblePrintNote({
        level: parseRiddleScrambleLevel(config),
        page: layout,
        config,
        instruction: instructionFor(config),
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
      }),
  },
]

export function validateRiddleScrambleConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  return validateRetirementThemeChoice(config, 'riddle and words')
}
