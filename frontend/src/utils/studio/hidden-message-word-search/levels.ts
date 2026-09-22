import type { StudioConfig, StudioSelectOption } from '@/types/studio-template.types'
import type { WordSearchDifficulty } from '@/utils/puzzles/word-search-core'

/**
 * The one difficulty decision a hidden-message page asks for.
 *
 * The old form asked five questions to get here — where the words come from, a
 * category, a theme, a difficulty and a print style — and then answered a sixth
 * silently: a `difficulty x printStyle` table handed out a grid size and a word
 * count that had never seen the trim. The same 13 x 13 grid was printed on a
 * 5 x 8 interior and on 8.5 x 11.
 *
 * One plain-language level answers all of it. Print style is gone because every
 * page is large print; grid size and word count are gone because `layout.ts`
 * derives them from the page in Settings and reports what came out.
 *
 * What a level still owns is the part that is about the *puzzle* rather than
 * the paper: which headings words may run in, how long they may be, and how
 * long the hidden saying may be.
 */
export type HiddenMessageLevelId = 'gentle' | 'classic' | 'challenging'

export interface HiddenMessageLevel {
  id: HiddenMessageLevelId
  /** Option label in the form — short enough not to truncate in the panel. */
  label: string
  /** Headings words may run in, on the shared placement engine's ladder. */
  directions: WordSearchDifficulty
  /** The sentence under the heading. Says where to look and what to read. */
  instruction: string
  /**
   * Most words the bank may hold.
   *
   * Unlike a plain word search this is a ceiling, not a target: the grid has to
   * be filled *exactly*, so the number of words is whatever it takes to leave
   * the saying's letters and no others. The page reserves the bank for this
   * ceiling, so a puzzle that finishes early prints a roomier bank, never a
   * clipped one.
   */
  maxWords: number
  /**
   * Below this the sheet is too thin to print; the page refuses instead.
   *
   * Low on purpose, and lower than the plain word search's. The word count here
   * is not a target the page aims at — it is the number of words it happened to
   * take to fill the grid around the saying, and on a small trim that is a
   * genuinely short list. A floor set to what a large page produces is a floor
   * that turns every small page into an error page.
   */
  minWords: number
  /**
   * Letters a listed word may have, once spaces and punctuation are removed.
   *
   * The floor is four at every level. Three-letter words are the ones that turn
   * up by accident among the saying's leftover letters, and a page whose key
   * circles one TEA while another reads just as clearly two rows down is a page
   * with a wrong answer key on it.
   */
  minLetters: number
  maxLetters: number
  /**
   * Letters the hidden saying may have, spaces and punctuation removed.
   *
   * Both ends are load-bearing. The floor is what stops a saying being so short
   * that the words have to tile the whole grid; the ceiling is what the page
   * reserves write-in room for, and it is why a longer level needs a larger
   * trim before it will lay out at all.
   */
  minMessageLetters: number
  maxMessageLetters: number
}

export const HIDDEN_MESSAGE_LEVELS: readonly HiddenMessageLevel[] = [
  {
    id: 'gentle',
    label: 'Gentle — across and down only',
    directions: 'easy',
    instruction:
      'Circle each word from the list. They read across and down. The letters left over, read line by line, spell the hidden message.',
    maxWords: 18,
    minWords: 6,
    minLetters: 4,
    maxLetters: 7,
    minMessageLetters: 16,
    maxMessageLetters: 24,
  },
  {
    id: 'classic',
    label: 'Classic — the everyday puzzle',
    directions: 'medium',
    instruction:
      'Circle each word from the list. They read across, down and diagonally. The letters left over, read line by line, spell the hidden message.',
    maxWords: 24,
    minWords: 7,
    minLetters: 4,
    maxLetters: 8,
    minMessageLetters: 18,
    maxMessageLetters: 28,
  },
  {
    id: 'challenging',
    label: 'Challenging — every direction, some backwards',
    directions: 'hard',
    instruction:
      'Circle each word from the list. They read in any direction, even backwards. The letters left over, read line by line, spell the hidden message.',
    maxWords: 30,
    minWords: 8,
    minLetters: 4,
    maxLetters: 9,
    minMessageLetters: 20,
    maxMessageLetters: 32,
  },
]

export const DEFAULT_HIDDEN_MESSAGE_LEVEL_ID: HiddenMessageLevelId = 'classic'

const LEVEL_INDEX = new Map(HIDDEN_MESSAGE_LEVELS.map((level) => [level.id, level]))

export const HIDDEN_MESSAGE_LEVEL_OPTIONS: StudioSelectOption[] =
  HIDDEN_MESSAGE_LEVELS.map((level) => ({ label: level.label, value: level.id }))

/** Sheets saved before the ladder replaced difficulty + print style. */
function legacyLevelId(config: StudioConfig): HiddenMessageLevelId | null {
  const difficulty = config.difficulty
  if (difficulty == null) return null
  if (difficulty === 'easy' || difficulty === 'relaxed') return 'gentle'
  if (difficulty === 'hard' || difficulty === 'challenge') return 'challenging'
  return 'classic'
}

export function parseHiddenMessageLevel(config: StudioConfig): HiddenMessageLevel {
  const chosen = LEVEL_INDEX.get(String(config.level ?? '') as HiddenMessageLevelId)
  if (chosen) return chosen
  const legacy = legacyLevelId(config)
  return (
    (legacy ? LEVEL_INDEX.get(legacy) : undefined) ??
    LEVEL_INDEX.get(DEFAULT_HIDDEN_MESSAGE_LEVEL_ID)!
  )
}

/** What the page tells the solver, unless the heading strip is switched off. */
export function hiddenMessageInstruction(config: StudioConfig): string {
  if (config.showInstructions === false) return ''
  return parseHiddenMessageLevel(config).instruction
}
