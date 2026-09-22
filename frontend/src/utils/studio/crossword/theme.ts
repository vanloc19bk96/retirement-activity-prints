/**
 * The one content decision a crossword page asks for.
 *
 * The old form asked three questions to get here — a "write my own" toggle, a
 * category, then a theme inside that category. Two of those were bookkeeping:
 * the category existed only to shorten the theme list. One flat field answers
 * the same question in one click, and its first option ("Mixed retirement
 * themes") is the one a book actually wants, because a book of twelve
 * crosswords on "Gardening" is twelve pages of the same vocabulary.
 */

import type { StudioConfig, StudioSelectOption } from '@/types/studio-template.types'
import { createRng } from '../studio-rng'
import {
  RETIREMENT_THEMES,
  getRetirementTheme,
  type RetirementThemePreset,
} from '../retirement-word-search/retirement-themes'
import {
  AI_THEME_MAX_LENGTH,
  parseWriteOwnTheme,
  resolvePresetThemeId,
} from '../_shared/retirement-theme-config'

export { AI_THEME_MAX_LENGTH }

/** Rotate a different preset in per puzzle. */
export const CROSSWORD_THEME_MIXED = 'mixed'
/** Seller types their own theme for the AI. */
export const CROSSWORD_THEME_CUSTOM = 'custom'

export const CROSSWORD_DEFAULT_THEME = CROSSWORD_THEME_MIXED

export interface CrosswordTheme {
  /** Shown as the fallback page title and used as the variety bucket. */
  label: string
  /** Plain-text theme the clue API is asked to write about. */
  prompt: string
  /** True when the seller typed it — the IP warning only applies to those. */
  custom: boolean
}

export function crosswordThemeSelectOptions(): StudioSelectOption[] {
  return [
    { label: 'Mixed retirement themes', value: CROSSWORD_THEME_MIXED },
    ...RETIREMENT_THEMES.map((theme) => ({ label: theme.label, value: theme.id })),
    { label: 'Write my own theme…', value: CROSSWORD_THEME_CUSTOM },
  ]
}

export function customCrosswordThemeText(config: StudioConfig): string {
  return String(config.customTheme ?? '')
    .trim()
    .slice(0, AI_THEME_MAX_LENGTH)
}

/**
 * Which theme field the form is showing.
 *
 * Also reads the three fields the pre-ladder form used, so a book row or bulk
 * job saved against that form still generates the theme its seller chose.
 */
export function parseCrosswordThemeChoice(config: StudioConfig): string {
  const raw = String(config.theme ?? '').trim()
  if (raw === CROSSWORD_THEME_MIXED || raw === CROSSWORD_THEME_CUSTOM) return raw
  if (getRetirementTheme(raw)) return raw
  if (raw) return CROSSWORD_DEFAULT_THEME
  // Legacy form: writeOwnTheme + retirementCategory + presetThemeId.
  if (parseWriteOwnTheme(config.writeOwnTheme)) return CROSSWORD_THEME_CUSTOM
  if (config.presetThemeId != null) return resolvePresetThemeId(config)
  return CROSSWORD_DEFAULT_THEME
}

export function isCustomCrosswordTheme(config: StudioConfig): boolean {
  return parseCrosswordThemeChoice(config) === CROSSWORD_THEME_CUSTOM
}

/**
 * Pick the rotating theme for one puzzle.
 *
 * Seeded from the puzzle's own seed, so the same sheet always redraws with the
 * same theme while consecutive pages of a book land on different ones.
 */
function mixedTheme(seed: number): RetirementThemePreset {
  const rng = createRng((seed >>> 0) ^ 0x63726f73)
  return rng.pick(RETIREMENT_THEMES)
}

export function resolveCrosswordTheme(
  config: StudioConfig,
  seed: number,
): CrosswordTheme {
  const choice = parseCrosswordThemeChoice(config)

  if (choice === CROSSWORD_THEME_CUSTOM) {
    const typed = customCrosswordThemeText(config)
    const label = typed ? typed.charAt(0).toUpperCase() + typed.slice(1) : ''
    return {
      label,
      prompt: typed || 'retirement lifestyle hobbies',
      custom: true,
    }
  }

  const preset =
    choice === CROSSWORD_THEME_MIXED ? mixedTheme(seed) : getRetirementTheme(choice)
  const label = preset?.label ?? 'Life After Work'
  return { label, prompt: `${label} retirement lifestyle`, custom: false }
}
