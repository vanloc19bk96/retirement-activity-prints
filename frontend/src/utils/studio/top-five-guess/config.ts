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
import { topFiveInstruction } from './content'
import { topFivePrintNote } from './layout'

/** Instruction text the page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  return config.showInstructions === false ? '' : topFiveInstruction()
}

/**
 * One question: what the puzzles should be about.
 *
 * What the form deliberately does not ask:
 *
 * *Questions per page, line spacing, type sizes* — all fall out of the trim.
 * A seller setting them by hand gets either tiny type or a question through a
 * guess line. The theme's help line reports what the page chose.
 *
 * *Points* — the top answer is always worth 5, down to 1 for the fifth, and
 * every question totals 15. A per-book scoring setting only produces books
 * whose pages score differently from each other.
 *
 * *Difficulty* — the ladder is built into every question: the top answer is
 * the one almost everybody writes, the fifth is the one that takes thought.
 *
 * *An answer-page toggle* — the answer page is what makes the game scorable,
 * so it is always added.
 *
 * The theme picker is the one every AI game shares, so a book can run several
 * games on one theme; its first option rotates the theme per page.
 */
export const TOP_FIVE_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Theme',
    type: 'select',
    default: RETIREMENT_THEME_MIXED,
    options: retirementThemeSelectOptions(),
    helpWhen: (config, layout) => {
      const theme =
        parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
          ? 'A different retirement theme each page — the right pick for a whole book.'
          : 'Fresh questions are written for this theme every time.'
      const note = topFivePrintNote({
        page: layout,
        config,
        instruction: instructionFor(config),
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
      })
      return `${theme} ${note}`
    },
  },
  {
    key: 'customTheme',
    label: 'Your theme',
    type: 'text',
    default: '',
    max: AI_THEME_MAX_LENGTH,
    visibleWhen: isCustomRetirementTheme,
    help: `What the questions should be about — for example, weekends at the lake. Max ${AI_THEME_MAX_LENGTH} characters.`,
    warningWhen: (config) => themeIpWarning(String(config.customTheme ?? '')),
  },
]

export function validateTopFiveConfig(config: StudioConfig): StudioConfigValidationError | null {
  return validateRetirementThemeChoice(config, 'questions')
}
