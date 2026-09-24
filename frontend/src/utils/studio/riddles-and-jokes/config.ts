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
import { RJ_MIXES, parseRjMix, rjInstruction } from './content'
import { rjPrintNote } from './layout'

/** Instruction text the page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  return config.showInstructions === false ? '' : rjInstruction(parseRjMix(config.mix))
}

/**
 * Two questions: what about, and riddles, jokes or both.
 *
 * What the form deliberately does not ask:
 *
 * *Items per page, type size* — both fall out of the trim and the length of
 * the questions. A seller setting them by hand gets small type or a question
 * through the item below it. The theme's help line reports what the page chose.
 *
 * *Where the answers go* — every page gets an answer page, placed after the
 * game or at the back of the book by the book's own solutions setting, like
 * every other game with a key. Answers printed upside down under each item
 * would halve what a large-print page holds and put every punchline one turn
 * of the book away from the reader's eye.
 *
 * *Difficulty, humour style, checking* — every item is written to be clean,
 * warm and gettable, and checked by the service before it can print. There is
 * nothing to tune and nothing to switch off.
 *
 * The theme picker is the one every AI game shares, so a book can run several
 * games on one theme. Its first option gives every item its own retirement
 * topic, which is what a joke page wants: eight gardening jokes in a row is
 * one joke told eight times.
 */
export const RJ_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Theme',
    type: 'select',
    default: RETIREMENT_THEME_MIXED,
    options: retirementThemeSelectOptions('Mixed retirement topics'),
    helpWhen: (config, layout) => {
      const theme =
        parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
          ? 'Naps, golf, gardening, coffee, travel, retirement parties and more, a different topic for every item.'
          : 'Every item on the page explores this theme.'
      const note = rjPrintNote({
        page: layout,
        config,
        instruction: instructionFor(config),
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
        mix: parseRjMix(config.mix),
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
    help: `What the riddles and jokes should be about — for example, life on the allotment. Max ${AI_THEME_MAX_LENGTH} characters.`,
    warningWhen: (config) => themeIpWarning(String(config.customTheme ?? '')),
  },
  {
    key: 'mix',
    label: 'Mix',
    type: 'select',
    default: 'both',
    options: RJ_MIXES.map((mix) => ({ label: mix.label, value: mix.value })),
    help: 'Always clean and respectful. Fresh, original items are written and checked for every page.',
  },
]

export function validateRjConfig(config: StudioConfig): StudioConfigValidationError | null {
  return validateRetirementThemeChoice(config, 'riddles and jokes')
}
