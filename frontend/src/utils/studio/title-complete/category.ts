import type { StudioConfig } from '@/types/studio-template.types'
import type { TitleCompleteCategory } from '@/types/studio-title-complete.types'

export const CUSTOM_CATEGORY_MAX = 80

/** Selectable presets — `mixed` remains for curated outage fallback only. */
const SELECT_CATEGORIES = ['songs', 'films', 'tv'] as const
const PRESET_CATEGORIES: TitleCompleteCategory[] = [...SELECT_CATEGORIES, 'mixed']
const PRESET_SET = new Set<string>(PRESET_CATEGORIES)

const PRESET_LABELS: Record<(typeof SELECT_CATEGORIES)[number], string> = {
  songs: 'Songs',
  films: 'Films',
  tv: 'TV shows',
}

/** True when the author opted to type a category instead of using the select. */
export function isCustomCategory(config: StudioConfig): boolean {
  return config.customCategory === true
}

export function isPresetCategory(value: string): value is TitleCompleteCategory {
  return PRESET_SET.has(value)
}

/**
 * Category sent to the AI — preset key or a short free-text focus phrase.
 * Curated fallback maps unknown phrases to `mixed`.
 */
export function resolveCategory(config: StudioConfig): string {
  if (isCustomCategory(config)) {
    const custom = String(config.customCategoryText ?? '')
      .trim()
      .slice(0, CUSTOM_CATEGORY_MAX)
    return custom || 'mixed'
  }
  const raw = String(config.category ?? 'songs').trim()
  if (raw === 'songs' || raw === 'films' || raw === 'tv') return raw
  // Legacy saved sheets may still say `mixed`; keep that bank key for AI/fallback.
  if (raw === 'mixed') return 'mixed'
  return 'songs'
}

/** Human-readable category printed under the instruction on the worksheet. */
export function categoryDisplayLabel(config: StudioConfig): string {
  if (isCustomCategory(config)) {
    const custom = String(config.customCategoryText ?? '')
      .trim()
      .slice(0, CUSTOM_CATEGORY_MAX)
    return custom || 'Titles'
  }
  const raw = String(config.category ?? 'songs').trim()
  if (raw === 'songs' || raw === 'films' || raw === 'tv') {
    return PRESET_LABELS[raw]
  }
  if (raw === 'mixed') return 'Songs, films & TV'
  return raw || 'Titles'
}

/** Preset bank key for outage fallback (custom phrases have no dedicated bank). */
export function resolveFallbackCategory(config: StudioConfig): TitleCompleteCategory {
  const resolved = resolveCategory(config)
  return isPresetCategory(resolved) ? resolved : 'mixed'
}
