import type { StudioConfig, StudioSelectOption } from '@/types/studio-template.types'
import { parseRetirementDifficulty } from '../_shared/retirement-theme-config'

/**
 * The ladder a retirement crossword book actually ships.
 *
 * One plain-language level replaces the four knobs the old form exposed —
 * difficulty, print style, an "advanced" answer count and the letter range
 * behind it. Those four could be set against each other (a challenge puzzle
 * with six answers, a large-print page with fourteen), and three of the four
 * are consequences of the first, so the form asked the seller to re-derive
 * what the layout already knows.
 *
 * Answer counts are *targets*. The page decides the number that actually
 * prints: `crossword/layout.ts` lowers it until the clue list still sets at
 * large-print size and the grid still has room for legible cells, so a 5 x 8
 * paperback gets a smaller puzzle rather than a cramped one.
 *
 * Every level caps answers at nine letters. That is not a style choice: the
 * clue API runs before any page geometry is known, so the words it is asked
 * for have to fit the smallest grid this app will ever lay out (9 x 9). A
 * ten-letter answer would simply be dropped by the packer on a small trim,
 * which is a worse outcome than never asking for one.
 */
export type CrosswordLevelId = 'gentle' | 'classic' | 'challenging'

export interface CrosswordLevel {
  id: CrosswordLevelId
  /** Option label in the form — short enough not to truncate in the panel. */
  label: string
  /** Answers the page aims for, before the page-size cap. */
  targetAnswers: number
  /** Below this a page is too thin to print; the run retries instead. */
  minAnswers: number
  minLetters: number
  maxLetters: number
  /** Clue length budget — what keeps a clue to one or two printed lines. */
  clueMaxChars: number
  /** Tone asked of the clue writer. */
  apiDifficulty: 'easy' | 'medium' | 'hard'
}

export const CROSSWORD_LEVELS: readonly CrosswordLevel[] = [
  {
    id: 'gentle',
    label: 'Gentle — short answers, plain clues',
    targetAnswers: 8,
    minAnswers: 6,
    minLetters: 4,
    maxLetters: 7,
    clueMaxChars: 44,
    apiDifficulty: 'easy',
  },
  {
    id: 'classic',
    label: 'Classic — the everyday puzzle',
    targetAnswers: 11,
    minAnswers: 8,
    minLetters: 4,
    maxLetters: 8,
    clueMaxChars: 52,
    apiDifficulty: 'medium',
  },
  {
    id: 'challenging',
    label: 'Challenging — a fuller grid',
    targetAnswers: 13,
    minAnswers: 9,
    minLetters: 4,
    maxLetters: 9,
    clueMaxChars: 58,
    apiDifficulty: 'hard',
  },
]

export const DEFAULT_CROSSWORD_LEVEL_ID: CrosswordLevelId = 'classic'

const LEVEL_INDEX = new Map(CROSSWORD_LEVELS.map((level) => [level.id, level]))

export const CROSSWORD_LEVEL_OPTIONS: StudioSelectOption[] = CROSSWORD_LEVELS.map(
  (level) => ({ label: level.label, value: level.id }),
)

/** Sheets saved before the ladder replaced difficulty + print style + count. */
function legacyLevelId(config: StudioConfig): CrosswordLevelId | null {
  if (config.difficulty == null) return null
  const difficulty = parseRetirementDifficulty(config.difficulty)
  if (difficulty === 'relaxed') return 'gentle'
  if (difficulty === 'challenge') return 'challenging'
  return 'classic'
}

export function parseCrosswordLevel(config: StudioConfig): CrosswordLevel {
  const chosen = LEVEL_INDEX.get(String(config.level ?? '') as CrosswordLevelId)
  if (chosen) return chosen
  const legacy = legacyLevelId(config)
  return (
    (legacy ? LEVEL_INDEX.get(legacy) : undefined) ??
    LEVEL_INDEX.get(DEFAULT_CROSSWORD_LEVEL_ID)!
  )
}
