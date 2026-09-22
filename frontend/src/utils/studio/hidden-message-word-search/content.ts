import {
  sanitizeWordEntries,
  type WordEntry,
} from '@/utils/puzzles/word-search-core'
import { hasMedicalClaim, hasTrademarkHint } from '../retirement-word-search/content-quality'
import type { RetirementPrintStyle } from '../_shared/retirement-theme-config'
import type {
  HiddenMessageDifficulty,
  HiddenMessageTone,
  HiddenMessageResponse,
} from '@/types/studio-hidden-message.types'

export type { RetirementPrintStyle }

export const AI_THEME_MAX_LENGTH = 120
export const CUSTOM_MESSAGE_MAX_LENGTH = 80
export const MIN_MESSAGE_LETTERS = 15
export const MAX_MESSAGE_LETTERS = 35
export const MIN_WORD_LETTERS = 3
export const MAX_WORD_LETTERS = 11
export const POOL_SIZE = 40
export const DEFAULT_THEME = 'Life after work'
export const DEFAULT_TONE: HiddenMessageTone = 'heartfelt'
export const DEFAULT_DIFFICULTY: HiddenMessageDifficulty = 'medium'

export type HiddenMessageWordsFrom = 'theme' | 'ai-theme' | 'custom-saying'
export const DEFAULT_WORDS_FROM: HiddenMessageWordsFrom = 'theme'

export const HIDDEN_MESSAGE_DEFAULT_TITLE = 'Hidden Message Word Search'
export const HIDDEN_MESSAGE_INSTRUCTION =
  'Find every word in the list. The letters left over, read from left to right, reveal a secret retirement saying.'
export const HIDDEN_MESSAGE_AI_EMPTY_MESSAGE =
  'Could not build a hidden-message word search. Try a broader theme, a different tone, or a shorter saying.'

const FINANCE_ADVICE_PATTERNS: readonly RegExp[] = [
  /\bguaranteed\s+(return|income|profit)/i,
  /\binvest\s+now\b/i,
  /\bget[\s-]?rich\b/i,
  /\bcrypto/i,
  /\bbitcoin\b/i,
  /\bday[\s-]?trad/i,
  /\bpenny\s+stock/i,
  /\bno[\s-]?risk\s+invest/i,
]

/** Dense pack — used when print style is standard. */
const STANDARD_PRESETS: Record<
  HiddenMessageDifficulty,
  { gridSize: number; listedWords: number }
> = {
  easy: { gridSize: 12, listedWords: 18 },
  medium: { gridSize: 13, listedWords: 22 },
  hard: { gridSize: 15, listedWords: 28 },
}

/**
 * KDP large-print retirement default: fewer / smaller grids so cell letters
 * and the word bank stay at senior-readable sizes (same idea as Word Search).
 */
const LARGE_PRINT_PRESETS: Record<
  HiddenMessageDifficulty,
  { gridSize: number; listedWords: number }
> = {
  easy: { gridSize: 10, listedWords: 12 },
  medium: { gridSize: 12, listedWords: 14 },
  hard: { gridSize: 13, listedWords: 16 },
}

/** @deprecated Prefer difficultyPreset(difficulty, printStyle). Defaults to large-print. */
export const DIFFICULTY_PRESETS = LARGE_PRINT_PRESETS

export function parsePrintStyle(raw: unknown): RetirementPrintStyle {
  return raw === 'standard' ? 'standard' : 'large-print'
}

export function difficultyPreset(
  difficulty: HiddenMessageDifficulty,
  printStyle: RetirementPrintStyle = 'large-print',
): { gridSize: number; listedWords: number } {
  return printStyle === 'standard' ? STANDARD_PRESETS[difficulty] : LARGE_PRINT_PRESETS[difficulty]
}

export interface NormalizedMessage {
  display: string
  letters: string
  boxWords: string[]
}

export function parseTone(raw: unknown): HiddenMessageTone {
  const value = String(raw ?? DEFAULT_TONE)
  if (value === 'funny' || value === 'heartfelt' || value === 'classy' || value === 'sassy') {
    return value
  }
  return DEFAULT_TONE
}

