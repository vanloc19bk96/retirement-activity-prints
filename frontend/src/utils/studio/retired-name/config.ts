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
import { RN_INSTRUCTION } from './content'
import { rnPrintNote } from './layout'

/** Instruction text the page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  return config.showInstructions === false ? '' : RN_INSTRUCTION
}

/**
 * One question: what the names are about.
 *
 * What the form deliberately does not ask:
 *
 * *Type size, columns, full or short month names, whether the example and
 * write-in line fit* — all fall out of the trim. A seller setting them by hand
 * gets small type or a table off the page. The theme's help line reports what
 * the page chose.
 *
 * *Tone* — a retired name is a joke by construction; "serious" is not a
 * setting anyone wants, and every name is already held to warm and kind.
 *
 * *How many names* — 26 letters and 12 months is the game.
 *
 * The theme picker is the one every AI game shares, so a book can run several
 * games on one theme. A theme shapes the last names ("Fairway Wanderer" for a
 * golf book); first names stay general so they suit anyone.
 */
export const RN_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Theme',
    type: 'select',
    default: RETIREMENT_THEME_MIXED,
    options: retirementThemeSelectOptions('Mixed retirement pastimes'),
    helpWhen: (config, layout) => {
      const theme =
        parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
          ? 'Last names draw on naps, golf, cruises, gardens and more.'
          : 'Every last name comes from this theme; first names suit anyone.'
      const note = rnPrintNote({
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
    help: `What the names should be about — for example, summers at the lake. Max ${AI_THEME_MAX_LENGTH} characters.`,
    warningWhen: (config) => themeIpWarning(String(config.customTheme ?? '')),
  },
]

export function validateRnConfig(config: StudioConfig): StudioConfigValidationError | null {
  return validateRetirementThemeChoice(config, 'names')
}
