import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import { themeIpWarning } from '../crossword/content-quality'
import {
  allThemeSelectOptions,
  defaultThemeId,
  getRetirementTheme,
} from '../retirement-word-search/retirement-themes'
import {
  AI_THEME_MAX_LENGTH,
  CUSTOM_MESSAGE_MAX_LENGTH,
  DEFAULT_THEME,
  DEFAULT_DIFFICULTY,
  DEFAULT_WORDS_FROM,
  parseCustomMessage,
  parseDifficulty,
  parsePrintStyle,
  parseTheme,
  parseWordsFrom,
} from './content'

export const HIDDEN_MESSAGE_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'wordsFrom',
    label: 'Words from',
    type: 'select',
    default: DEFAULT_WORDS_FROM,
    options: [
      { label: 'A theme', value: 'theme' },
      { label: 'AI theme', value: 'ai-theme' },
      { label: 'Custom saying', value: 'custom-saying' },
    ],
    help: 'Pick a ready-made retirement theme, describe your own theme for AI, or write your own secret saying.',
  },
  {
    key: 'presetThemeId',
    label: 'Theme',
    type: 'select',
    default: defaultThemeId('retirement-life'),
    options: allThemeSelectOptions(),
    visibleWhen: (config) => parseWordsFrom(config.wordsFrom) === 'theme',
    help: 'AI invents fresh retirement words and a saying for this theme.',
  },
  {
    key: 'theme',
    label: 'Your theme',
    type: 'text',
    default: DEFAULT_THEME,
    max: AI_THEME_MAX_LENGTH,
    visibleWhen: (config) => parseWordsFrom(config.wordsFrom) === 'ai-theme',
    help: `What the words and saying are about (e.g. Life after work). Max ${AI_THEME_MAX_LENGTH} characters.`,
    warningWhen: (c) => themeIpWarning(String(c.theme ?? '')),
  },
  {
    key: 'difficulty',
    label: 'Difficulty',
    type: 'select',
    default: DEFAULT_DIFFICULTY,
    options: [
      { label: 'Easy (across and down)', value: 'easy' },
      { label: 'Medium (plus diagonal)', value: 'medium' },
      { label: 'Hard (all directions)', value: 'hard' },
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
    help: 'Large print uses a smaller grid and fewer words so letters stay KDP-readable (14 pt+).',
  },
  {
    key: 'customMessage',
    label: 'Your secret saying',
    type: 'text',
    default: '',
    max: CUSTOM_MESSAGE_MAX_LENGTH,
    visibleWhen: (config) => parseWordsFrom(config.wordsFrom) === 'custom-saying',
    help: 'The grid words are generated for you — just type the saying to hide. 15–35 letters, not counting spaces or punctuation.',
  },
]

export function validateHiddenMessageConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  const wordsFrom = parseWordsFrom(config.wordsFrom)
  void parseDifficulty(config.difficulty)
  void parsePrintStyle(config.printStyle)

  if (wordsFrom === 'custom-saying') {
    const rawCustom = String(config.customMessage ?? '').trim()
    if (!rawCustom) {
      return { field: 'customMessage', message: 'Enter your secret saying.' }
    }
    if (rawCustom.length > CUSTOM_MESSAGE_MAX_LENGTH) {
      return {
        field: 'customMessage',
        message: `Keep the saying under ${CUSTOM_MESSAGE_MAX_LENGTH} characters.`,
      }
    }
    if (!parseCustomMessage(rawCustom)) {
      return {
        field: 'customMessage',
        message: 'The secret saying must be 15–35 letters (not counting spaces or punctuation).',
      }
    }
    return null
  }

  if (wordsFrom === 'ai-theme') {
    const theme = parseTheme(config.theme)
    if (!theme) {
      return { field: 'theme', message: 'Enter a theme for the words and saying.' }
    }
    if (String(config.theme ?? '').trim().length > AI_THEME_MAX_LENGTH) {
      return {
        field: 'theme',
        message: `Keep the theme under ${AI_THEME_MAX_LENGTH} characters.`,
      }
    }
    return null
  }

  if (!getRetirementTheme(resolveHiddenMessagePresetThemeId(config))) {
    return { field: 'presetThemeId', message: 'Choose a retirement theme.' }
  }
  return null
}

/** Preset theme id, defaulting to the first retirement-life theme when unset/unknown. */
export function resolveHiddenMessagePresetThemeId(config: StudioConfig): string {
  const raw = String(config.presetThemeId ?? '').trim()
  return getRetirementTheme(raw) ? raw : defaultThemeId('retirement-life')
}

/** Resolves the plain-text theme sent to the AI, based on `wordsFrom`. */
export function resolveHiddenMessageTheme(config: StudioConfig): string {
  const wordsFrom = parseWordsFrom(config.wordsFrom)
  if (wordsFrom === 'ai-theme') return parseTheme(config.theme)
  if (wordsFrom === 'custom-saying') return DEFAULT_THEME
  return getRetirementTheme(resolveHiddenMessagePresetThemeId(config))?.label ?? DEFAULT_THEME
}
