import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import {
  AI_THEME_MAX_LENGTH,
  categorySelectOptions,
  parseWriteOwnTheme,
  themeSelectOptions,
  validateRetirementCrosswordConfig,
} from '../crossword/config'
import { themeIpWarning } from '../crossword/content-quality'
import { parseRetirementCategory } from '../retirement-word-search/retirement-themes'
import { DEFAULT_ITEM_COUNT, MAX_ITEM_COUNT, MIN_ITEM_COUNT } from './content'

export const MISSING_VOWELS_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'writeOwnTheme',
    label: 'Write my own theme',
    type: 'toggle',
    default: false,
    help: 'Off: pick a retirement category and theme. On: type any theme for AI.',
  },
  {
    key: 'retirementCategory',
    label: 'Category',
    type: 'select',
    default: 'retirement-life',
    options: categorySelectOptions(),
    visibleWhen: (c) => !parseWriteOwnTheme(c.writeOwnTheme),
  },
  {
    key: 'presetThemeId',
    label: 'Theme',
    type: 'select',
    default: 'life-after-work',
    options: themeSelectOptions('retirement-life'),
    optionsWhen: (c) =>
      themeSelectOptions(parseRetirementCategory(c.retirementCategory)),
    visibleWhen: (c) => !parseWriteOwnTheme(c.writeOwnTheme),
    help: 'AI invents fresh retirement words and short phrases for this theme.',
  },
  {
    key: 'customTheme',
    label: 'Custom retirement theme',
    type: 'text',
    default: '',
    max: AI_THEME_MAX_LENGTH,
    visibleWhen: (c) => parseWriteOwnTheme(c.writeOwnTheme),
    help: `Theme only — AI writes the words (e.g. Garden Days). Max ${AI_THEME_MAX_LENGTH} characters.`,
    warningWhen: (c) =>
      themeIpWarning(String(c.customTheme ?? c.customThemeText ?? '')),
  },
  {
    key: 'difficulty',
    label: 'Difficulty',
    type: 'select',
    default: 'classic',
    options: [
      { label: 'Relaxed (4–8 letters, mostly single words)', value: 'relaxed' },
      { label: 'Classic (5–10 letters)', value: 'classic' },
      { label: 'Challenge (6–14 letters, longer phrases)', value: 'challenge' },
    ],
  },
  {
    key: 'printStyle',
    label: 'Print style',
    type: 'select',
    default: 'large-print',
    options: [
      { label: 'Large print (default)', value: 'large-print' },
      { label: 'Standard', value: 'standard' },
    ],
    help: 'Large print keeps puzzle type at least 16 pt and prefers one column.',
  },
  {
    key: 'itemCount',
    label: 'Number of items',
    type: 'number',
    default: DEFAULT_ITEM_COUNT,
    min: MIN_ITEM_COUNT,
    max: MAX_ITEM_COUNT,
    step: 1,
  },
]

export function validateMissingVowelsConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  return validateRetirementCrosswordConfig(config)
}
