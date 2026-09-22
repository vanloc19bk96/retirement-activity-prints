import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import { themeIpWarning } from '../crossword/content-quality'
import { allThemeSelectOptions, defaultThemeId, getRetirementTheme } from './retirement-themes'
import {
  AI_THEME_MAX_LENGTH,
  DEFAULT_DIFFICULTY,
  DEFAULT_PRINT_STYLE,
  DEFAULT_THEME,
  DEFAULT_WORDS_FROM,
  difficultyPreset,
  filterWordPool,
  parseDifficulty,
  parsePrintStyle,
  parseTheme,
  parseWordsFrom,
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
    key: 'wordsFrom',
    label: 'Words from',
    type: 'select',
    default: DEFAULT_WORDS_FROM,
    options: [
      { label: 'A theme', value: 'theme' },
      { label: 'AI theme', value: 'ai-theme' },
      { label: 'Your own words', value: 'own-words' },
    ],
    help: 'Pick a ready-made retirement theme, describe your own theme for AI, or type your own word list.',
  },
  {
    key: 'presetThemeId',
    label: 'Theme',
    type: 'select',
    default: defaultThemeId('retirement-life'),
    options: allThemeSelectOptions(),
    visibleWhen: (config) => parseWordsFrom(config.wordsFrom) === 'theme',
    help: 'AI invents fresh retirement words and short phrases for this theme.',
  },
  {
    key: 'theme',
    label: 'Your theme',
    type: 'text',
    default: DEFAULT_THEME,
    max: AI_THEME_MAX_LENGTH,
    visibleWhen: (config) => parseWordsFrom(config.wordsFrom) === 'ai-theme',
    help: `What the word list is about (e.g. Life after work). Max ${AI_THEME_MAX_LENGTH} characters.`,
    warningWhen: (config) => themeIpWarning(String(config.theme ?? '')),
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
    key: 'customWords',
    label: 'Your words',
    type: 'wordList',
    default: [],
    placeholder: 'One word or short phrase per line',
    visibleWhen: (config) => parseWordsFrom(config.wordsFrom) === 'own-words',
    helpWhen: (config) => {
      const preset = difficultyPreset(
        parseDifficulty(config.difficulty),
        parsePrintStyle(config.printStyle),
      )
      return `Entries use 3–${Math.min(11, preset.gridSize)} letters after spaces and punctuation are removed.`
    },
  },
]

export function validateRetirementWordSearchConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  const wordsFrom = parseWordsFrom(config.wordsFrom)
  const difficulty = parseDifficulty(config.difficulty)
  const printStyle = parsePrintStyle(config.printStyle)

  if (wordsFrom === 'own-words') {
    const preset = difficultyPreset(difficulty, printStyle)
    const entries = filterWordPool(config.customWords, preset.gridSize)
    if (entries.length < 3) {
      return {
        field: 'customWords',
        message: `Enter at least 3 safe, distinct words (3–${Math.min(11, preset.gridSize)} letters).`,
      }
    }
    return null
  }

  if (wordsFrom === 'ai-theme') {
    const theme = parseTheme(config.theme)
    if (!theme) {
      return { field: 'theme', message: 'Enter a theme for the word list.' }
    }
    if (String(config.theme ?? '').trim().length > AI_THEME_MAX_LENGTH) {
      return {
        field: 'theme',
        message: `Keep the theme under ${AI_THEME_MAX_LENGTH} characters.`,
      }
    }
    return null
  }

  if (!getRetirementTheme(resolveWordSearchPresetThemeId(config))) {
    return { field: 'presetThemeId', message: 'Choose a retirement theme.' }
  }
  return null
}

/** Preset theme id, ignoring category (word search shows one flat theme list). */
export function resolveWordSearchPresetThemeId(config: StudioConfig): string {
  const raw = String(config.presetThemeId ?? '').trim()
  return getRetirementTheme(raw) ? raw : defaultThemeId('retirement-life')
}

/** Resolves the plain-text theme sent to the AI, based on `wordsFrom`. */
export function resolveWordSearchTheme(config: StudioConfig): string {
  const wordsFrom = parseWordsFrom(config.wordsFrom)
  if (wordsFrom === 'ai-theme') return parseTheme(config.theme)
  return getRetirementTheme(resolveWordSearchPresetThemeId(config))?.label ?? DEFAULT_THEME
}
