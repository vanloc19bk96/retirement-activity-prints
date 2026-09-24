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
import { EON_STYLES, eonInstruction } from './content'
import { eonPrintNote } from './layout'

/** True when the seller asked for a story line under each statement. */
export const wantsStoryLine = (config: StudioConfig) => config.storyLine === true

/** Instruction text the page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  return config.showInstructions === false ? '' : eonInstruction(wantsStoryLine(config))
}

/**
 * Three questions: what about, in what spirit, and whether to write.
 *
 * What the form deliberately does not ask:
 *
 * *Statements per page, type size, answers beside or under the statement* —
 * all fall out of the trim. A seller setting them by hand gets small type or a
 * statement through its row. The theme's help line reports what the page chose.
 *
 * *Answer labels, checkbox style, numbering* — "Ever" and "Never" with a plain
 * square box is the game; anything else is a setting nobody needs.
 *
 * *An answer page* — there is no right answer to print, only the reader's.
 *
 * The theme picker is the one every AI game shares, so a book can run several
 * games on one theme. Its first option mixes topics within the page, which is
 * what a party book wants: ten statements about gardening in a row is a quiz,
 * not a conversation.
 */
export const EON_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Theme',
    type: 'select',
    default: RETIREMENT_THEME_MIXED,
    options: retirementThemeSelectOptions('Mixed retirement topics'),
    helpWhen: (config, layout) => {
      const theme =
        parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
          ? 'Naps, free weekdays, hobbies, travel, family and more, mixed on every page.'
          : 'Every statement on the page explores this theme.'
      const note = eonPrintNote({
        page: layout,
        config,
        instruction: instructionFor(config),
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
        storyLine: wantsStoryLine(config),
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
    help: `What the statements should be about — for example, summers at the lake. Max ${AI_THEME_MAX_LENGTH} characters.`,
    warningWhen: (config) => themeIpWarning(String(config.customTheme ?? '')),
  },
  {
    key: 'tone',
    label: 'Tone',
    type: 'select',
    default: 'balanced',
    options: EON_STYLES.map((style) => ({ label: style.label, value: style.value })),
    help: 'Always friendly and respectful. Fresh statements are written for every page.',
  },
  {
    key: 'storyLine',
    label: 'Add a story line',
    type: 'toggle',
    default: false,
    help: 'A writing line under each statement to jot down the story — great for keepsake books. Fewer statements fit on a page.',
  },
]

export function validateEonConfig(config: StudioConfig): StudioConfigValidationError | null {
  return validateRetirementThemeChoice(config, 'statements')
}
