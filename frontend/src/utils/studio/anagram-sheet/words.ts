import type { StudioConfig } from '@/types/studio-template.types'
import type { StudioRng } from '../studio-rng'
import {
  listThemeMeta,
  loadThemeWords,
  themeLabel,
} from '../word-search/wordlists'
import { hasUniqueAnagram, loadAnagramIndex } from './scramble'
import { FAMILIAR_ANIMAL_SET } from './familiar-animals'

export type AnagramDifficulty = 'easy' | 'medium' | 'hard'
export type AnagramSource = 'theme' | 'custom'

export interface AnagramWordPair {
  word: string
}

const MIN_LEN = 3
const MAX_LEN = 10
export const CUSTOM_THEME_MAX_LENGTH = 120

const LENGTH_BY_DIFFICULTY: Record<AnagramDifficulty, { min: number; max: number }> = {
  easy: { min: 3, max: 5 },
  medium: { min: 5, max: 7 },
  hard: { min: 7, max: 10 },
}

const THEME_KEYS = new Set(listThemeMeta().map((entry) => entry.key))

/** Same theme set as word-search / crossword (shared bundled lists). */
export function themeSelectOptions(): { label: string; value: string }[] {
  return listThemeMeta().map((entry) => ({
    label: entry.label,
    value: entry.key,
  }))
}

export function parseDifficulty(raw: unknown): AnagramDifficulty {
  const v = String(raw ?? 'medium')
  if (v === 'easy' || v === 'medium' || v === 'hard') return v
  return 'medium'
}

export function parseSource(raw: unknown): AnagramSource {
  const v = String(raw ?? 'theme')
  if (v === 'theme' || v === 'custom') return v
  return 'theme'
}

export function clampItemCount(raw: unknown): number {
  const n = Math.round(Number(raw ?? 12))
  if (!Number.isFinite(n)) return 12
  return Math.min(24, Math.max(5, n))
}

/** Uppercase A–Z only, length 3–10, deduped. */
export function sanitizeAnagramWords(raw: unknown): string[] {
  const lines: string[] = Array.isArray(raw)
    ? raw.map((w) => String(w))
    : String(raw ?? '')
        .split(/[\n,]+/)
        .map((w) => w.trim())

  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    const word = line.toUpperCase().replace(/[^A-Z]/g, '')
    if (word.length < MIN_LEN || word.length > MAX_LEN) continue
    if (seen.has(word)) continue
    seen.add(word)
    out.push(word)
  }
  return out
}

export function lengthRangeFor(difficulty: AnagramDifficulty): { min: number; max: number } {
  return LENGTH_BY_DIFFICULTY[difficulty]
}

function filterByLength(pool: readonly string[], difficulty: AnagramDifficulty): string[] {
  const { min, max } = lengthRangeFor(difficulty)
  return pool.filter((w) => {
    const word = w.toUpperCase().replace(/[^A-Z]/g, '')
    return word.length >= min && word.length <= max
  })
}

/**
 * Prefer unique letter-sets. When `prefer` is set (e.g. everyday animals),
 * sample from that subset first so worksheets stay recognizable.
 */
export function sampleUniqueWords(
  pool: readonly string[],
  count: number,
  rng: StudioRng,
  prefer?: ReadonlySet<string>,
): string[] {
  const index = loadAnagramIndex()
  const normalized = pool
    .map((w) => w.toUpperCase().replace(/[^A-Z]/g, ''))
    .filter((w) => w.length >= MIN_LEN && w.length <= MAX_LEN)

  const uniquePreferred: string[] = []
  const uniqueOther: string[] = []
  const seen = new Set<string>()
  for (const word of normalized) {
    if (seen.has(word)) continue
    seen.add(word)
    if (!hasUniqueAnagram(word, index)) continue
    if (prefer?.has(word)) uniquePreferred.push(word)
    else uniqueOther.push(word)
  }

  if (uniquePreferred.length >= count) {
    return rng.sample(uniquePreferred, count)
  }

  const unique = [...rng.shuffle(uniquePreferred), ...rng.shuffle(uniqueOther)]
  if (unique.length >= count) {
    return unique.slice(0, count)
  }

  // Exhaust unique first; only then fill with remaining (rare edge case).
  const uniqueSet = new Set(unique)
  const ambiguous = normalized.filter((w) => !uniqueSet.has(w))
  const preferred = [...unique, ...rng.shuffle(ambiguous)]
  const out: string[] = []
  const picked = new Set<string>()
  for (const word of preferred) {
    if (picked.has(word)) continue
    picked.add(word)
    out.push(word)
    if (out.length >= count) break
  }
  return out
}

export function resolveThemeKey(config: StudioConfig): string {
  const key = String(config.theme ?? 'animals')
  return THEME_KEYS.has(key) ? key : 'animals'
}

/** Preset theme off → AI generates words from a typed theme phrase. */
export function isCustomAiTheme(config: StudioConfig): boolean {
  return config.customTheme === true && parseSource(config.source) === 'theme'
}

export function resolveCustomThemeText(config: StudioConfig): string {
  return String(config.customThemeText ?? '')
    .trim()
    .slice(0, CUSTOM_THEME_MAX_LENGTH)
}

function customThemeTitle(config: StudioConfig): string {
  const raw = resolveCustomThemeText(config)
  if (!raw) return ''
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

/** Human-readable theme label for AI requests / default titles. */
export function resolveThemePrompt(config: StudioConfig): string {
  if (isCustomAiTheme(config)) {
    return resolveCustomThemeText(config) || 'everyday objects'
  }
  return themeLabel(resolveThemeKey(config))
}

export function defaultTitleFor(config: StudioConfig): string | undefined {
  if (String(config.title ?? '').trim()) return undefined
  if (parseSource(config.source) !== 'theme') return 'Unscramble'
  if (isCustomAiTheme(config)) {
    const label = customThemeTitle(config)
    return label ? `Unscramble: ${label}` : 'Unscramble'
  }
  return `Unscramble: ${themeLabel(resolveThemeKey(config))}`
}

/**
 * Bundled theme / custom word pairs.
 * Theme generation prefers AI via remoteData; this path is fallback / top-up only.
 */
export function resolveWords(
  config: StudioConfig,
  itemCount: number,
  rng: StudioRng,
): AnagramWordPair[] {
  const source = parseSource(config.source)
  const difficulty = parseDifficulty(config.difficulty)

  if (source === 'custom') {
    const words = sanitizeAnagramWords(config.words)
    return words.map((word) => ({ word }))
  }

  const themeKey = resolveThemeKey(config)
  const pool = filterByLength(loadThemeWords(themeKey), difficulty)
  const prefer =
    themeKey === 'animals' ? (FAMILIAR_ANIMAL_SET as ReadonlySet<string>) : undefined
  const words = sampleUniqueWords(pool, itemCount, rng, prefer)
  return words.map((word) => ({ word }))
}
