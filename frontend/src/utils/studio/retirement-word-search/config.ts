import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import { themeIpWarning } from '../crossword/content-quality'
import {
  AI_THEME_MAX_LENGTH,
  DEFAULT_DIFFICULTY,
  DEFAULT_PRINT_STYLE,
  DEFAULT_SHAPE,
  DEFAULT_THEME,
  DEFAULT_TONE,
  difficultyPreset,
  filterWordPool,
  hasCustomWords,
  parseDifficulty,
  parsePrintStyle,
  parseShape,
  parseTheme,
} from './content'

export type { WordSearchShape } from './content'
export type { WordSearchPrintStyle as RetirementPrintStyle } from '@/types/studio-word-search.types'

export function wordBankColumnCount(wordCount: number): number {
  if (wordCount <= 8) return 2
  if (wordCount <= 14) return 3
  return 4
}

/** @deprecated Word counts now come from the difficulty/print preset. */
export function parseWordCount(
  _raw: unknown,
  difficulty: 'easy' | 'medium' | 'hard' | 'relaxed' | 'classic' | 'challenge' = 'medium',
  _gridSize?: number,
): number {
  const current =
    difficulty === 'relaxed' ? 'easy' : difficulty === 'challenge' ? 'hard' : difficulty === 'classic' ? 'medium' : difficulty
  return difficultyPreset(current, 'large-print').listedWords
}

export const WORD_SEARCH_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Theme',
    type: 'text',
    default: DEFAULT_THEME,
    max: AI_THEME_MAX_LENGTH,
    help: `What the word list is about (e.g. Life after work). Max ${AI_THEME_MAX_LENGTH} characters.`,
    warningWhen: (config) => themeIpWarning(String(config.theme ?? '')),
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
    default: DEFAULT_PRINT_STYLE,
    options: [
      { label: 'Large print (default)', value: 'large-print' },
      { label: 'Standard', value: 'standard' },
    ],
    help: 'Large print uses a smaller grid and fewer words so letters stay KDP-readable.',
  },
  {
    key: 'shape',
    label: 'Puzzle shape',
    type: 'select',
    default: DEFAULT_SHAPE,
    options: [
      { label: 'Square', value: 'square' },
      { label: 'Circle', value: 'circle' },
      { label: 'Diamond', value: 'diamond' },
      { label: 'Heart', value: 'heart' },
    ],
  },
  {
    key: 'customWords',
    label: 'Custom words (optional)',
    type: 'wordList',
    default: [],
    placeholder: 'One word or short phrase per line',
    helpWhen: (config) => {
      const preset = difficultyPreset(
        parseDifficulty(config.difficulty),
        parsePrintStyle(config.printStyle),
      )
      return `Leave blank for AI. Entries use 3–${Math.min(11, preset.gridSize)} letters after spaces and punctuation are removed.`
    },
  },
]

export function validateRetirementWordSearchConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  const theme = parseTheme(config.theme)
  if (!hasCustomWords(config.customWords) && !theme) {
    return { field: 'theme', message: 'Enter a theme for the word list.' }
  }
  if (String(config.theme ?? '').trim().length > AI_THEME_MAX_LENGTH) {
    return {
      field: 'theme',
      message: `Keep the theme under ${AI_THEME_MAX_LENGTH} characters.`,
    }
  }

  const difficulty = parseDifficulty(config.difficulty)
  const printStyle = parsePrintStyle(config.printStyle)
  void parseShape(config.shape)
  if (hasCustomWords(config.customWords)) {
    const preset = difficultyPreset(difficulty, printStyle)
    const entries = filterWordPool(config.customWords, preset.gridSize)
    if (entries.length < 3) {
      return {
        field: 'customWords',
        message: `Enter at least 3 safe, distinct words (3–${Math.min(11, preset.gridSize)} letters).`,
      }
    }
  }
  return null
}
