import type { StudioConfig, StudioSelectOption } from '@/types/studio-template.types'
import type { WordSearchDifficulty } from '@/utils/puzzles/word-search-core'

/**
 * The one difficulty decision a trivia clue page asks for.
 *
 * This page carries more than a plain word search does — a numbered clue for
 * every answer, set as prose — so the levers a seller could plausibly be asked
 * about are the same ones and the answers are different. Grid size, clue count
 * and type sizes are not on the form: they come from `layout.ts`, which can see
 * the trim in Settings, and the level's help line reports what they produced.
 *
 * Clue counts are deliberately lower than the plain word search's word counts.
 * A word bank entry is one short run; a clue is a sentence that wraps, and ten
 * of them is already a third of a 6 x 9 page. A grid crushed to make room for a
 * twentieth clue is a worse page than one with twelve clues and a grid a reader
 * can see.
 *
 * Every level caps answers at nine letters and floors them at four. The floor
 * is not a style choice: three-letter runs turn up by accident in the filler,
 * so a page that lists one has two right answers and a key that circles the
 * wrong one. The ceiling is what keeps the smallest trim solvable — an answer
 * cannot be longer than the grid is wide.
 */
export type TriviaLevelId = 'gentle' | 'classic' | 'challenging'

export interface TriviaLevel {
  id: TriviaLevelId
  /** Option label in the form — short enough not to truncate in the panel. */
  label: string
  /**
   * Which headings answers may run in. Reuses the shared placement engine's
   * ladder: `easy` is across + down, `medium` adds the two forward diagonals,
   * `hard` opens all eight and lets answers be written backwards.
   */
  directions: WordSearchDifficulty
  /** The sentence under the heading. Says what to do, then where to look. */
  instruction: string
  /** Clues the page aims for, before the page-size cap. */
  targetClues: number
  /** Below this the sheet is too thin to print; the page refuses instead. */
  minClues: number
  minLetters: number
  maxLetters: number
  /**
   * Clue length budget, in characters — what keeps a clue to one or two
   * printed lines in a column half the page wide.
   */
  clueMaxChars: number
  /** Tone asked of the clue writer. */
  apiDifficulty: 'easy' | 'medium' | 'hard'
}

export const TRIVIA_LEVELS: readonly TriviaLevel[] = [
  {
    id: 'gentle',
    label: 'Gentle — short answers, plain clues',
    directions: 'easy',
    instruction:
      'Answer each clue, then find that answer in the grid. Answers read across and down.',
    targetClues: 8,
    minClues: 6,
    minLetters: 4,
    maxLetters: 7,
    clueMaxChars: 46,
    apiDifficulty: 'easy',
  },
  {
    id: 'classic',
    label: 'Classic — the everyday puzzle',
    directions: 'medium',
    instruction:
      'Answer each clue, then find that answer in the grid. Answers read across, down and diagonally.',
    targetClues: 11,
    minClues: 7,
    minLetters: 4,
    maxLetters: 8,
    clueMaxChars: 54,
    apiDifficulty: 'medium',
  },
  {
    id: 'challenging',
    label: 'Challenging — every direction, some backwards',
    directions: 'hard',
    instruction:
      'Answer each clue, then find that answer in the grid. Answers read in any direction, even backwards.',
    targetClues: 14,
    minClues: 8,
    minLetters: 4,
    maxLetters: 9,
    clueMaxChars: 60,
    apiDifficulty: 'hard',
  },
]

export const DEFAULT_TRIVIA_LEVEL_ID: TriviaLevelId = 'classic'

const LEVEL_INDEX = new Map(TRIVIA_LEVELS.map((level) => [level.id, level]))

export const TRIVIA_LEVEL_OPTIONS: StudioSelectOption[] = TRIVIA_LEVELS.map((level) => ({
  label: level.label,
  value: level.id,
}))

/** Sheets saved against a form that spoke in difficulties rather than levels. */
function legacyLevelId(config: StudioConfig): TriviaLevelId | null {
  const difficulty = config.difficulty
  if (difficulty == null) return null
  if (difficulty === 'easy' || difficulty === 'relaxed') return 'gentle'
  if (difficulty === 'hard' || difficulty === 'challenge') return 'challenging'
  return 'classic'
}

export function parseTriviaLevel(config: StudioConfig): TriviaLevel {
  const chosen = LEVEL_INDEX.get(String(config.level ?? '') as TriviaLevelId)
  if (chosen) return chosen
  const legacy = legacyLevelId(config)
  return (
    (legacy ? LEVEL_INDEX.get(legacy) : undefined) ??
    LEVEL_INDEX.get(DEFAULT_TRIVIA_LEVEL_ID)!
  )
}

/** What the page tells the solver, unless the heading strip is switched off. */
export function triviaInstruction(config: StudioConfig): string {
  if (config.showInstructions === false) return ''
  return parseTriviaLevel(config).instruction
}
