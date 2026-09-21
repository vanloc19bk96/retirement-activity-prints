export {
  AI_THEME_MAX_LENGTH,
  MAX_GRID,
  MAX_WORDS,
  MIN_GRID,
  MIN_WORD_LETTERS,
  MIN_WORDS,
  RETIREMENT_DEFAULT_AI_THEME as WORD_SEARCH_DEFAULT_AI_THEME,
  aiThemeLabel,
  parsePrintStyle,
  parseRetirementDifficulty,
  parseSource,
  toEngineDifficulty,
  validateRetirementWordSearchConfig as validateWordSearchConfig,
} from '../retirement-word-search/config'
export type {
  RetirementWordSearchSource as WordSearchSource,
  RetirementDifficulty,
  RetirementPrintStyle,
} from '../retirement-word-search/config'

import {
  parseGridSize as parseGridSizeFull,
  parsePrintStyle,
  parseRetirementDifficulty,
  parseWordCount as parseWordCountFull,
  toEngineDifficulty,
} from '../retirement-word-search/config'

/** Back-compat: single-arg parsers used by older helpers. */
export function parseGridSize(raw: unknown): number {
  return parseGridSizeFull(raw, parseRetirementDifficulty('classic'), parsePrintStyle('large-print'))
}

export function parseWordCount(raw: unknown): number {
  return parseWordCountFull(raw, parseRetirementDifficulty('classic'), parseGridSize(12))
}

export function parseDifficulty(raw: unknown) {
  return toEngineDifficulty(parseRetirementDifficulty(raw))
}
