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
import { rqInstruction } from './content'
import { rqPrintNote } from './layout'

/** Instruction text the first quiz page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  return config.showInstructions === false ? '' : rqInstruction()
}

/**
 * One question: what the quiz is about.
 *
 * What the form deliberately does not ask:
 *
 * *Question count, questions per page, type size* — all fall out of the trim.
 * The quiz asks eight to ten questions, as many as fill its last page, at the
 * largest type that does not add a page. A seller setting these by hand gets
 * small type or a quiz that ends on a near-empty page. The theme's help line
 * reports what the page chose.
 *
 * *The four styles, the scoring method, tie handling* — they are the game. The
 * scoring grid and the tie rule work in pencil on any trim; an option could
 * only make one of them harder to follow.
 *
 * *A results page toggle* — without it the quiz has no ending.
 *
 * *Tone* — every quiz is warm and lightly funny; the style check keeps every
 * answer equally appealing, which a "sillier" setting would only strain.
 *
 * The theme picker is the one every AI game shares, so a book can run several
 * games on one theme. Its first option gives every question its own
 * retirement topic, which is what a personality quiz wants: ten questions on
 * one subject start to ask the same thing twice.
 */
export const RQ_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Theme',
    type: 'select',
    default: RETIREMENT_THEME_MIXED,
    options: retirementThemeSelectOptions('Mixed retirement topics'),
    helpWhen: (config, layout) => {
      const theme =
        parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
          ? 'Free days, hobbies, travel, friends, quiet time and more, a different topic for every question.'
          : 'Every question explores a different corner of this theme.'
      const note = rqPrintNote({
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
    help: `What the questions should be about — for example, life by the sea. Max ${AI_THEME_MAX_LENGTH} characters.`,
    warningWhen: (config) => themeIpWarning(String(config.customTheme ?? '')),
  },
]

export function validateRqConfig(config: StudioConfig): StudioConfigValidationError | null {
  return validateRetirementThemeChoice(config, 'questions')
}
