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
import {
  DEFAULT_QC_DETAIL,
  QC_DETAILS,
  QC_PATTERNS,
  QC_TONES,
  parseQcDetail,
  parseQcPattern,
} from './content'
import { qcPrintNote } from './layout'

/**
 * Four questions, each with a default that makes a good book on its own:
 * what the sayings are about, their mood, what the pattern is made of, and
 * how big its spaces are.
 *
 * What the form deliberately does not ask:
 *
 * *The saying itself* — every page gets a fresh, original one, written and
 * checked for originality before it can print. A typed quote is exactly how
 * a famous line or a lyric ends up in a KDP book.
 *
 * *Font, letter size, line breaks* — the page letters the saying in one of
 * its print-proven faces, as big as the space allows and never below the
 * size at which every letter is colorable, breaking lines between words for
 * balance. A size picked by hand is either too small to color or too big to
 * fit.
 *
 * *Frame, cartouche, layout, line weights, margins* — these are the design.
 * Each page deals its own, different from the page before, and every line is
 * heavy enough for print and inside the safe area.
 */
export const QC_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Theme',
    type: 'select',
    default: RETIREMENT_THEME_MIXED,
    options: retirementThemeSelectOptions('Mixed retirement topics'),
    helpWhen: (config) =>
      parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
        ? 'Slow mornings, gardens, travel, hobbies, friends and more — a different topic for every saying.'
        : 'Every saying explores this theme, each from a different angle.',
  },
  {
    key: 'customTheme',
    label: 'Your theme',
    type: 'text',
    default: '',
    max: AI_THEME_MAX_LENGTH,
    visibleWhen: isCustomRetirementTheme,
    help: `What the sayings should be about — for example, life by the sea. Max ${AI_THEME_MAX_LENGTH} characters.`,
    warningWhen: (config) => themeIpWarning(String(config.customTheme ?? '')),
  },
  {
    key: 'tone',
    label: 'Mood',
    type: 'select',
    default: 'mixed',
    options: QC_TONES.map((tone) => ({ label: tone.label, value: tone.value })),
    help: 'Every saying is original, warm and written for this page — never a famous quote.',
  },
  {
    key: 'pattern',
    label: 'Pattern',
    type: 'select',
    default: 'mix',
    options: QC_PATTERNS.map((p) => ({ label: p.label, value: p.value })),
    helpWhen: (config) => {
      const choice = QC_PATTERNS.find((p) => p.value === parseQcPattern(config.pattern))!
      return `${choice.examples.charAt(0).toUpperCase()}${choice.examples.slice(1)}. Each page gets its own layout and border.`
    },
  },
  {
    key: 'detail',
    label: 'Coloring spaces',
    type: 'select',
    default: DEFAULT_QC_DETAIL,
    options: QC_DETAILS.map((d) => ({ label: d.label, value: d.value })),
    helpWhen: (config, layout) => qcPrintNote({ page: layout, config, detail: parseQcDetail(config.detail) }),
  },
]

export function validateQcConfig(config: StudioConfig): StudioConfigValidationError | null {
  return validateRetirementThemeChoice(config, 'sayings')
}
