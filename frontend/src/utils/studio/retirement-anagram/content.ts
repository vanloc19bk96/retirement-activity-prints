import type { StudioConfig } from '@/types/studio-template.types'
import {
  hasUniqueAnagram,
  loadAnagramIndex,
  type AnagramIndex,
} from './scramble'

export type AnagramDifficulty = 'easy' | 'medium' | 'hard'

export const RETIREMENT_ANAGRAM_DEFAULT_TITLE = 'Retirement Anagrams'
export const RETIREMENT_ANAGRAM_INSTRUCTION =
  'Unscramble the letters to reveal each retirement-themed word.'
export const RETIREMENT_ANAGRAM_AI_EMPTY_MESSAGE =
  'Unable to create enough high-quality retirement words. Try again or choose a broader topic.'

export const CUSTOM_TOPIC_VALUE = 'custom'
export const CUSTOM_TOPIC_MAX_LENGTH = 120
export const DEFAULT_TOPIC = 'retirement-life'
export const MIN_ITEM_COUNT = 8
export const MAX_ITEM_COUNT = 20
export const DEFAULT_ITEM_COUNT = 12
/** Spec: ask AI for itemCount + 5 candidates. */
export const CANDIDATE_OVERREQUEST = 5

export const LENGTH_RANGE: Record<AnagramDifficulty, { min: number; max: number }> = {
  easy: { min: 4, max: 6 },
  medium: { min: 5, max: 8 },
  hard: { min: 7, max: 11 },
}

const TOPIC_OPTIONS: { value: string; label: string }[] = [
  { value: 'retirement-life', label: 'Retirement Life' },
  { value: 'travel-vacations', label: 'Travel & Vacations' },
  { value: 'hobbies-leisure', label: 'Hobbies & Leisure' },
  { value: 'gardening', label: 'Gardening' },
  { value: 'family-grandchildren', label: 'Family & Grandchildren' },
  { value: 'health-wellness', label: 'Health & Wellness' },
  { value: 'relaxation', label: 'Relaxation' },
  { value: 'bucket-list', label: 'Bucket List' },
  { value: 'volunteering', label: 'Volunteering' },
  { value: 'home-lifestyle', label: 'Home & Lifestyle' },
  { value: 'memories-nostalgia', label: 'Memories & Nostalgia' },
  { value: CUSTOM_TOPIC_VALUE, label: 'Custom Topic' },
]

const TOPIC_LABEL_BY_VALUE = new Map(TOPIC_OPTIONS.map((t) => [t.value, t.label]))

export function topicSelectOptions() {
  return TOPIC_OPTIONS.map((t) => ({ label: t.label, value: t.value }))
}

export function parseTopic(raw: unknown): string {
  const value = String(raw ?? DEFAULT_TOPIC).trim()
  return TOPIC_LABEL_BY_VALUE.has(value) ? value : DEFAULT_TOPIC
}

export function isCustomTopic(config: StudioConfig): boolean {
  return parseTopic(config.topic) === CUSTOM_TOPIC_VALUE
}

export function parseDifficulty(raw: unknown): AnagramDifficulty {
  return raw === 'easy' || raw === 'hard' ? raw : 'medium'
}

export function clampItemCount(raw: unknown): number {
  const n = Math.round(Number(raw ?? DEFAULT_ITEM_COUNT))
  if (!Number.isFinite(n)) return DEFAULT_ITEM_COUNT
  return Math.min(MAX_ITEM_COUNT, Math.max(MIN_ITEM_COUNT, n))
}

export function resolveCustomTopicText(config: StudioConfig): string {
  return String(config.customTopic ?? '')
    .trim()
    .slice(0, CUSTOM_TOPIC_MAX_LENGTH)
}

/** Display label for titles / variety keys. */
export function topicLabel(config: StudioConfig): string {
  if (isCustomTopic(config)) {
    const custom = resolveCustomTopicText(config)
    if (!custom) return 'Custom Topic'
    return custom.charAt(0).toUpperCase() + custom.slice(1)
  }
  return TOPIC_LABEL_BY_VALUE.get(parseTopic(config.topic)) ?? 'Retirement Life'
}

/** Prompt string sent to the AI endpoint. */
export function resolveTopicPrompt(config: StudioConfig): string {
  if (isCustomTopic(config)) {
    return resolveCustomTopicText(config) || 'Retirement Life'
  }
  return topicLabel(config)
}

export function normalizeWord(raw: string): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}

export function isValidWordLength(word: string, difficulty: AnagramDifficulty): boolean {
  const { min, max } = LENGTH_RANGE[difficulty]
  return word.length >= min && word.length <= max
}

/**
 * Normalize → validate length → dedupe → unique-anagram filter → take `count`.
 * Returns up to `count` words; caller decides whether that is enough.
 */
export function selectAiWords(
  remote: readonly string[] | undefined,
  options: {
    count: number
    difficulty: AnagramDifficulty
    index?: AnagramIndex
  },
): string[] {
  const { count, difficulty } = options
  const index = options.index ?? loadAnagramIndex()
  const out: string[] = []
  const seen = new Set<string>()

  for (const raw of remote ?? []) {
    const word = normalizeWord(raw)
    if (!word || seen.has(word)) continue
    if (!isValidWordLength(word, difficulty)) continue
    if (!hasUniqueAnagram(word, index)) continue
    seen.add(word)
    out.push(word)
    if (out.length >= count) break
  }
  return out
}

export function defaultTitleFor(config: StudioConfig): string | undefined {
  if (String(config.title ?? '').trim()) return undefined
  const topic = parseTopic(config.topic)
  if (topic === DEFAULT_TOPIC || topic === CUSTOM_TOPIC_VALUE) {
    return RETIREMENT_ANAGRAM_DEFAULT_TITLE
  }
  return `Unscramble: ${topicLabel(config)}`
}
