import type { StudioConfig, StudioSelectOption } from '@/types/studio-template.types'
import type { WordSearchDifficulty } from '@/utils/puzzles/word-search-core'

/**
 * The one difficulty decision a word search page asks for.
 *
 * The old form asked five separate questions to get here — where the words
 * come from, a theme, a category behind that theme, a difficulty, and a print
 * style — and then a sixth, hidden one: the grid size and word count baked
 * into a `difficulty x printStyle` table. Two of those could be set against
 * each other (a 15 x 15 "standard" grid with twenty-eight words on a 5 x 8
 * paperback is a request no page can honour), and the table ignored the trim
 * entirely: the same 12 x 12 grid was printed on a 5 x 8 interior and on
 * 8.5 x 11, which is a squint on one and a postage stamp of white space on
 * the other.
 *
 * One plain-language level answers all of it. Print style is gone because
 * every page is large print — `layout.ts` holds the floor at 14 pt and
 * derives the grid from the trim in Settings. Word counts here are *targets*:
 * the page steps the count down until the grid still sets at that floor, and
 * the level's help line reports what that produced on the current page size.
 */
export type WordSearchLevelId = 'gentle' | 'classic' | 'challenging'

export interface WordSearchLevel {
  id: WordSearchLevelId
  /** Option label in the form — short enough not to truncate in the panel. */
  label: string
  /**
   * Which headings words may run in. Reuses the shared placement engine's
   * ladder: `easy` is across + down, `medium` adds the two forward diagonals,
   * `hard` opens all eight and lets words be written backwards.
   */
  directions: WordSearchDifficulty
  /** The sentence under the heading. Says exactly where to look. */
  instruction: string
  /** Words the page aims for, before the page-size cap. */
  targetWords: number
  /** Below this the sheet is too thin to print; the page refuses instead. */
  minWords: number
  /**
   * Letters a listed word may have, once spaces and punctuation are removed.
   *
   * The floor is four for every level. Three-letter words are the ones that
   * turn up by accident in the random filler, and an activity book whose
   * answer key circles one TEA while another reads just as clearly two rows
   * down is a book with a wrong answer key in it.
   *
   * The ceiling is what keeps the smallest trim solvable: a word cannot be
   * longer than the grid is wide, and on a 5 x 8 interior that grid is ten
   * cells across.
   */
  minLetters: number
  maxLetters: number
}

export const WORD_SEARCH_LEVELS: readonly WordSearchLevel[] = [
  {
    id: 'gentle',
    label: 'Gentle — across and down only',
    directions: 'easy',
    instruction: 'Circle each word from the list. They read across and down.',
    targetWords: 10,
    minWords: 6,
    minLetters: 4,
    maxLetters: 7,
  },
  {
    id: 'classic',
    label: 'Classic — the everyday puzzle',
    directions: 'medium',
    instruction:
      'Circle each word from the list. They read across, down and diagonally.',
    targetWords: 15,
    minWords: 8,
    minLetters: 4,
    maxLetters: 9,
  },
  {
    id: 'challenging',
    label: 'Challenging — every direction, some backwards',
    directions: 'hard',
    instruction:
      'Circle each word from the list. They read in any direction, even backwards.',
    targetWords: 20,
    minWords: 8,
    minLetters: 4,
    maxLetters: 10,
  },
]

export const DEFAULT_WORD_SEARCH_LEVEL_ID: WordSearchLevelId = 'classic'

const LEVEL_INDEX = new Map(WORD_SEARCH_LEVELS.map((level) => [level.id, level]))

export const WORD_SEARCH_LEVEL_OPTIONS: StudioSelectOption[] = WORD_SEARCH_LEVELS.map(
  (level) => ({ label: level.label, value: level.id }),
)

/** Sheets saved before the ladder replaced difficulty + print style. */
function legacyLevelId(config: StudioConfig): WordSearchLevelId | null {
  const difficulty = config.difficulty
  if (difficulty == null) return null
  if (difficulty === 'easy' || difficulty === 'relaxed') return 'gentle'
  if (difficulty === 'hard' || difficulty === 'challenge') return 'challenging'
  return 'classic'
}

export function parseWordSearchLevel(config: StudioConfig): WordSearchLevel {
  const chosen = LEVEL_INDEX.get(String(config.level ?? '') as WordSearchLevelId)
  if (chosen) return chosen
  const legacy = legacyLevelId(config)
  return (
    (legacy ? LEVEL_INDEX.get(legacy) : undefined) ??
    LEVEL_INDEX.get(DEFAULT_WORD_SEARCH_LEVEL_ID)!
  )
}

/** What the page tells the solver, unless the heading strip is switched off. */
export function wordSearchInstruction(config: StudioConfig): string {
  if (config.showInstructions === false) return ''
  return parseWordSearchLevel(config).instruction
}
