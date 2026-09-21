import type { StudioConfig } from '@/types/studio-template.types'
import type { StudioRng } from '../studio-rng'
import {
  listThemeMeta,
  loadThemeWords,
  themeLabel,
} from '../word-search/wordlists'
import {
  loadSkeletonIndex,
  skeletonKey,
  type SkeletonIndex,
} from './disemvowel'

export type MvDifficulty = 'easy' | 'medium' | 'hard'

const MIN_WORD_LEN = 3
const MAX_WORD_LEN = 12
export const CUSTOM_THEME_MAX_LENGTH = 120

const LENGTH_BY_DIFFICULTY: Record<MvDifficulty, { min: number; max: number }> = {
  easy: { min: 3, max: 5 },
  medium: { min: 4, max: 8 },
  hard: { min: 6, max: 12 },
}

const THEME_KEYS = new Set(listThemeMeta().map((entry) => entry.key))

export function themeSelectOptions(): { label: string; value: string }[] {
  return listThemeMeta().map((entry) => ({
    label: entry.label,
    value: entry.key,
  }))
}

export function parseDifficulty(raw: unknown): MvDifficulty {
  const v = String(raw ?? 'medium')
  if (v === 'easy' || v === 'medium' || v === 'hard') return v
  return 'medium'
}

export function clampItemCount(raw: unknown): number {
  const n = Math.round(Number(raw ?? 12))
  if (!Number.isFinite(n)) return 12
  return Math.min(24, Math.max(5, n))
}

export function resolveThemeKey(config: StudioConfig): string {
  const key = String(config.theme ?? 'animals')
  return THEME_KEYS.has(key) ? key : 'animals'
}

/** Preset theme off → AI generates words from a typed theme phrase. */
export function isCustomAiTheme(config: StudioConfig): boolean {
  return config.customTheme === true
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

/** Uppercase A–Z (+ spaces for phrases), length-gated, deduped. */
export function sanitizeMvItems(raw: unknown, allowPhrases: boolean): string[] {
  const lines: string[] = Array.isArray(raw)
    ? raw.map((w) => String(w))
    : String(raw ?? '')
        .split(/\n+/)
        .map((w) => w.trim())

  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    const cleaned = line
      .toUpperCase()
      .replace(/[^A-Z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!cleaned) continue
    const isPhrase = cleaned.includes(' ')
    if (isPhrase && !allowPhrases) continue
    if (isPhrase) {
      const words = cleaned.split(' ')
      if (words.length < 2 || words.length > 8) continue
      if (words.some((w) => w.length < 1)) continue
    } else if (cleaned.length < MIN_WORD_LEN || cleaned.length > MAX_WORD_LEN) {
      continue
    }
    if (seen.has(cleaned)) continue
    seen.add(cleaned)
    out.push(cleaned)
  }
  return out
}

export function lengthRangeFor(difficulty: MvDifficulty): { min: number; max: number } {
  return LENGTH_BY_DIFFICULTY[difficulty]
}

function filterWordsByLength(pool: readonly string[], difficulty: MvDifficulty): string[] {
  const { min, max } = lengthRangeFor(difficulty)
  return pool
    .map((w) => w.toUpperCase().replace(/[^A-Z]/g, ''))
    .filter((w) => w.length >= min && w.length <= max)
}

/**
 * Prefer low-ambiguity skeletons (few co-skeleton words).
 * Soft preference — still fills the sheet if the pool is thin.
 */
export function sampleLowAmbiguityWords(
  pool: readonly string[],
  count: number,
  rng: StudioRng,
  includeY: boolean,
): string[] {
  const index = loadSkeletonIndex(includeY)
  const normalized = pool
    .map((w) => w.toUpperCase().replace(/[^A-Z]/g, ''))
    .filter((w) => w.length >= MIN_WORD_LEN && w.length <= MAX_WORD_LEN)

  const unique = [...new Set(normalized)]
  const scored = unique.map((word) => ({
    word,
    collisions: collisionCount(word, index, includeY),
  }))
  scored.sort((a, b) => a.collisions - b.collisions)

  const low = scored.filter((s) => s.collisions <= 2).map((s) => s.word)
  const rest = scored.filter((s) => s.collisions > 2).map((s) => s.word)

  if (low.length >= count) {
    return rng.sample(low, count)
  }

  const ordered = [...rng.shuffle(low), ...rng.shuffle(rest)]
  return ordered.slice(0, Math.min(count, ordered.length))
}

function collisionCount(word: string, index: SkeletonIndex, includeY: boolean): number {
  return (index.get(skeletonKey(word, includeY)) ?? []).length
}

export function defaultTitleFor(config: StudioConfig): string | undefined {
  if (String(config.title ?? '').trim()) return undefined
  if (isCustomAiTheme(config)) {
    const label = customThemeTitle(config)
    return label ? `Missing Vowels: ${label}` : 'Missing Vowels'
  }
  return `Missing Vowels: ${themeLabel(resolveThemeKey(config))}`
}

export function themeDisplayLabel(config: StudioConfig): string {
  if (isCustomAiTheme(config)) {
    return resolveCustomThemeText(config) || 'this theme'
  }
  return themeLabel(resolveThemeKey(config))
}

/** Bundled theme words — used when AI remote data is missing. */
export function resolveContent(
  config: StudioConfig,
  itemCount: number,
  rng: StudioRng,
): string[] {
  const difficulty = parseDifficulty(config.difficulty)
  const includeY = difficulty === 'hard'
  const themeKey = resolveThemeKey(config)
  const pool = filterWordsByLength(loadThemeWords(themeKey), difficulty)
  return sampleLowAmbiguityWords(pool, itemCount, rng, includeY)
}
