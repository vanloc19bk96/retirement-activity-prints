import indexJson from '@/data/studio/cryptogram/index.json'
import proverbsEn from '@/data/studio/cryptogram/proverbs-en.json'
import wisdomEn from '@/data/studio/cryptogram/wisdom-en.json'
import everydayEn from '@/data/studio/cryptogram/everyday-en.json'
import natureEn from '@/data/studio/cryptogram/nature-en.json'
import kindnessEn from '@/data/studio/cryptogram/kindness-en.json'
import type { StudioConfig } from '@/types/studio-template.types'
import type { StudioRng } from '../studio-rng'

export type CryptogramSource = 'theme' | 'custom'
export type CryptogramLength = 'short' | 'medium' | 'long'

export interface CryptogramThemeMeta {
  key: string
  label: string
  locale: string
}

const THEME_QUOTES: Record<string, readonly string[]> = {
  proverbs: proverbsEn,
  wisdom: wisdomEn,
  everyday: everydayEn,
  nature: natureEn,
  kindness: kindnessEn,
}

/** Solving is per-letter, so only A–Z and word gaps survive sanitising. */
const MIN_LETTERS = 12
const MAX_LETTERS = 78
const MIN_CUSTOM = 1
export const CUSTOM_THEME_MAX_LENGTH = 120
export const MIN_PUZZLES = 1
export const MAX_PUZZLES = 4

const LENGTH_RANGE: Record<CryptogramLength, { min: number; max: number }> = {
  short: { min: MIN_LETTERS, max: 32 },
  medium: { min: 28, max: 52 },
  long: { min: 46, max: MAX_LETTERS },
}

const META = indexJson as CryptogramThemeMeta[]
const META_BY_KEY = new Map(META.map((entry) => [entry.key, entry]))

/** Usable sayings per theme — used for AI fallback bank size checks. */
export function themeQuoteCount(key: string): number {
  return sanitizeQuotes(poolFor(key)).length
}

/** Preset AI themes — labels only (bank size no longer drives uniqueness). */
export function themeSelectOptions(): { label: string; value: string }[] {
  return META.filter((entry) => entry.key !== 'mixed').map((entry) => ({
    label: entry.label,
    value: entry.key,
  }))
}

export function themeLabel(key: string): string {
  return META_BY_KEY.get(key)?.label ?? 'Proverbs'
}

/** Legacy `ai` configs map to theme (AI-only path). */
export function parseSource(raw: unknown): CryptogramSource {
  if (raw === 'custom') return 'custom'
  return 'theme'
}

export function parseLength(raw: unknown): CryptogramLength {
  return raw === 'short' || raw === 'long' ? raw : 'medium'
}

/** Shared by the generator and the AI prefetch so both ask for the same count. */
export function clampPuzzleCount(raw: unknown): number {
  const n = Math.round(Number(raw ?? 2))
  if (!Number.isFinite(n)) return 2
  return Math.min(MAX_PUZZLES, Math.max(MIN_PUZZLES, n))
}

export function resolveThemeKey(config: StudioConfig): string {
  const key = String(config.theme ?? 'proverbs')
  // `mixed` is fallback-only (not in the AI theme select).
  return key === 'mixed' || THEME_QUOTES[key] ? key : 'proverbs'
}

export function minCustomQuotes(): number {
  return MIN_CUSTOM
}

/** Uppercase A–Z plus single spaces; anything else is dropped. */
export function sanitizeQuotes(raw: unknown): string[] {
  const lines: string[] = Array.isArray(raw)
    ? raw.map((line) => String(line))
    : String(raw ?? '').split(/\n+/)

  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    const cleaned = line
      .toUpperCase()
      .replace(/[^A-Z]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!cleaned) continue
    const letters = cleaned.replace(/ /g, '').length
    if (letters < MIN_LETTERS || letters > MAX_LETTERS) continue
    if (seen.has(cleaned)) continue
    seen.add(cleaned)
    out.push(cleaned)
  }
  return out
}

function poolFor(themeKey: string): string[] {
  if (themeKey === 'mixed') {
    return Object.values(THEME_QUOTES).flatMap((list) => [...list])
  }
  return [...(THEME_QUOTES[themeKey] ?? THEME_QUOTES.proverbs!)]
}

function filterByLength(quotes: string[], length: CryptogramLength): string[] {
  const { min, max } = LENGTH_RANGE[length]
  return quotes.filter((quote) => {
    const letters = quote.replace(/ /g, '').length
    return letters >= min && letters <= max
  })
}

/** Theme uses the form control; own sayings use one puzzle per typed line. */
export function puzzleCountFor(config: StudioConfig): number {
  if (parseSource(config.source) === 'custom') {
    const n = sanitizeQuotes(config.quotes).length
    if (n < MIN_PUZZLES) return MIN_PUZZLES
    return Math.min(MAX_PUZZLES, n)
  }
  return clampPuzzleCount(config.puzzleCount)
}

/**
 * Author's own lines, or bundled bank (AI fallback / top-up only).
 * Never returns fewer than one when the pool has usable sayings.
 */
export function resolveQuotes(
  config: StudioConfig,
  count: number,
  rng: StudioRng,
): string[] {
  if (parseSource(config.source) === 'custom') {
    // Keep the author's order — one puzzle per line, no shuffle or cycling.
    return sanitizeQuotes(config.quotes).slice(0, count)
  }

  const pool = sanitizeQuotes(poolFor(resolveThemeKey(config)))
  const gated = filterByLength(pool, parseLength(config.length))
  const source = gated.length >= count ? gated : pool
  return rng.sample(source, Math.min(count, source.length))
}

/** Preset theme off → AI generates sayings from a typed theme phrase. */
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

/** Human-readable theme for AI requests / default titles. */
export function resolveThemePrompt(config: StudioConfig): string {
  if (isCustomAiTheme(config)) {
    return resolveCustomThemeText(config) || 'everyday wisdom'
  }
  return themeLabel(resolveThemeKey(config))
}

/**
 * AI lines when the model delivered enough of them, topped up from the mixed
 * bundled bank otherwise — a page must still print when the call falls short.
 */
export function resolveAiQuotes(options: {
  remote: readonly string[] | undefined
  config: StudioConfig
  count: number
  rng: StudioRng
}): string[] {
  const { remote, config, count, rng } = options
  const clean = sanitizeQuotes(remote ? [...remote] : [])
  if (clean.length >= count) return clean.slice(0, count)

  const filler = resolveQuotes(
    { ...config, source: 'theme', theme: 'mixed' },
    count - clean.length,
    rng,
  )
  return [...clean, ...filler]
}

export function defaultTitleFor(config: StudioConfig): string | undefined {
  if (String(config.title ?? '').trim()) return undefined
  if (parseSource(config.source) === 'custom') return 'Cryptogram'
  if (isCustomAiTheme(config)) {
    const label = customThemeTitle(config)
    return label ? `Cryptogram: ${label}` : 'Cryptogram'
  }
  return `Cryptogram: ${themeLabel(resolveThemeKey(config))}`
}
