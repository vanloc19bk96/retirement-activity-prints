import type { StudioConfig } from '@/types/studio-template.types'
import type { DecadeTriviaDecade } from '@/types/studio-decade-trivia.types'

export const CUSTOM_DECADE_MAX = 24

const PRESET_DECADES: DecadeTriviaDecade[] = [
  '1950s',
  '1960s',
  '1970s',
  '1980s',
  '1990s',
  '2000s',
]

const PRESET_SET = new Set<string>(PRESET_DECADES)

/** True when the author opted to type a decade instead of using the select. */
export function isCustomDecade(config: StudioConfig): boolean {
  return config.customDecade === true
}

/**
 * Normalize free text to a decade label like `2010s`.
 * Accepts `2010s`, `2010`, `the 2010s`, or a year inside the decade (`2014`).
 */
export function normalizeDecadeLabel(raw: unknown): string | null {
  const text = String(raw ?? '').trim()
  if (!text || text.length > CUSTOM_DECADE_MAX) return null

  const decadeMatch = text.match(/\b((?:18|19|20)\d)0\s*'?s?\b/i)
  if (decadeMatch) {
    return `${decadeMatch[1]}0s`
  }

  const yearMatch = text.match(/\b((?:18|19|20)\d{2})\b/)
  if (!yearMatch) return null
  const year = Number(yearMatch[1])
  if (!Number.isFinite(year) || year < 1800 || year > 2099) return null
  const start = Math.floor(year / 10) * 10
  return `${start}s`
}

export function isPresetDecade(decade: string): decade is DecadeTriviaDecade {
  return PRESET_SET.has(decade)
}

/** Decade label used for AI generation and page copy. */
export function resolveDecade(config: StudioConfig): string {
  if (isCustomDecade(config)) {
    return normalizeDecadeLabel(config.customDecadeText) ?? '1960s'
  }
  const fromSelect = normalizeDecadeLabel(config.decade)
  if (fromSelect) return fromSelect
  const raw = String(config.decade ?? '1960s')
  return isPresetDecade(raw) ? raw : '1960s'
}
