import type { StudioConfig, StudioConfigValidationError } from '@/types/studio-template.types'
import {
  defaultThemeId,
  getRetirementTheme,
  parseRetirementCategory,
  themesForCategory,
  type RetirementThemeCategory,
} from '../retirement-word-search/retirement-themes'

export type RetirementCrosswordDifficulty = 'relaxed' | 'classic' | 'challenge'
export type RetirementPrintStyle = 'large-print' | 'standard'

export const AI_THEME_MAX_LENGTH = 120
export const CROSSWORD_ANSWER_COUNT_MIN = 6
export const CROSSWORD_ANSWER_COUNT_MAX = 14
/** Hard ceiling for one printable interlocking grid + clue band. */
export const CROSSWORD_PACKING_BUDGET = 20
export const RETIREMENT_DEFAULT_THEME_LABEL = 'Life After Work'

export function parseWriteOwnTheme(raw: unknown): boolean {
  return raw === true
}

export function parseRetirementDifficulty(raw: unknown): RetirementCrosswordDifficulty {
  const value = String(raw ?? 'classic')
  if (value === 'relaxed' || value === 'classic' || value === 'challenge') return value
  if (value === 'easy') return 'relaxed'
  if (value === 'hard') return 'challenge'
  if (value === 'medium') return 'classic'
  return 'classic'
}

export function parsePrintStyle(raw: unknown): RetirementPrintStyle {
  return raw === 'standard' ? 'standard' : 'large-print'
}

/** Map UI difficulty → API / Gemini prompt labels. */
export function toApiDifficulty(
  difficulty: RetirementCrosswordDifficulty,
): 'easy' | 'medium' | 'hard' {
  if (difficulty === 'relaxed') return 'easy'
  if (difficulty === 'challenge') return 'hard'
  return 'medium'
}

export function retirementAnswerCount(
  difficulty: RetirementCrosswordDifficulty,
  printStyle: RetirementPrintStyle,
): number {
  if (printStyle === 'standard') {
    return { relaxed: 9, classic: 11, challenge: 13 }[difficulty]
  }
  return { relaxed: 8, classic: 10, challenge: 12 }[difficulty]
}

/** Spec §42 — below these, regenerate instead of shipping a thin grid. */
export function minimumPublishCount(difficulty: RetirementCrosswordDifficulty): number {
  return { relaxed: 7, classic: 9, challenge: 10 }[difficulty]
}

export function letterBoundsForDifficulty(
  difficulty: RetirementCrosswordDifficulty,
): { min: number; max: number } {
  if (difficulty === 'relaxed') return { min: 4, max: 8 }
  if (difficulty === 'challenge') return { min: 5, max: 12 }
  return { min: 4, max: 10 }
}

export function clueMaxChars(difficulty: RetirementCrosswordDifficulty): number {
  return { relaxed: 55, classic: 65, challenge: 70 }[difficulty]
}

export function parseAnswerCount(
  raw: unknown,
  difficulty: RetirementCrosswordDifficulty,
  printStyle: RetirementPrintStyle,
): number {
  const auto = retirementAnswerCount(difficulty, printStyle)
  if (raw === 'auto' || raw === '' || raw == null) return auto
  const n = Number(raw)
  if (!Number.isFinite(n)) return auto
  return Math.min(
    CROSSWORD_ANSWER_COUNT_MAX,
    Math.max(CROSSWORD_ANSWER_COUNT_MIN, Math.round(n)),
  )
}

/** Spec §19 — oversample so the packer can substitute stubborn answers. */
export function candidatePoolSize(targetCount: number): number {
  return Math.max(Math.ceil(targetCount * 2.5), targetCount + 12)
}

export function packingBudget(): number {
  return CROSSWORD_PACKING_BUDGET
}

export function resolvePresetThemeId(config: StudioConfig): string {
  const category = parseRetirementCategory(config.retirementCategory)
  const raw = String(config.presetThemeId ?? '').trim()
  const theme = getRetirementTheme(raw)
  if (theme && theme.category === category) return theme.id
  return defaultThemeId(category)
}

export function aiThemeLabel(config: StudioConfig): string {
  if (parseWriteOwnTheme(config.writeOwnTheme)) {
    const custom = String(config.customTheme ?? config.customThemeText ?? '')
      .trim()
      .slice(0, AI_THEME_MAX_LENGTH)
    if (!custom) return ''
    return custom.charAt(0).toUpperCase() + custom.slice(1)
  }
  return getRetirementTheme(resolvePresetThemeId(config))?.label ?? RETIREMENT_DEFAULT_THEME_LABEL
}

/** Prompt text sent to the crossword-clues API. */
export function resolveAiThemePrompt(config: StudioConfig): string {
  if (parseWriteOwnTheme(config.writeOwnTheme)) {
    const custom = String(config.customTheme ?? config.customThemeText ?? '')
      .trim()
      .slice(0, AI_THEME_MAX_LENGTH)
    return custom || 'retirement lifestyle hobbies'
  }
  const theme = getRetirementTheme(resolvePresetThemeId(config))
  if (theme) return `${theme.label} retirement lifestyle`
  return 'retirement lifestyle hobbies'
}

export function categoryLabel(category: RetirementThemeCategory): string {
  const labels: Record<RetirementThemeCategory, string> = {
    'retirement-life': 'Retirement Life',
    'travel-adventure': 'Travel & Adventure',
    'hobbies-leisure': 'Hobbies & Leisure',
    'career-farewell': 'Career & Farewell',
    nostalgia: 'Nostalgia',
    'friends-family': 'Friends & Family',
    'active-retirement': 'Active Retirement',
    'home-leisure': 'Home & Leisure',
  }
  return labels[category]
}

export function buildInstruction(): string {
  return 'Solve each clue and fill the answers into the crossword grid.'
}

export function categorySelectOptions() {
  return [
    { label: 'Retirement Life', value: 'retirement-life' },
    { label: 'Travel & Adventure', value: 'travel-adventure' },
    { label: 'Hobbies & Leisure', value: 'hobbies-leisure' },
    { label: 'Career & Farewell', value: 'career-farewell' },
    { label: 'Nostalgia', value: 'nostalgia' },
    { label: 'Friends & Family', value: 'friends-family' },
    { label: 'Active Retirement', value: 'active-retirement' },
    { label: 'Home & Leisure', value: 'home-leisure' },
  ]
}

export function themeSelectOptions(category: RetirementThemeCategory) {
  return themesForCategory(category).map((t) => ({ label: t.label, value: t.id }))
}

export function answerCountSelectOptions() {
  const options: { label: string; value: string | number }[] = [
    { label: 'Auto (from difficulty)', value: 'auto' },
  ]
  for (let n = CROSSWORD_ANSWER_COUNT_MIN; n <= CROSSWORD_ANSWER_COUNT_MAX; n++) {
    options.push({ label: String(n), value: n })
  }
  return options
}

export function validateRetirementCrosswordConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  if (parseWriteOwnTheme(config.writeOwnTheme)) {
    const theme = String(config.customTheme ?? config.customThemeText ?? '').trim()
    if (!theme) {
      return {
        field: 'customTheme',
        message: 'Enter a custom retirement theme, or turn off Write my own theme.',
      }
    }
    if (theme.length > AI_THEME_MAX_LENGTH) {
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
