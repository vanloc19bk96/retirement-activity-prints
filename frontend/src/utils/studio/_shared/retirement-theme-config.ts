/**
 * Retirement theme / difficulty form helpers shared by AI content templates.
 *
 * These lived in `crossword/config.ts` while the crossword was the only game
 * with a category → theme picker. Missing Vowels then imported them from
 * there, which left one game's form contract owned by another game's module.
 * The crossword has since moved to a single flat theme field, so the shared
 * pieces live here and each game's config file owns only its own form.
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
  themesForCategory,
  RETIREMENT_CATEGORIES,
  RETIREMENT_THEMES,
  type RetirementThemeCategory,
} from '../retirement-word-search/retirement-themes'

/** Longest theme a seller may type before the prompt is trimmed. */
export const AI_THEME_MAX_LENGTH = 120

export const RETIREMENT_DEFAULT_THEME_LABEL = 'Life After Work'

export type RetirementDifficulty = 'relaxed' | 'classic' | 'challenge'
export type RetirementPrintStyle = 'large-print' | 'standard'

export function parseRetirementDifficulty(raw: unknown): RetirementDifficulty {
  const value = String(raw ?? 'classic')
  if (value === 'relaxed' || value === 'classic' || value === 'challenge') return value
  if (value === 'easy') return 'relaxed'
  if (value === 'hard') return 'challenge'
  return 'classic'
}

export function parsePrintStyle(raw: unknown): RetirementPrintStyle {
  return raw === 'standard' ? 'standard' : 'large-print'
}

/** UI difficulty → the labels the Gemini prompt and API schema understand. */
export function toApiDifficulty(
  difficulty: RetirementDifficulty,
): 'easy' | 'medium' | 'hard' {
  if (difficulty === 'relaxed') return 'easy'
  if (difficulty === 'challenge') return 'hard'
  return 'medium'
}

export function parseWriteOwnTheme(raw: unknown): boolean {
  return raw === true
}

export function categoryLabel(category: RetirementThemeCategory): string {
  return (
    RETIREMENT_CATEGORIES.find((meta) => meta.id === category)?.label ??
    RETIREMENT_CATEGORIES[0]!.label
  )
}

export function categorySelectOptions(): StudioSelectOption[] {
  return RETIREMENT_CATEGORIES.map((meta) => ({ label: meta.label, value: meta.id }))
}

export function themeSelectOptions(
  category: RetirementThemeCategory,
): StudioSelectOption[] {
  return themesForCategory(category).map((theme) => ({
    label: theme.label,
    value: theme.id,
  }))
}

/** Preset id for a category → theme pair, falling back to the category default. */
export function resolvePresetThemeId(config: StudioConfig): string {
  const category = parseRetirementCategory(config.retirementCategory)
  const theme = getRetirementTheme(String(config.presetThemeId ?? '').trim())
  if (theme && theme.category === category) return theme.id
  return defaultThemeId(category)
}

function customThemeText(config: StudioConfig): string {
  return String(config.customTheme ?? config.customThemeText ?? '')
    .trim()
    .slice(0, AI_THEME_MAX_LENGTH)
}

/** Human label for the chosen theme — used for page titles and variety keys. */
export function aiThemeLabel(config: StudioConfig): string {
  if (parseWriteOwnTheme(config.writeOwnTheme)) {
    const custom = customThemeText(config)
    if (!custom) return ''
    return custom.charAt(0).toUpperCase() + custom.slice(1)
  }
  return (
    getRetirementTheme(resolvePresetThemeId(config))?.label ??
    RETIREMENT_DEFAULT_THEME_LABEL
  )
}

/** Prompt text sent to the content API. */
export function resolveAiThemePrompt(config: StudioConfig): string {
  if (parseWriteOwnTheme(config.writeOwnTheme)) {
    return customThemeText(config) || 'retirement lifestyle hobbies'
  }
  const theme = getRetirementTheme(resolvePresetThemeId(config))
  if (theme) return `${theme.label} retirement lifestyle`
  return 'retirement lifestyle hobbies'
}

export function validateRetirementThemeConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  if (parseWriteOwnTheme(config.writeOwnTheme)) {
    const theme = customThemeText(config)
    if (!theme) {
      return {
        field: 'customTheme',
        message: 'Enter a custom retirement theme, or turn off Write my own theme.',
      }
    }
    if (String(config.customTheme ?? config.customThemeText ?? '').trim().length > AI_THEME_MAX_LENGTH) {
      return {
        field: 'customTheme',
        message: `Keep the theme under ${AI_THEME_MAX_LENGTH} characters.`,
      }
    }
    return null
  }

  if (!getRetirementTheme(resolvePresetThemeId(config))) {
    return { field: 'presetThemeId', message: 'Choose a retirement theme.' }
  }
  return null
}

/* ------------------------------------------------------------------ *
 * Flat theme picker
 *
 * The category → theme pair above is two questions to answer one: the
 * category exists only to shorten the theme list. A single field asks the
 * same thing in one click, and its first option rotates the theme per
 * puzzle — which is what a *book* wants, because twelve pages on
 * "Gardening" is twelve pages of the same vocabulary.
 *
 * The crossword shipped this shape first, in its own module. These are the
 * game-agnostic pieces of it, so the next game to adopt the flat picker
 * does not have to import one game's form contract from another's.
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
 * Validation for the flat picker — the category → theme form has its own above.
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
