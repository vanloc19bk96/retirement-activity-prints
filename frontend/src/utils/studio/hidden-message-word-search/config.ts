import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import { themeIpWarning } from '../crossword/content-quality'
import {
  AI_THEME_MAX_LENGTH,
  CUSTOM_MESSAGE_MAX_LENGTH,
  DEFAULT_THEME,
  DEFAULT_TONE,
  DEFAULT_DIFFICULTY,
  parseCustomMessage,
  parseDifficulty,
  parsePrintStyle,
  parseTheme,
  parseTone,
} from './content'

export const HIDDEN_MESSAGE_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Theme',
    type: 'text',
    default: DEFAULT_THEME,
    max: AI_THEME_MAX_LENGTH,
    help: `What the words and saying are about (e.g. Life after work). Max ${AI_THEME_MAX_LENGTH} characters.`,
    warningWhen: (c) => themeIpWarning(String(c.theme ?? '')),
  },
  {
    key: 'tone',
    label: 'Tone',
    type: 'select',
    default: DEFAULT_TONE,
    options: [
      { label: 'Funny', value: 'funny' },
      { label: 'Heartfelt', value: 'heartfelt' },
      { label: 'Classy', value: 'classy' },
      { label: 'Sassy', value: 'sassy' },
    ],
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
    label: 'Custom saying (optional)',
    type: 'text',
    default: '',
    max: CUSTOM_MESSAGE_MAX_LENGTH,
    help: 'Leave blank for AI to write the saying. If you type one, AI writes only the words. 15–35 letters, not counting spaces or punctuation.',
  },
]

export function validateHiddenMessageConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  const theme = parseTheme(config.theme)
  if (!theme) {
    return { field: 'theme', message: 'Enter a theme for the words and saying.' }
  }
  if (theme.length > AI_THEME_MAX_LENGTH) {
    return {
      field: 'theme',
      message: `Keep the theme under ${AI_THEME_MAX_LENGTH} characters.`,
    }
  }
  void parseTone(config.tone)
  void parseDifficulty(config.difficulty)
  void parsePrintStyle(config.printStyle)

  const rawCustom = String(config.customMessage ?? '').trim()
  if (!rawCustom) return null
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
