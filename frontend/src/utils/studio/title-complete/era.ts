import type { StudioConfig } from '@/types/studio-template.types'
import type { TitleCompletePresetEra } from '@/types/studio-title-complete.types'

export const CUSTOM_ERA_MAX = 24

const PRESET_ERAS: TitleCompletePresetEra[] = [
  '1950s',
  '1960s',
  '1970s',
  '1980s',
  '1990s',
  '2000s',
  'any',
]

const PRESET_SET = new Set<string>(PRESET_ERAS)

/** True when the author opted to type an era instead of using the select. */
export function isCustomEra(config: StudioConfig): boolean {
  return config.customEra === true
}

/**
 * Normalize free text to a decade label like `2010s`.
 * Accepts `2010s`, `2010`, `the 2010s`, or a year inside the decade (`2014`).
 */
export function normalizeEraLabel(raw: unknown): string | null {
  const text = String(raw ?? '').trim()
  if (!text || text.length > CUSTOM_ERA_MAX) return null

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

export function isPresetEra(era: string): era is TitleCompletePresetEra {
  return PRESET_SET.has(era)
}

/** Era label used for AI generation (preset select or custom decade text). */
export function resolveEra(config: StudioConfig): string {
  if (isCustomEra(config)) {
    return normalizeEraLabel(config.customEraText) ?? '1960s'
  }
  const raw = String(config.era ?? 'any').trim()
  if (!raw || raw.toLowerCase() === 'any') return 'any'
  if (isPresetEra(raw)) return raw
  return normalizeEraLabel(raw) ?? 'any'
}
