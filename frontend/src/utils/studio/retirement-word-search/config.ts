import type { StudioConfig, StudioConfigValidationError } from '@/types/studio-template.types'
import {
  packingBudget,
  sanitizeWordEntries,
  type WordSearchDifficulty,
} from '@/utils/puzzles/word-search-core'
import {
  defaultThemeId,
  getRetirementTheme,
  parseRetirementCategory,
  themesForCategory,
  type RetirementThemeCategory,
} from './retirement-themes'

export type RetirementWordSearchSource = 'ai' | 'custom'
export type RetirementDifficulty = 'relaxed' | 'classic' | 'challenge'
export type RetirementPrintStyle = 'large-print' | 'standard'

export const MIN_GRID = 8
export const MAX_GRID = 15
/** Smallest count that fills the word-bank columns evenly (2×3). */
export const MIN_WORDS = 6
/** Retirement sheets prefer readability over density (challenge tops ~16). */
export const MAX_WORDS = 16
export const MIN_WORD_LETTERS = 4
export const CUSTOM_MIN_WORD_LETTERS = 3
export const AI_THEME_MAX_LENGTH = 120
/** Never fall back to Memory's “everyday objects”. */
export const RETIREMENT_DEFAULT_AI_THEME = 'retirement lifestyle hobbies'

/**
 * Word-bank column count — must stay in sync with draw so select options
 * only offer counts that fill every column (no 3+2 leftover rows).
 */
export function wordBankColumnCount(wordCount: number): number {
  if (wordCount <= 8) return 2
  if (wordCount <= 14) return 3
  return 4
}

export function isBalancedWordBankCount(wordCount: number): boolean {
  if (!Number.isFinite(wordCount) || wordCount < MIN_WORDS || wordCount > MAX_WORDS) {
    return false
  }
  const n = Math.round(wordCount)
  return n % wordBankColumnCount(n) === 0
}

/** Selectable word counts that fill the word-bank grid evenly. */
export function balancedWordCounts(maxAllowed = MAX_WORDS): number[] {
  const cap = Math.min(MAX_WORDS, Math.max(0, Math.floor(maxAllowed)))
  const out: number[] = []
  for (let n = MIN_WORDS; n <= cap; n++) {
    if (isBalancedWordBankCount(n)) out.push(n)
  }
  return out
}

/** Snap to the nearest balanced count that still fits the packing budget. */
export function snapToBalancedWordCount(requested: number, maxAllowed: number): number {
  const candidates = balancedWordCounts(maxAllowed)
  if (candidates.length === 0) {
    return Math.max(1, Math.min(MAX_WORDS, Math.floor(maxAllowed)))
  }
  const target = Math.round(requested)
  let best = candidates[0]!
  let bestDist = Math.abs(best - target)
  for (let i = 1; i < candidates.length; i++) {
    const n = candidates[i]!
    const dist = Math.abs(n - target)
    // Prefer denser on a tie so challenge stays packed when budget allows.
    if (dist < bestDist || (dist === bestDist && n > best)) {
      best = n
      bestDist = dist
    }
  }
  return best
}

export function parseSource(raw: unknown): RetirementWordSearchSource {
  if (raw === 'custom') return 'custom'
  return 'ai'
}

export function parseWriteOwnTheme(raw: unknown): boolean {
  return raw === true
}

export function parseRetirementDifficulty(raw: unknown): RetirementDifficulty {
  const value = String(raw ?? 'classic')
  if (value === 'relaxed' || value === 'classic' || value === 'challenge') return value
  // Legacy Memory labels still map cleanly.
  if (value === 'easy') return 'relaxed'
  if (value === 'hard') return 'challenge'
  if (value === 'medium') return 'classic'
  return 'classic'
}

/** Engine difficulty — keep DFS / mix targets on the shared core. */
export function toEngineDifficulty(difficulty: RetirementDifficulty): WordSearchDifficulty {
  if (difficulty === 'relaxed') return 'easy'
  if (difficulty === 'challenge') return 'hard'
  return 'medium'
}

export function parsePrintStyle(raw: unknown): RetirementPrintStyle {
  return raw === 'standard' ? 'standard' : 'large-print'
}

export function retirementGridSize(
  difficulty: RetirementDifficulty,
  printStyle: RetirementPrintStyle,
): number {
  if (printStyle === 'large-print') {
    return { relaxed: 10, classic: 12, challenge: 14 }[difficulty]
  }
  return { relaxed: 11, classic: 13, challenge: 15 }[difficulty]
}

export function retirementWordCount(difficulty: RetirementDifficulty): number {
  // All defaults must be balanced word-bank fills (2/3/4 columns).
  return { relaxed: 8, classic: 12, challenge: 16 }[difficulty]
}

export function retirementMaxLetters(
  difficulty: RetirementDifficulty,
  printStyle: RetirementPrintStyle,
): number {
  if (difficulty === 'challenge') return 12
  if (printStyle === 'large-print') return difficulty === 'relaxed' ? 8 : 10
  return difficulty === 'relaxed' ? 9 : 11
}

