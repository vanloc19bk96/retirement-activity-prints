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
import { themeIpWarning } from '../retirement-word-search/content-quality'
import { triviaPrintNote } from './layout'
import {
  DEFAULT_TRIVIA_LEVEL_ID,
  TRIVIA_LEVEL_OPTIONS,
  parseTriviaLevel,
  triviaInstruction,
} from './levels'

export { triviaInstruction as instructionFor }

/**
 * Two questions, and both are about the puzzle rather than the page.
 *
 * It is the same pair the plain word search asks, on purpose: a seller putting
 * both games in one book should not have to learn two forms, and the second
 * game's extra machinery — clue length, clue columns, how many clues a page
 * holds, how long an answer may be — are not things anyone can answer without
 * knowing the trim. They come from `layout.ts`, which can see it.
 *
 * What is deliberately absent is a clue-style or clue-count control. A trivia
 * page is only worth printing if every clue has one clear answer, and the lever
 * that governs that is the level: it sets how plainly the clues are written,
 * how long the answers run and which headings they hide in. Splitting it into
 * three knobs would let a seller set them against each other — obscure clues
 * with four-letter answers — and the page would have no honest way to refuse.
 *
 * The level's help line reports what those decisions produced on the page size
 * currently set in Settings, so nothing the form decided stays hidden.
 */
export const TRIVIA_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Theme',
    type: 'select',
    default: RETIREMENT_THEME_MIXED,
    options: retirementThemeSelectOptions(),
    helpWhen: (config) =>
      parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
        ? 'A different retirement theme each page — the right pick for a whole book.'
        : 'Fresh clues and answers are written for this theme every time.',
  },
  {
    key: 'customTheme',
    label: 'Your theme',
    type: 'text',
    default: '',
    max: AI_THEME_MAX_LENGTH,
    placeholder: 'e.g. Weekends in the garden',
    visibleWhen: isCustomRetirementTheme,
    help: `What the clues should be about. Max ${AI_THEME_MAX_LENGTH} characters.`,
    warningWhen: (config) => themeIpWarning(String(config.customTheme ?? '')),
  },
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_TRIVIA_LEVEL_ID,
    options: TRIVIA_LEVEL_OPTIONS,
    helpWhen: (config, layout) =>
      triviaPrintNote(
        parseTriviaLevel(config),
        layout,
        config,
        triviaInstruction(config),
      ),
  },
]

export function validateTriviaConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  return validateRetirementThemeChoice(config, 'clues')
}