export function parseDifficulty(raw: unknown): HiddenMessageDifficulty {
  const value = String(raw ?? DEFAULT_DIFFICULTY)
  if (value === 'easy' || value === 'medium' || value === 'hard') return value
  return DEFAULT_DIFFICULTY
}

export function parseWordsFrom(raw: unknown): HiddenMessageWordsFrom {
  const value = String(raw ?? DEFAULT_WORDS_FROM)
  if (value === 'ai-theme' || value === 'custom-saying') return value
  return DEFAULT_WORDS_FROM
}

export function parseTheme(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, AI_THEME_MAX_LENGTH)
}

export function letterToken(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '')
}

export function parseCustomMessage(raw: unknown): NormalizedMessage | null {
  return normalizeMessage(String(raw ?? ''))
}

export function normalizeMessage(raw: string): NormalizedMessage | null {
  const display = raw.trim().replace(/\s+/g, ' ')
  if (!display) return null
  const letters = letterToken(display)
  if (letters.length < MIN_MESSAGE_LETTERS || letters.length > MAX_MESSAGE_LETTERS) {
    return null
  }
  const boxWords = display
    .split(' ')
    .map((word) => letterToken(word))
    .filter((word) => word.length > 0)
  if (boxWords.length === 0) return null
  return { display, letters, boxWords }
}

export function isPalindrome(token: string): boolean {
  return token.length > 0 && token === [...token].reverse().join('')
}

export function hasFinanceAdvice(text: string): boolean {
  return FINANCE_ADVICE_PATTERNS.some((re) => re.test(text))
}

export function isUnsafeCopy(text: string): boolean {
  return hasMedicalClaim(text) || hasTrademarkHint(text) || hasFinanceAdvice(text)
}

function dropContained(entries: WordEntry[]): WordEntry[] {
  const longestFirst = [...entries].sort((a, b) => b.token.length - a.token.length)
  const kept: WordEntry[] = []
  for (const entry of longestFirst) {
    if (kept.some((other) => other.token.includes(entry.token))) continue
    kept.push(entry)
  }
  return kept
}

/** Pool for the grid: length-bounded, no palindromes / nested tokens / unsafe copy. */
export function filterWordPool(raw: unknown, gridSize: number): WordEntry[] {
  const sanitized = sanitizeWordEntries(raw, {
    gridSize,
    minLetters: MIN_WORD_LETTERS,
    maxLetters: Math.min(MAX_WORD_LETTERS, gridSize),
  })
  const safe = sanitized.filter(
    (entry) => !isPalindrome(entry.token) && !isUnsafeCopy(entry.display),
  )
  return dropContained(safe)
}

export function minValidPoolSize(
  difficulty: HiddenMessageDifficulty,
  printStyle: RetirementPrintStyle = 'large-print',
): number {
  return difficultyPreset(difficulty, printStyle).listedWords + 8
}

export function parseRemotePayload(raw: unknown): HiddenMessageResponse | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as { message?: unknown; words?: unknown }
  if (typeof data.message !== 'string') return null
  if (!Array.isArray(data.words)) return null
  const words = data.words.filter((word): word is string => typeof word === 'string')
  if (words.length === 0) return null
  return { message: data.message, words }
}

export function validatePayload(
  raw: unknown,
  difficulty: HiddenMessageDifficulty,
  customMessage?: string,
  printStyle: RetirementPrintStyle = 'large-print',
): { message: NormalizedMessage; words: WordEntry[] } | null {
  const parsed = parseRemotePayload(raw)
  if (!parsed) return null
  const message = normalizeMessage(customMessage?.trim() ? customMessage : parsed.message)
  if (!message) return null
  const gridSize = difficultyPreset(difficulty, printStyle).gridSize
  const words = filterWordPool(parsed.words, gridSize)
  if (words.length < minValidPoolSize(difficulty, printStyle)) return null
  return { message, words }
}
