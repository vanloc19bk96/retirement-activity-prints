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
import {
  defaultThemeId,
  getRetirementTheme,
  parseRetirementCategory,
  themesForCategory,
  RETIREMENT_CATEGORIES,
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