export function parseGridSize(
  raw: unknown,
  difficulty: RetirementDifficulty,
  printStyle: RetirementPrintStyle,
): number {
  if (raw === 'auto' || raw === '' || raw == null) {
    return retirementGridSize(difficulty, printStyle)
  }
  const n = Number(raw)
  if (!Number.isFinite(n)) return retirementGridSize(difficulty, printStyle)
  return Math.min(MAX_GRID, Math.max(MIN_GRID, Math.round(n)))
}

export function parseWordCount(
  raw: unknown,
  difficulty: RetirementDifficulty,
  gridSize: number,
): number {
  const budget = packingBudget(gridSize)
  const auto = snapToBalancedWordCount(retirementWordCount(difficulty), budget)
  if (raw === 'auto' || raw === '' || raw == null) return auto
  const n = Number(raw)
  if (!Number.isFinite(n)) return auto
  return snapToBalancedWordCount(n, budget)
}

export function resolvePresetThemeId(config: StudioConfig): string {
  const category = parseRetirementCategory(config.retirementCategory)
  const raw = String(config.presetThemeId ?? '').trim()
  const theme = getRetirementTheme(raw)
  if (theme && theme.category === category) return theme.id
  return defaultThemeId(category)
}

/** Page-title / variety label for the active AI theme mode. */
export function aiThemeLabel(config: StudioConfig): string {
  if (parseWriteOwnTheme(config.writeOwnTheme)) {
    const custom = String(config.customTheme ?? config.aiTheme ?? '')
      .trim()
      .slice(0, AI_THEME_MAX_LENGTH)
    if (!custom) return ''
    return custom.charAt(0).toUpperCase() + custom.slice(1)
  }
  return getRetirementTheme(resolvePresetThemeId(config))?.label ?? ''
}

/** Prompt text sent to the theme-words API. */
export function resolveAiThemePrompt(config: StudioConfig): string {
  if (parseWriteOwnTheme(config.writeOwnTheme)) {
    const custom = String(config.customTheme ?? config.aiTheme ?? '')
      .trim()
      .slice(0, AI_THEME_MAX_LENGTH)
    return custom || RETIREMENT_DEFAULT_AI_THEME
  }
  const theme = getRetirementTheme(resolvePresetThemeId(config))
  if (theme) return `${theme.label} retirement lifestyle`
  return RETIREMENT_DEFAULT_AI_THEME
}

export function buildInstruction(difficulty: RetirementDifficulty): string {
  if (difficulty === 'relaxed') {
    return 'Find and circle the words. They appear across or down.'
  }
  if (difficulty === 'challenge') {
    return 'Find and circle the words. They may run in any direction, and some are backwards.'
  }
  return 'Find and circle the words. They may appear across, down, or diagonally.'
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

export function validateRetirementWordSearchConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  const difficulty = parseRetirementDifficulty(config.difficulty)
  const printStyle = parsePrintStyle(config.printStyle)
  const gridSize = parseGridSize(config.gridSize, difficulty, printStyle)
  const budget = packingBudget(gridSize)
  const source = parseSource(config.source)
  const maxLetters = Math.min(gridSize, retirementMaxLetters(difficulty, printStyle))

  if (source === 'custom') {
    const entries = sanitizeWordEntries(config.words ?? config.customWords, {
      gridSize,
      minLetters: CUSTOM_MIN_WORD_LETTERS,
      maxLetters,
    })
    if (entries.length < 3) {
      return {
        field: 'words',
        message: `Enter at least 3 words (${CUSTOM_MIN_WORD_LETTERS}–${maxLetters} letters, A–Z).`,
      }
    }
    if (entries.length > budget) {
      return {
        field: 'words',
        message: `A ${gridSize}×${gridSize} grid fits at most ${budget} words. Remove ${entries.length - budget}, or enlarge the grid.`,
      }
    }
    return null
  }

  if (parseWriteOwnTheme(config.writeOwnTheme)) {
    const theme = String(config.customTheme ?? config.aiTheme ?? '').trim()
    if (theme.length > AI_THEME_MAX_LENGTH) {
      return {
        field: 'customTheme',
        message: `Keep the theme under ${AI_THEME_MAX_LENGTH} characters.`,
      }
    }
  } else if (!getRetirementTheme(resolvePresetThemeId(config))) {
    return { field: 'presetThemeId', message: 'Choose a retirement theme.' }
  }

  const rawWordCount = config.wordCount
  if (rawWordCount !== 'auto' && rawWordCount !== '' && rawWordCount != null) {
    const requested = Number(rawWordCount)
    if (Number.isFinite(requested) && requested > budget) {
      return {
        field: 'wordCount',
        message: `A ${gridSize}×${gridSize} grid fits at most ${budget} words.`,
      }
    }
  }
  return null
}
