import {
  sanitizeWordEntries,
  type WordEntry,
} from '@/utils/puzzles/word-search-core'
import type {
  StudioWordSearchDifficulty,
  WordSearchPrintStyle,
  WordSearchResponse,
  WordSearchTone,
} from '@/types/studio-word-search.types'
import { isPalindrome, isUnsafeCopy } from '../hidden-message-word-search/content'

export type WordSearchShape = 'square' | 'circle' | 'diamond' | 'heart'
export type WordSearchWordsFrom = 'theme' | 'ai-theme' | 'own-words'

export const AI_THEME_MAX_LENGTH = 120
export const MIN_WORD_LETTERS = 3
export const MAX_WORD_LETTERS = 11
export const WORD_SEARCH_POOL_SIZE = 30
export const DEFAULT_THEME = 'Life after work'
export const DEFAULT_TONE: WordSearchTone = 'heartfelt'
export const DEFAULT_DIFFICULTY: StudioWordSearchDifficulty = 'medium'
export const DEFAULT_PRINT_STYLE: WordSearchPrintStyle = 'large-print'
export const DEFAULT_SHAPE: WordSearchShape = 'square'
export const DEFAULT_WORDS_FROM: WordSearchWordsFrom = 'theme'
export const WORD_SEARCH_DEFAULT_TITLE = 'Word Search'
export const WORD_SEARCH_INSTRUCTION = 'Find and circle every word in the list.'
export const WORD_SEARCH_BUILD_ERROR =
  'Could not build a word search. Try a broader theme or fewer custom words.'

const LARGE_PRINT_PRESETS: Record<
  StudioWordSearchDifficulty,
  { gridSize: number; listedWords: number }
> = {
  easy: { gridSize: 10, listedWords: 12 },
  medium: { gridSize: 12, listedWords: 14 },
  hard: { gridSize: 13, listedWords: 16 },
}

const STANDARD_PRESETS: Record<
  StudioWordSearchDifficulty,
  { gridSize: number; listedWords: number }
> = {
  easy: { gridSize: 12, listedWords: 18 },
  medium: { gridSize: 13, listedWords: 22 },
  hard: { gridSize: 15, listedWords: 28 },
}

export function parseTheme(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, AI_THEME_MAX_LENGTH)
}

export function parseTone(raw: unknown): WordSearchTone {
  const value = String(raw ?? DEFAULT_TONE)
  if (value === 'funny' || value === 'heartfelt' || value === 'classy' || value === 'sassy') {
    return value
  }
  return DEFAULT_TONE
}

export function parseDifficulty(raw: unknown): StudioWordSearchDifficulty {
  const value = String(raw ?? DEFAULT_DIFFICULTY)
  if (value === 'easy' || value === 'medium' || value === 'hard') return value
  return DEFAULT_DIFFICULTY
}

export function parsePrintStyle(raw: unknown): WordSearchPrintStyle {
  return raw === 'standard' ? 'standard' : DEFAULT_PRINT_STYLE
}

export function parseShape(raw: unknown): WordSearchShape {
  const value = String(raw ?? DEFAULT_SHAPE)
  if (value === 'circle' || value === 'diamond' || value === 'heart') return value
  return DEFAULT_SHAPE
}

export function parseWordsFrom(raw: unknown): WordSearchWordsFrom {
  const value = String(raw ?? DEFAULT_WORDS_FROM)
  if (value === 'ai-theme' || value === 'own-words') return value
  return DEFAULT_WORDS_FROM
}

export function difficultyPreset(
  difficulty: StudioWordSearchDifficulty,
  printStyle: WordSearchPrintStyle = DEFAULT_PRINT_STYLE,
): { gridSize: number; listedWords: number } {
  return printStyle === 'standard'
    ? STANDARD_PRESETS[difficulty]
    : LARGE_PRINT_PRESETS[difficulty]
}

export function hasCustomWords(raw: unknown): boolean {
  if (Array.isArray(raw)) return raw.some((word) => String(word).trim().length > 0)
  return String(raw ?? '').trim().length > 0
}

function dropContained(entries: WordEntry[]): WordEntry[] {
  const longestFirst = [...entries].sort(
    (a, b) => b.token.length - a.token.length || a.token.localeCompare(b.token),
  )
  const kept: WordEntry[] = []
  for (const entry of longestFirst) {
    if (kept.some((other) => other.token.includes(entry.token))) continue
    kept.push(entry)
  }
  return kept
}

/** Shared AI/custom normalization: display label + compact A-Z grid token. */
export function filterWordPool(raw: unknown, gridSize: number): WordEntry[] {
  const entries = sanitizeWordEntries(raw, {
    gridSize,
    minLetters: MIN_WORD_LETTERS,
    maxLetters: Math.min(MAX_WORD_LETTERS, gridSize),
  }).filter((entry) => !isPalindrome(entry.token) && !isUnsafeCopy(entry.display))
  return dropContained(entries)
}

/**
 * The API contract returns 30 candidates. Standard/hard asks for 28 words,
 * so the reserve is capped by that contract instead of making the preset
 * impossible to satisfy.
 */
export function minValidPoolSize(
  difficulty: StudioWordSearchDifficulty,
  printStyle: WordSearchPrintStyle = DEFAULT_PRINT_STYLE,
): number {
  return Math.min(
    WORD_SEARCH_POOL_SIZE,
    difficultyPreset(difficulty, printStyle).listedWords + 6,
  )
}

export function parseRemotePayload(raw: unknown): WordSearchResponse | null {
  if (!raw || typeof raw !== 'object') return null
  const words = (raw as { words?: unknown }).words
  if (!Array.isArray(words)) return null
  const strings = words.filter((word): word is string => typeof word === 'string')
  return strings.length > 0 ? { words: strings } : null
}

export function validatePayload(
  raw: unknown,
  difficulty: StudioWordSearchDifficulty,
  printStyle: WordSearchPrintStyle = DEFAULT_PRINT_STYLE,
): WordEntry[] | null {
  const parsed = parseRemotePayload(raw)
  if (!parsed) return null
  const preset = difficultyPreset(difficulty, printStyle)
  const entries = filterWordPool(parsed.words, preset.gridSize)
  return entries.length >= minValidPoolSize(difficulty, printStyle) ? entries : null
}
