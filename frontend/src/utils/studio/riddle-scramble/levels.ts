import type { StudioConfig, StudioSelectOption } from '@/types/studio-template.types'

/**
 * The one difficulty decision a Riddle Scramble page asks for.
 *
 * It settles three things at once, and that is the reason it is a single
 * field. The riddle answer's length *is* the number of words on the page —
 * one marked letter per word — so "how many words" and "how long an answer"
 * are the same question asked twice, and a form that asked both could be
 * answered inconsistently. The word band comes along with it because six
 * nine-letter scrambles beside a six-letter answer is a different puzzle from
 * four five-letter ones, not a differently sized one.
 *
 * What the level does *not* decide is how big anything prints. `layout.ts`
 * derives that from the trim in Settings, and the level's help line reports
 * what came out, so the form never promises a page it cannot set.
 */
export type RiddleScrambleLevelId = 'gentle' | 'classic' | 'challenging'

export interface RiddleScrambleLevel {
  id: RiddleScrambleLevelId
  /** Option label in the form — short enough not to truncate in the panel. */
  label: string
  /**
   * Letters in the riddle answer, and therefore words printed on the page.
   *
   * Exact, not a range. Every page of one book run holds this many rows, so a
   * reader flicking through sees a book rather than a pile of worksheets.
   */
  answerLetters: number
  /** Letter band asked of the writer; mirrors the API's own range. */
  minLetters: number
  maxLetters: number
  /**
   * Shuffle so no letter keeps its original seat.
   *
   * Left to chance, a seven-letter scramble holds two or three letters in
   * place often enough to matter, and a reader who spots GARD--- reads the
   * answer off the prompt. Only the hardest level asks for it: on an easy page
   * a partly familiar shape is a kindness, not a leak.
   */
  deranged: boolean
}

export const RIDDLE_SCRAMBLE_LEVELS: readonly RiddleScrambleLevel[] = [
  {
    id: 'gentle',
    label: 'Gentle — 4 short words',
    answerLetters: 4,
    minLetters: 4,
    maxLetters: 6,
    deranged: false,
  },
  {
    id: 'classic',
    label: 'Classic — 5 words',
    answerLetters: 5,
    minLetters: 5,
    maxLetters: 7,
    deranged: false,
  },
  {
    id: 'challenging',
    label: 'Challenging — 6 longer words',
    answerLetters: 6,
    minLetters: 6,
    maxLetters: 9,
    deranged: true,
  },
]

export const DEFAULT_RIDDLE_SCRAMBLE_LEVEL_ID: RiddleScrambleLevelId = 'classic'

/** Longest answer any level asks for — what the riddle band is sized against. */
export const MAX_RIDDLE_ANSWER_LETTERS = RIDDLE_SCRAMBLE_LEVELS.reduce(
  (max, level) => Math.max(max, level.answerLetters),
  0,
)

const LEVEL_INDEX = new Map(RIDDLE_SCRAMBLE_LEVELS.map((level) => [level.id, level]))

export const RIDDLE_SCRAMBLE_LEVEL_OPTIONS: StudioSelectOption[] =
  RIDDLE_SCRAMBLE_LEVELS.map((level) => ({ label: level.label, value: level.id }))

/** Sheets saved with a plain difficulty field before the ladder existed. */
function legacyLevelId(config: StudioConfig): RiddleScrambleLevelId | null {
  const difficulty = config.difficulty
  if (difficulty === 'easy' || difficulty === 'relaxed') return 'gentle'
  if (difficulty === 'hard' || difficulty === 'challenge') return 'challenging'
  if (difficulty === 'medium') return 'classic'
  return null
}

export function parseRiddleScrambleLevel(config: StudioConfig): RiddleScrambleLevel {
  const chosen = LEVEL_INDEX.get(String(config.level ?? '') as RiddleScrambleLevelId)
  if (chosen) return chosen
  const legacy = legacyLevelId(config)
  return (
    (legacy ? LEVEL_INDEX.get(legacy) : undefined) ??
    LEVEL_INDEX.get(DEFAULT_RIDDLE_SCRAMBLE_LEVEL_ID)!
  )
}
