import type {
  StudioConfig,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import {
  defaultThemeId,
  getRetirementTheme,
  parseRetirementCategory,
  themesForCategory,
  type RetirementThemeCategory,
} from '../retirement-word-search/retirement-themes'
import { isNearDuplicateSaying, isUnsafeCopy } from './content-quality'

export type CryptogramLength = 'short' | 'medium' | 'long'
export type RetirementPrintStyle = 'large-print' | 'standard'

export const CRYPTOGRAM_DEFAULT_TITLE = 'RETIREMENT CRYPTOGRAM'
export const CRYPTOGRAM_INSTRUCTION =
  'Decode each saying by replacing the coded letters. The same code always represents the same letter, and no letter stands for itself.'
export const CRYPTOGRAM_AI_EMPTY_MESSAGE =
  'Unable to create enough high-quality retirement sayings. Try again or choose a broader theme.'

export const AI_THEME_MAX_LENGTH = 120
export const MIN_PUZZLES = 1
export const MAX_PUZZLES = 6
export const MAX_SLOT_FONT = 20
export const RETIREMENT_DEFAULT_THEME_LABEL = 'Life After Work'

const ALLOWED_RE = /^[A-Z]+(?: [A-Z]+)*$/
const MIN_WORDS = 4
const MAX_WORDS = 12
const MAX_WORD_LETTERS = 12

const LENGTH_RANGE: Record<CryptogramLength, { min: number; max: number }> = {
  short: { min: 18, max: 32 },
  medium: { min: 30, max: 52 },
  long: { min: 46, max: 68 },
}

const CANDIDATE_COUNT: Record<number, number> = {
  1: 5,
  2: 8,
  3: 10,
  4: 12,
  5: 14,
  6: 16,
}

export function parseWriteOwnTheme(raw: unknown): boolean {
  return raw === true
}

export function parseLength(raw: unknown): CryptogramLength {
  return raw === 'short' || raw === 'long' ? raw : 'medium'
}

export function parsePrintStyle(raw: unknown): RetirementPrintStyle {
  return raw === 'standard' ? 'standard' : 'large-print'
}

export function minSlotFont(printStyle: RetirementPrintStyle): number {
  return printStyle === 'large-print' ? 14 : 11
}

export function candidateCountFor(need: number): number {
  return CANDIDATE_COUNT[need] ?? need + 7
}

export function clampPuzzleCount(raw: unknown, max = MAX_PUZZLES): number {
  const n = Math.round(Number(raw ?? 2))
  if (!Number.isFinite(n)) return Math.min(2, max)
  return Math.min(max, Math.max(MIN_PUZZLES, n))
}

export function puzzleCountFor(config: StudioConfig): number {
  return clampPuzzleCount(config.puzzleCount)
}

/** Longest legal saying for this length — longest words so wrap-count is pessimistic. */
export function worstCaseSaying(length: CryptogramLength): string {
  const words: string[] = []
  let remaining = LENGTH_RANGE[length].max
  while (remaining > 0 && words.length < MAX_WORDS) {
    const reserved = Math.max(0, MIN_WORDS - words.length - 1)
    const take = Math.min(MAX_WORD_LETTERS, remaining - reserved)
    const size = Math.max(1, take)
    if (size > remaining) break
    words.push('A'.repeat(size))
    remaining -= size
  }
  while (words.length < MIN_WORDS) words.push('A')
  return words.join(' ')
}

export function resolvePresetThemeId(config: StudioConfig): string {
  const category = parseRetirementCategory(config.retirementCategory)
  const raw = String(config.presetThemeId ?? '').trim()
  const theme = getRetirementTheme(raw)
  if (theme && theme.category === category) return theme.id
  return defaultThemeId(category)
}

export function aiThemeLabel(config: StudioConfig): string {
  if (parseWriteOwnTheme(config.writeOwnTheme)) {
    const custom = String(config.customTheme ?? config.customThemeText ?? '')
      .trim()
      .slice(0, AI_THEME_MAX_LENGTH)
    if (!custom) return ''
    return custom.charAt(0).toUpperCase() + custom.slice(1)
  }
  return getRetirementTheme(resolvePresetThemeId(config))?.label ?? RETIREMENT_DEFAULT_THEME_LABEL
}

export function resolveAiThemePrompt(config: StudioConfig): string {
  if (parseWriteOwnTheme(config.writeOwnTheme)) {
    const custom = String(config.customTheme ?? config.customThemeText ?? '')
      .trim()
      .slice(0, AI_THEME_MAX_LENGTH)
    return custom || 'retirement lifestyle hobbies'
  }
  const theme = getRetirementTheme(resolvePresetThemeId(config))
  if (theme) return `${theme.label} retirement lifestyle`
  return 'retirement lifestyle hobbies'
}

export function categorySelectOptions() {
  return [
    { label: 'Retirement Life', value: 'retirement-life' },
    { label: 'Travel & Adventure', value: 'travel-adventure' },
    { label: 'Hobbies & Leisure', value: 'hobbies-leisure' },
    { label: 'Career & Farewell', value: 'career-farewell' },
    { label: 'Nostalgia', value: 'nostalgia' },
    { label: 'Friends & Family', value: 'friends-family' },
    { label: 'Active Retirement', value: 'active-retirement' },
    { label: 'Home & Leisure', value: 'home-leisure' },
  ]
}

export function themeSelectOptions(category: RetirementThemeCategory) {
  return themesForCategory(category).map((t) => ({ label: t.label, value: t.id }))
}

export function normalizeSaying(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function letterCount(text: string): number {
  return text.replace(/ /g, '').length
}

export function isValidSaying(text: string, length?: CryptogramLength): boolean {
  if (!text || !ALLOWED_RE.test(text)) return false
  const words = text.split(' ').filter(Boolean)
  if (words.length < MIN_WORDS || words.length > MAX_WORDS) return false
  if (words.some((word) => word.length > MAX_WORD_LETTERS)) return false
  const letters = letterCount(text)
  if (length) {
    const { min, max } = LENGTH_RANGE[length]
    return letters >= min && letters <= max
  }
  return letters >= LENGTH_RANGE.short.min && letters <= LENGTH_RANGE.long.max
}

/** Normalize + validate AI lines; drop dups, near-dups, and unsafe copy. */
export function selectAiSayings(
  remote: readonly string[] | undefined,
  options: { count: number; length: CryptogramLength },
): string[] {
  const { count, length } = options
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of remote ?? []) {
    const cleaned = normalizeSaying(String(raw ?? ''))
    if (!cleaned || seen.has(cleaned)) continue
    if (!isValidSaying(cleaned, length)) continue
    if (isUnsafeCopy(cleaned)) continue
    if (out.some((existing) => isNearDuplicateSaying(existing, cleaned))) continue
    seen.add(cleaned)
    out.push(cleaned)
    if (out.length >= Math.max(count, candidateCountFor(count))) break
  }
  return out
}

export function sayingFingerprint(saying: string, cipherSeed: number): string {
  return `${normalizeSaying(saying)}:${cipherSeed}`
}

export function defaultTitleFor(config: StudioConfig): string | undefined {
  if (String(config.title ?? '').trim()) return undefined
  return CRYPTOGRAM_DEFAULT_TITLE
}

export function validateCryptogramConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  if (parseWriteOwnTheme(config.writeOwnTheme)) {
    const theme = String(config.customTheme ?? config.customThemeText ?? '').trim()
    if (!theme) {
      return {
        field: 'customTheme',
        message: 'Enter a custom retirement theme, or turn off Write my own theme.',
      }
    }
    if (theme.length > AI_THEME_MAX_LENGTH) {
      return {
        field: 'customTheme',
        message: `Keep the theme under ${AI_THEME_MAX_LENGTH} characters.`,
      }
    }
    return null
  }

  if (!getRetirementTheme(resolvePresetThemeId(config))) {
    return { field: 'presetThemeId', message: 'Choose a retirement theme.' }
  }
  return null
}
