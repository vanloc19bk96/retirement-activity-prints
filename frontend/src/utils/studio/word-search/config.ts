export {
  AI_THEME_MAX_LENGTH,
  DEFAULT_THEME as WORD_SEARCH_DEFAULT_AI_THEME,
  MAX_WORD_LETTERS,
  MIN_WORD_LETTERS,
  difficultyPreset,
  filterWordPool,
  hasCustomWords,
  parseDifficulty,
  parsePrintStyle,
  parseShape,
  parseTheme,
  parseTone,
} from '../retirement-word-search/content'
export {
  WORD_SEARCH_CONFIG_SCHEMA,
  validateRetirementWordSearchConfig as validateWordSearchConfig,
} from '../retirement-word-search/config'
export type { WordSearchShape } from '../retirement-word-search/content'
export type {
  StudioWordSearchDifficulty,
  WordSearchPrintStyle,
  WordSearchTone,
} from '@/types/studio-word-search.types'

import {
  difficultyPreset,
  parseDifficulty,
  parsePrintStyle,
} from '../retirement-word-search/content'

/** Compatibility helpers retained for older imports. */
export function parseGridSize(_raw?: unknown): number {
  return difficultyPreset('medium', 'large-print').gridSize
}

export function parseWordCount(_raw?: unknown): number {
  return difficultyPreset('medium', 'large-print').listedWords
}

export function presetFromConfig(config: Record<string, unknown>) {
  return difficultyPreset(
    parseDifficulty(config.difficulty),
    parsePrintStyle(config.printStyle),
  )
}
