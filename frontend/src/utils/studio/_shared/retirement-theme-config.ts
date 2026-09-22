/**
 * The retirement theme picker every AI content template asks its question with.
 *
 * It began in `crossword/config.ts` as a category field, a theme field and a
 * custom-theme box — three questions to answer one, and a category list that
 * existed only to shorten the theme list. Missing Vowels imported that shape
 * from the crossword's own module, which left one game's form contract owned by
 * another game's file, and a book could not run both games on one theme.
 *
 * Every game has since moved to the flat picker at the foot of this file. What
 * survives of the old shape here is only what a *saved* sheet still needs:
 * `parseRetirementThemeChoice` reads the three legacy fields so a book row or
 * bulk job written against the old form keeps generating the theme its seller
 * chose, rather than silently falling back to mixed.
 */

import type {
  StudioConfig,
  StudioConfigValidationError,
  StudioSelectOption,
} from '@/types/studio-template.types'
import { createRng } from '../studio-rng'
import {
  defaultThemeId,
  getRetirementTheme,
  parseRetirementCategory,
  RETIREMENT_THEMES,
} from '../retirement-word-search/retirement-themes'

/** Longest theme a seller may type before the prompt is trimmed. */
export const AI_THEME_MAX_LENGTH = 120

export const RETIREMENT_DEFAULT_THEME_LABEL = 'Life After Work'

export type RetirementDifficulty = 'relaxed' | 'classic' | 'challenge'

export function parseRetirementDifficulty(raw: unknown): RetirementDifficulty {
  const value = String(raw ?? 'classic')
  if (value === 'relaxed' || value === 'classic' || value === 'challenge') return value
  if (value === 'easy') return 'relaxed'
  if (value === 'hard') return 'challenge'
  return 'classic'
}

export function parseWriteOwnTheme(raw: unknown): boolean {
  return raw === true
}

/** Legacy only: preset id for a saved category → theme pair. */
export function resolvePresetThemeId(config: StudioConfig): string {
  const category = parseRetirementCategory(config.retirementCategory)
  const theme = getRetirementTheme(String(config.presetThemeId ?? '').trim())
  if (theme && theme.category === category) return theme.id
  return defaultThemeId(category)
}

/* ------------------------------------------------------------------ *
 * Flat theme picker — the one the forms actually show.
 *
 * One field, one click, and its first option rotates the theme per puzzle,
 * which is what a *book* wants: twelve pages on "Gardening" is twelve pages
 * of the same vocabulary.
 * ------------------------------------------------------------------ */

/** Rotate a different preset theme in for every puzzle. */
export const RETIREMENT_THEME_MIXED = 'mixed'
/** Seller types their own theme for the AI. */
export const RETIREMENT_THEME_CUSTOM = 'custom'

export interface ResolvedRetirementTheme {
  /** Shown as the fallback page title and used as the variety bucket. */
  label: string
  /** Plain-text theme the content API is asked to write about. */
  prompt: string
  /** True when the seller typed it — the IP warning only applies to those. */
  custom: boolean
}

export function retirementThemeSelectOptions(
  mixedLabel = 'Mixed retirement themes',
  customLabel = 'Write my own theme…',
): StudioSelectOption[] {
  return [
    { label: mixedLabel, value: RETIREMENT_THEME_MIXED },
    ...RETIREMENT_THEMES.map((theme) => ({ label: theme.label, value: theme.id })),
    { label: customLabel, value: RETIREMENT_THEME_CUSTOM },
  ]
}

/**
 * Which theme the form is showing, in the flat `theme` field.
 *
 * Also reads the three fields the category → theme form used, so a book row
 * or bulk job saved against that form still generates the theme its seller
 * chose rather than silently falling back to mixed.
 */
export function parseRetirementThemeChoice(config: StudioConfig): string {
  const raw = String(config.theme ?? '').trim()
  if (raw === RETIREMENT_THEME_MIXED || raw === RETIREMENT_THEME_CUSTOM) return raw
  if (getRetirementTheme(raw)) return raw
  if (raw) return RETIREMENT_THEME_MIXED
  // Legacy form: writeOwnTheme + retirementCategory + presetThemeId.
  if (parseWriteOwnTheme(config.writeOwnTheme)) return RETIREMENT_THEME_CUSTOM
  if (config.presetThemeId != null) return resolvePresetThemeId(config)
  return RETIREMENT_THEME_MIXED
}

export function isCustomRetirementTheme(config: StudioConfig): boolean {
  return parseRetirementThemeChoice(config) === RETIREMENT_THEME_CUSTOM
}

/** What the seller typed, trimmed to the prompt budget. */
export function customRetirementThemeText(config: StudioConfig): string {
  return String(config.customTheme ?? config.customThemeText ?? '')
    .trim()
    .slice(0, AI_THEME_MAX_LENGTH)
}

/**
 * The theme one puzzle is written for.
 *
 * `mixed` is seeded from the puzzle's own seed, so the same sheet always
 * redraws with the same theme while consecutive pages of a book land on
 * different ones. `salt` separates games: the same seed must not hand the
 * crossword and the cryptogram on facing pages the same theme.
 */
export function resolveRetirementTheme(
  config: StudioConfig,
  seed: number,
  salt: number,
): ResolvedRetirementTheme {
  const choice = parseRetirementThemeChoice(config)

  if (choice === RETIREMENT_THEME_CUSTOM) {
    const typed = customRetirementThemeText(config)
    return {
      label: typed ? typed.charAt(0).toUpperCase() + typed.slice(1) : '',
      prompt: typed || 'retirement lifestyle hobbies',
      custom: true,
    }
  }

  const preset =
    choice === RETIREMENT_THEME_MIXED
      ? createRng(((seed >>> 0) ^ (salt >>> 0)) >>> 0).pick(RETIREMENT_THEMES)
      : getRetirementTheme(choice)
  const label = preset?.label ?? RETIREMENT_DEFAULT_THEME_LABEL
  return { label, prompt: `${label} retirement lifestyle`, custom: false }
}

/**
 * Validation for the flat picker.
 *
 * `subject` is what the theme will be written into on this game's page, so the
 * empty-field message names it. "Enter a theme for the sayings" under a form
 * that prints scrambled words tells a seller the panel belongs to some other
 * game.
 */
export function validateRetirementThemeChoice(
  config: StudioConfig,
  subject = 'sayings',
): StudioConfigValidationError | null {
  if (!isCustomRetirementTheme(config)) return null
  const typed = String(config.customTheme ?? '').trim()
  if (!typed) {
    return { field: 'customTheme', message: `Enter a theme for the ${subject}.` }
  }
  if (typed.length > AI_THEME_MAX_LENGTH) {
    return {
      field: 'customTheme',
      message: `Keep the theme under ${AI_THEME_MAX_LENGTH} characters.`,
    }
  }
  return null
}
