import type { StudioConfig, StudioSelectOption } from '@/types/studio-template.types'
import type { WordSearchDifficulty } from '@/utils/puzzles/word-search-core'

/**
 * The one difficulty decision an A to Z page asks for.
 *
 * Everything a plain word search puts on its form — grid size, word count,
 * print style — is either fixed or derived here. The word count cannot be a
 * setting: the puzzle *is* the alphabet, so it is always twenty-six. Grid size
 * and type sizes come from `layout.ts`, which can see the trim in Settings,
 * and the level's help line reports what they produced.
 *
 * What is left is genuinely one question: how hard should the hunt be. It moves
 * two things together, because they are the same decision seen from both ends —
 * which headings a word may hide in, and how long the words run. A gentle page
 * hides short words across and down; a challenging one hides longer words in
 * all eight headings, some spelled backwards.
 *
 * The four-letter floor is not a style choice. Three-letter runs turn up by
 * accident in random filler often enough to matter across a book, and a page
 * whose B word is also readable somewhere else is a page whose answer key
 * circles the wrong cells. The ceiling is what keeps the answer list printable
 * beside a grid on the same page.
 */
export type AtoZLevelId = 'gentle' | 'classic' | 'challenging'

export interface AtoZLevel {
  id: AtoZLevelId
  /** Option label in the form — short enough not to truncate in the panel. */
  label: string
  /**
   * Which headings words may run in. Reuses the shared placement engine's
   * ladder: `easy` is across + down, `medium` adds the two forward diagonals,
   * `hard` opens all eight and lets words be written backwards.
   */
  directions: WordSearchDifficulty
  /** The sentence under the heading. Says what is hidden, then where to look. */
  instruction: string
  minLetters: number
  maxLetters: number
}

/**
 * Longer words are the challenging level's whole reward, and they are also the
 * only way XYLOPHONE ever reaches a page: the letter X has three printable
 * words in English that an adult reader would recognise, and two of them are
 * short. Nine letters is where that stops costing the answer list more width
 * than a page can spare beside its grid.
 */
export const ATOZ_LETTER_FLOOR = 4

export const ATOZ_LEVELS: readonly AtoZLevel[] = [
  {
    id: 'gentle',
    label: 'Gentle — short words, across and down',
    directions: 'easy',
    instruction:
      'Twenty-six words are hidden, one for each letter. They read across and down.',
    minLetters: ATOZ_LETTER_FLOOR,
    maxLetters: 6,
  },
  {
    id: 'classic',
    label: 'Classic — the everyday puzzle',
    directions: 'medium',
    instruction:
      'Twenty-six words are hidden, one for each letter. They read across, down and diagonally.',
    minLetters: ATOZ_LETTER_FLOOR,
    maxLetters: 7,
  },
  {
    id: 'challenging',
    label: 'Challenging — every direction, some backwards',
    directions: 'hard',
    instruction:
      'Twenty-six words are hidden, one for each letter. They read in any direction, even backwards.',
    minLetters: ATOZ_LETTER_FLOOR,
    maxLetters: 9,
  },
]

export const DEFAULT_ATOZ_LEVEL_ID: AtoZLevelId = 'classic'

const LEVEL_INDEX = new Map(ATOZ_LEVELS.map((level) => [level.id, level]))

export const ATOZ_LEVEL_OPTIONS: StudioSelectOption[] = ATOZ_LEVELS.map((level) => ({
  label: level.label,
  value: level.id,
}))

/** Sheets saved against a form that spoke in difficulties rather than levels. */
function legacyLevelId(config: StudioConfig): AtoZLevelId | null {
  const difficulty = config.difficulty
  if (difficulty == null) return null
  if (difficulty === 'easy' || difficulty === 'relaxed') return 'gentle'
  if (difficulty === 'hard' || difficulty === 'challenge') return 'challenging'
  return 'classic'
}

export function parseAtoZLevel(config: StudioConfig): AtoZLevel {
  const chosen = LEVEL_INDEX.get(String(config.level ?? '') as AtoZLevelId)
  if (chosen) return chosen
  const legacy = legacyLevelId(config)
  return (
    (legacy ? LEVEL_INDEX.get(legacy) : undefined) ??
    LEVEL_INDEX.get(DEFAULT_ATOZ_LEVEL_ID)!
  )
}

/** What the page tells the solver, unless the heading strip is switched off. */
export function atoZInstruction(config: StudioConfig): string {
  if (config.showInstructions === false) return ''
  return parseAtoZLevel(config).instruction
}
