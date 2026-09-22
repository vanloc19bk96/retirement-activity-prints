import type { StudioConfig, StudioSelectOption } from '@/types/studio-template.types'

/**
 * The one difficulty decision an anagram page asks for.
 *
 * The old form asked three questions to get here — a topic list of its own, a
 * custom-topic box, and a "Number of words" spinner from 8 to 20 that the page
 * had no say in. Two of those three were traps. The topic list duplicated the
 * shared retirement theme registry with eleven of its own labels, so a book
 * built from the anagram sheet and the crossword could not be given the same
 * theme. And the word count was a promise nobody kept: twenty rows on a 5 x 8
 * paperback collapsed the table until the letters set at nine point, which is
 * not a puzzle an older reader can solve — it is one they put down.
 *
 * One plain-language level answers all of it. Word count is a *target* here,
 * not a setting: `layout.ts` steps it down until every word still sets at the
 * large-print floor, and the level's help line reports what that produced on
 * the trim currently in Settings.
 */
export type AnagramLevelId = 'gentle' | 'classic' | 'challenging'

export interface AnagramLevel {
  id: AnagramLevelId
  /** Option label in the form — short enough not to truncate in the panel. */
  label: string
  /** Letter band asked of the writer; mirrors the API's own range. */
  minLetters: number
  maxLetters: number
  /** Words the page aims for, before the page-size cap. */
  targetItems: number
  /**
   * First letter printed into its slot before the solver starts.
   *
   * An anagram with a clue and a first letter is a puzzle you can always get
   * into; without either it is a guessing game. Gentle gives the letter away
   * because the first letter is the one that costs the most and teaches the
   * least — once a reader has it, the rest of the word is the actual puzzle.
   */
  firstLetterGiven: boolean
  /**
   * Shuffle so no letter keeps its original seat.
   *
   * Left to chance, a six-letter scramble holds two or three letters in place
   * often enough to matter, and a reader who spots GARD-- reads the answer off
   * the prompt. Only the hardest level asks for it: on an easy page a partly
   * familiar shape is a kindness, not a leak.
   */
  deranged: boolean
}

export const ANAGRAM_LEVELS: readonly AnagramLevel[] = [
  {
    id: 'gentle',
    label: 'Gentle — short words, first letter given',
    minLetters: 4,
    maxLetters: 6,
    targetItems: 14,
    firstLetterGiven: true,
    deranged: false,
  },
  {
    id: 'classic',
    label: 'Classic — the everyday puzzle',
    minLetters: 5,
    maxLetters: 8,
    targetItems: 12,
    firstLetterGiven: false,
    deranged: false,
  },
  {
    id: 'challenging',
    label: 'Challenging — longer words, fully shuffled',
    minLetters: 6,
    maxLetters: 10,
    targetItems: 10,
    firstLetterGiven: false,
    deranged: true,
  },
]

export const DEFAULT_ANAGRAM_LEVEL_ID: AnagramLevelId = 'classic'

const LEVEL_INDEX = new Map(ANAGRAM_LEVELS.map((level) => [level.id, level]))

export const ANAGRAM_LEVEL_OPTIONS: StudioSelectOption[] = ANAGRAM_LEVELS.map(
  (level) => ({ label: level.label, value: level.id }),
)

/** Sheets saved before the ladder replaced difficulty + word count. */
function legacyLevelId(config: StudioConfig): AnagramLevelId | null {
  const difficulty = config.difficulty
  if (difficulty === 'easy') return 'gentle'
  if (difficulty === 'hard') return 'challenging'
  if (difficulty === 'medium') return 'classic'
  return null
}

export function parseAnagramLevel(config: StudioConfig): AnagramLevel {
  const chosen = LEVEL_INDEX.get(String(config.level ?? '') as AnagramLevelId)
  if (chosen) return chosen
  const legacy = legacyLevelId(config)
  return (
    (legacy ? LEVEL_INDEX.get(legacy) : undefined) ??
    LEVEL_INDEX.get(DEFAULT_ANAGRAM_LEVEL_ID)!
  )
}
