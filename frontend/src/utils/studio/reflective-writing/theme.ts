import type { StudioConfig } from '@/types/studio-template.types'
import { CUSTOM_THEME_TEXT_MAX } from './copy'

/** Picked when the author wants no single subject — sent as an empty theme. */
export const JOURNAL_OPEN_THEME = 'general'

/**
 * The single source of truth for journal themes. The backend holds no theme
 * table: it interpolates whatever label we send, so adding a theme is an edit
 * to this list alone.
 */
export const JOURNAL_THEME_OPTIONS: { label: string; value: string }[] = [
  { label: 'A bit of everything', value: JOURNAL_OPEN_THEME },
  { label: 'Family & friends', value: 'people' },
  { label: 'Places & journeys', value: 'places' },
  { label: 'Food & home', value: 'home' },
  { label: 'Simple joys', value: 'joys' },
]

export function isCustomJournalTheme(config: StudioConfig): boolean {
  return config.customTheme === true
}

/**
 * Theme text sent to the API: the preset's own label, or the author's words.
 * Empty means "a bit of everything" — the prompt then asks for a spread.
 */
export function resolveJournalTheme(config: StudioConfig): string {
  if (isCustomJournalTheme(config)) {
    return String(config.customThemeText ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, CUSTOM_THEME_TEXT_MAX)
  }
  const value = String(config.theme ?? JOURNAL_OPEN_THEME)
  if (value === JOURNAL_OPEN_THEME) return ''
  // Unknown value (a config saved before a theme was renamed): send it as-is.
  return JOURNAL_THEME_OPTIONS.find((option) => option.value === value)?.label ?? value
}
