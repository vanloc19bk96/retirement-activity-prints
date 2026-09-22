import type { StudioConfig } from '@/types/studio-template.types'
import type { StudioRng } from '../studio-rng'
import {
  aiThemeLabel,
  parseRetirementDifficulty,
  type RetirementPrintStyle,
} from '../_shared/retirement-theme-config'
import {
  hasAgeStereotype,
  hasMedicalClaim,
  hasTrademarkHint,
} from '../crossword/content-quality'
import {
  isPlayableMask,
  letterToken,
  maskVowels,
  type MissingVowelItem,
} from './mask'

export type MvDifficulty = 'relaxed' | 'classic' | 'challenge'
export type { RetirementPrintStyle }

export const MISSING_VOWELS_DEFAULT_TITLE = 'Missing Vowels'
export const MISSING_VOWELS_INSTRUCTION =
  'Add the missing vowels to complete each word or phrase.'
export const MISSING_VOWELS_INSTRUCTION_GENERIC =
  'Add the missing vowels to complete each retirement-themed word or phrase.'
export const MISSING_VOWELS_AI_EMPTY_MESSAGE =
  'Unable to create enough high-quality retirement words. Try again or choose a broader theme.'

export const MIN_ITEM_COUNT = 8
export const MAX_ITEM_COUNT = 18
export const DEFAULT_ITEM_COUNT = 12
export const CANDIDATE_MULTIPLIER = 2

export const LETTER_RANGE: Record<MvDifficulty, { min: number; max: number }> = {
  relaxed: { min: 4, max: 8 },
  classic: { min: 5, max: 10 },
  challenge: { min: 6, max: 14 },
}

const MAX_WORDS = 2

export function parseDifficulty(raw: unknown): MvDifficulty {
  return parseRetirementDifficulty(raw)
}

export function clampItemCount(raw: unknown): number {
  const n = Math.round(Number(raw ?? DEFAULT_ITEM_COUNT))
  if (!Number.isFinite(n)) return DEFAULT_ITEM_COUNT
  return Math.min(MAX_ITEM_COUNT, Math.max(MIN_ITEM_COUNT, n))
}

export function instructionFor(config: StudioConfig): string {
  return config.showTitle === false
    ? MISSING_VOWELS_INSTRUCTION_GENERIC
    : MISSING_VOWELS_INSTRUCTION
}

export function defaultTitleFor(config: StudioConfig): string | undefined {
  if (String(config.title ?? '').trim()) return undefined
  const theme = aiThemeLabel(config)
  return theme ? `${MISSING_VOWELS_DEFAULT_TITLE}: ${theme}` : MISSING_VOWELS_DEFAULT_TITLE
}

export function isValidLetterCount(token: string, difficulty: MvDifficulty): boolean {
  const { min, max } = LETTER_RANGE[difficulty]
  return token.length >= min && token.length <= max
}

function titleCaseWord(word: string): string {
  return word.charAt(0) + word.slice(1).toLowerCase()
}

function toDisplay(raw: string, words: string[]): string {
  const trimmed = raw.trim()
  if (/[a-z]/.test(trimmed) && /[A-Z]/.test(trimmed)) {
    return trimmed.replace(/\s+/g, ' ')
  }
  return words.map(titleCaseWord).join(' ')
}

function isUnsafeAnswer(display: string): boolean {
  return hasMedicalClaim(display) || hasTrademarkHint(display) || hasAgeStereotype(display)
}

/** GARDEN / GARDENER / GARDENING — skip inflected copies of a shorter answer. */
export function isNearDuplicate(a: string, b: string): boolean {
  if (a === b) return true
  const shorter = a.length <= b.length ? a : b
  const longer = a.length > b.length ? a : b
  if (shorter.length < 4) return false
  return longer.startsWith(shorter)
}

export function normalizeCandidate(raw: unknown): MissingVowelItem | null {
  if (raw && typeof raw === 'object' && 'answer' in raw) {
    return normalizeCandidate(String((raw as { answer: unknown }).answer))
  }
  const text = String(raw ?? '').trim()
  if (!text) return null
  const words = text
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  if (words.length < 1 || words.length > MAX_WORDS) return null
  if (words.some((word) => word.length < 1)) return null
  const token = letterToken(words.join(''))
  if (!token) return null
  const display = toDisplay(text, words)
  if (isUnsafeAnswer(display)) return null
  const masked = maskVowels(words.join(' '))
  const item: MissingVowelItem = { display, token, masked }
  if (!isPlayableMask(item)) return null
  return item
}

function prefersSingleWord(difficulty: MvDifficulty, item: MissingVowelItem): boolean {
  if (difficulty !== 'relaxed') return true
  return !item.display.includes(' ')
}

/**
 * Normalize → length → safety → unique token → unique mask → near-dupe → take count.
 */
export function selectAiItems(
  remote: readonly unknown[] | undefined,
  options: { count: number; difficulty: MvDifficulty },
): MissingVowelItem[] {
  const { count, difficulty } = options
  const accepted: MissingVowelItem[] = []
  const tokens = new Set<string>()
  const masks = new Set<string>()

  for (const raw of remote ?? []) {
    const item = normalizeCandidate(raw)
    if (!item) continue
    if (!isValidLetterCount(item.token, difficulty)) continue
    if (tokens.has(item.token) || masks.has(item.masked)) continue
    if (accepted.some((prev) => isNearDuplicate(prev.token, item.token))) continue
    tokens.add(item.token)
    masks.add(item.masked)
    accepted.push(item)
  }

  const preferred = accepted.filter((item) => prefersSingleWord(difficulty, item))
  const pool = preferred.length >= count ? preferred : accepted
  return pool.slice(0, count)
}

export function shuffleItems(items: MissingVowelItem[], rng: StudioRng): MissingVowelItem[] {
  return rng.shuffle(items)
}

export function minPuzzleFont(printStyle: RetirementPrintStyle): number {
  return printStyle === 'standard' ? 12 : 16
}
