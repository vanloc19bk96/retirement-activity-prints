import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import type { LadderHintLevel } from './ladder'
import type { LadderWordLength } from './words'

export const WORD_LADDER_MIN_STEPS = 3
export const WORD_LADDER_MAX_STEPS = 5
export const WORD_LADDER_MAX_PER_PAGE = 3
export const WORD_LADDER_THEME_MAX_LENGTH = 120
/** Used when the seller leaves the theme blank (single sheet and book builder). */
export const WORD_LADDER_DEFAULT_THEME = 'everyday objects'

/** The theme sent to the model — never blank, so a sheet always has an angle. */
export function parseTheme(config: StudioConfig): string {
  const raw = String(config.aiTheme ?? '')
    .trim()
    .slice(0, WORD_LADDER_THEME_MAX_LENGTH)
  return raw || WORD_LADDER_DEFAULT_THEME
}

export function parseWordLength(raw: unknown): LadderWordLength {
  const value = Number(raw ?? 4)
  if (value === 3 || value === 5) return value
  return 4
}

export function parseSteps(raw: unknown): number {
  const value = Number(raw ?? 4)
  if (!Number.isFinite(value)) return 4
  return Math.min(WORD_LADDER_MAX_STEPS, Math.max(WORD_LADDER_MIN_STEPS, Math.round(value)))
}

export function parseLaddersPerPage(raw: unknown): number {
  const value = Number(raw ?? 2)
  if (!Number.isFinite(value)) return 2
  return Math.min(WORD_LADDER_MAX_PER_PAGE, Math.max(1, Math.round(value)))
}

export function parseHintLevel(raw: unknown): LadderHintLevel {
  const value = String(raw ?? 'medium')
  if (value === 'easy' || value === 'hard') return value
  return 'medium'
}

/**
 * Five-letter words sit in a thinner part of the ladder graph, so a long chain
 * of them needs a wide column — three across would print unreadably small.
 */
export function maxLaddersFor(wordLength: LadderWordLength): number {
  return wordLength === 5 ? 2 : WORD_LADDER_MAX_PER_PAGE
}

export function validateWordLadderConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  const theme = String(config.aiTheme ?? '').trim()
  if (theme.length > WORD_LADDER_THEME_MAX_LENGTH) {
    return {
      field: 'aiTheme',
      message: `Keep the theme under ${WORD_LADDER_THEME_MAX_LENGTH} characters.`,
    }
  }
  return null
}

export const WORD_LADDER_FIELDS: StudioConfigField[] = [
  {
    key: 'aiTheme',
    label: 'Theme',
    type: 'text',
    default: '',
    placeholder: 'e.g. weather, the kitchen, a day at the seaside',
    help: 'The words at the top and bottom of each ladder are written to this theme. Leave it blank for everyday words.',
  },
  {
    key: 'wordLength',
    label: 'Word length',
    type: 'select',
    default: 4,
    options: [
      { label: '3 letters (gentle)', value: 3 },
      { label: '4 letters', value: 4 },
      { label: '5 letters (hardest)', value: 5 },
    ],
  },
  {
    key: 'steps',
    label: 'Steps per ladder',
    type: 'number',
    default: 4,
    min: WORD_LADDER_MIN_STEPS,
    max: WORD_LADDER_MAX_STEPS,
    step: 1,
    helpWhen: (config) => {
      const steps = parseSteps(config.steps)
      return `${steps} changes from top to bottom, so ${steps - 1} rungs to fill in.`
    },
  },
  {
    key: 'laddersPerPage',
    label: 'Ladders per page',
    type: 'number',
    default: 2,
    min: 1,
    max: WORD_LADDER_MAX_PER_PAGE,
    step: 1,
    maxWhen: (config) => maxLaddersFor(parseWordLength(config.wordLength)),
    helpWhen: (config) =>
      parseWordLength(config.wordLength) === 5
        ? 'Five-letter ladders need a wide column — two per page keeps the boxes readable.'
        : 'Each ladder gets its own pair of words.',
  },
  {
    key: 'hintLevel',
    label: 'Given letters',
    type: 'select',
    default: 'medium',
    options: [
      { label: 'Easy — a letter in every rung', value: 'easy' },
      { label: 'Medium — a letter in some rungs', value: 'medium' },
      { label: 'Hard — only what the puzzle needs', value: 'hard' },
    ],
    help: 'Every ladder has exactly one solution at any setting; given letters only make it quicker to find.',
  },
]
