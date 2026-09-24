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
import { fifPrintNote } from './layout'

/**
 * One question: what should the story be about?
 *
 * What the form deliberately does not ask:
 *
 * *Story length, number of blanks, which kinds of word* — a story is only
 * funny when its blanks sit on the punchlines, which is the writer's job, and
 * the budget is what the trim holds in large print. A seller choosing "15
 * blanks" gets small type or a story that is all blanks.
 *
 * *Type size, columns, blank width, one story page or two* — all fall out of
 * the trim. The theme's help line reports what the activity chose.
 *
 * *Tone* — there is one: playful, warm and respectful. A "cheeky" setting is
 * how a retirement book ends up with a joke about its reader.
 *
 * *An answer page* — every finished story is the right one.
 *
 * The theme picker is the one every AI game shares, so a book can run several
 * games on one theme. Its first option lets every story pick its own
 * retirement situation — the party, a chaotic cruise, a new hobby — which is
 * what a book of several stories wants.
 */
export const FIF_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Story theme',
    type: 'select',
    default: RETIREMENT_THEME_MIXED,
    options: retirementThemeSelectOptions('Surprise me (mixed retirement stories)'),
    helpWhen: (config, layout) => {
      const theme =
        parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
          ? 'Speeches, parties, holidays, hobbies and more — a fresh situation every story.'
          : 'The story is set in this theme.'
      const note = fifPrintNote({
        page: layout,
        config,
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
    help: `What the story should be about — for example, our first caravan trip. Max ${AI_THEME_MAX_LENGTH} characters.`,
    warningWhen: (config) => themeIpWarning(String(config.customTheme ?? '')),
  },
]

export function validateFifConfig(config: StudioConfig): StudioConfigValidationError | null {
  return validateRetirementThemeChoice(config, 'story')
}
