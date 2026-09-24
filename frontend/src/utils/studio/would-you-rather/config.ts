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
import { WYR_STYLES, wyrInstruction } from './content'
import { wyrPrintNote } from './layout'

/** True when the seller asked for a "Why?" writing line under each question. */
export const wantsReasonLine = (config: StudioConfig) => config.reasonLine === true

/** Instruction text the page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  return config.showInstructions === false ? '' : wyrInstruction(wantsReasonLine(config))
}

/**
 * Three questions: what about, in what spirit, and whether to write.
 *
 * What the form deliberately does not ask:
 *
 * *Questions per page, type size, stacked or side by side* — all fall out of
 * the trim. A seller setting them by hand gets small type or a choice through
 * its box. The theme's help line reports what the page chose.
 *
 * *Difficulty, audience, number of choices* — a Would You Rather question is
 * always two choices, written for grown-ups, and the audience is the book's.
 *
 * *An answer page* — there is no right answer to print.
 *
 * The theme picker is the one every AI game shares, so a book can run several
 * games on one theme. Its first option here mixes topics within the page,
 * which is what a conversation book wants: four questions about gardening in a
 * row is a quiz, not a conversation.
 */
export const WYR_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Theme',
    type: 'select',
    default: RETIREMENT_THEME_MIXED,
    options: retirementThemeSelectOptions('Mixed retirement topics'),
    helpWhen: (config, layout) => {
      const theme =
        parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
          ? 'Travel, hobbies, family, free time and more, mixed on every page.'
          : 'Every question on the page explores this theme.'
      const note = wyrPrintNote({
        page: layout,
        config,
        instruction: instructionFor(config),
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
        reasonLine: wantsReasonLine(config),
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
    help: `What the questions should be about — for example, summers at the lake. Max ${AI_THEME_MAX_LENGTH} characters.`,
    warningWhen: (config) => themeIpWarning(String(config.customTheme ?? '')),
  },
  {
    key: 'tone',
    label: 'Tone',
    type: 'select',
    default: 'balanced',
    options: WYR_STYLES.map((style) => ({ label: style.label, value: style.value })),
    help: 'Always friendly and respectful. Fresh questions are written for every page.',
  },
  {
    key: 'reasonLine',
    label: 'Add a “Why?” line',
    type: 'toggle',
    default: false,
    help: 'A writing line under each question, for journals and keepsake books. Fewer questions fit on a page.',
  },
]

export function validateWyrConfig(config: StudioConfig): StudioConfigValidationError | null {
  return validateRetirementThemeChoice(config, 'questions')
}
