import type { StudioConfig, StudioSelectOption } from '@/types/studio-template.types'

/**
 * The one difficulty decision a Codeword page asks for.
 *
 * A codeword has no clues, so almost everything a crossword form asks about
 * does not exist here: there is no clue list to size, no clue tone to set, no
 * "answers" the seller could sensibly count. What is left is a single question
 * — how hard should the crack be — and it moves the three things that decide
 * that together, because they are one decision seen from three sides:
 *
 * * **how many words interlock** — more words means more crossings, and a
 *   crossing is the only thing a solver has instead of a clue;
 * * **how long they run** — longer words carry more shape, but a grid of nine-
 *   letter words has fewer of them and therefore fewer crossings;
 * * **how many letters are given** — the starter mappings printed before the
 *   solver begins.
 *
 * Starters are capped at three and floored at two on purpose. Nothing given at
 * all is a blank wall: with no clues, the first letter costs more effort than
 * the remaining twenty, and that first wall is where a reader in this audience
 * puts the book down. Four or more starts to solve the puzzle for them.
 *
 * Grid size, cell pitch, number size, how many columns the key strip runs in —
 * none of it is on the form. A seller cannot answer "how many cells" without
 * knowing the trim, the heading and how the words happen to interlock, so
 * `layout.ts` derives it from the page in Settings and the level's help line
 * reports what came out.
 */
export type CodewordLevelId = 'gentle' | 'classic' | 'challenging'

export interface CodewordLevel {
  id: CodewordLevelId
  /** Option label in the form — short enough not to truncate in the panel. */
  label: string
  /** Words the page aims to interlock, before the page-size cap. */
  targetWords: number
  /** Below this the grid is too thin to crack from crossings alone. */
  minWords: number
  minLetters: number
  maxLetters: number
  /** Number-to-letter mappings printed before the solver starts (2 or 3). */
  starterLetters: 2 | 3
  /**
   * Distinct letters the finished grid must carry.
   *
   * This is the puzzle's real size: a codeword is `N` numbers to crack, not `N`
   * words to find. Too few and the page is a short substitution exercise rather
   * than a codeword, so a build that lands under the floor is thrown away and
   * drawn again rather than printed.
   */
  minDistinctLetters: number
}

export const CODEWORD_LEVELS: readonly CodewordLevel[] = [
  {
    id: 'gentle',
    label: 'Gentle — shorter words, three letters given',
    targetWords: 10,
    minWords: 8,
    minLetters: 4,
    maxLetters: 7,
    starterLetters: 3,
    minDistinctLetters: 14,
  },
  {
    id: 'classic',
    label: 'Classic — the everyday puzzle',
    targetWords: 13,
    minWords: 10,
    minLetters: 4,
    maxLetters: 8,
    starterLetters: 3,
    minDistinctLetters: 16,
  },
  {
    id: 'challenging',
    label: 'Challenging — a fuller grid, two letters given',
    targetWords: 15,
    minWords: 11,
    minLetters: 4,
    maxLetters: 9,
    starterLetters: 2,
    minDistinctLetters: 17,
  },
]

export const DEFAULT_CODEWORD_LEVEL_ID: CodewordLevelId = 'classic'

const LEVEL_INDEX = new Map(CODEWORD_LEVELS.map((level) => [level.id, level]))

export const CODEWORD_LEVEL_OPTIONS: StudioSelectOption[] = CODEWORD_LEVELS.map(
  (level) => ({ label: level.label, value: level.id }),
)

/** Sheets saved against a form that spoke in difficulties rather than levels. */
function legacyLevelId(config: StudioConfig): CodewordLevelId | null {
  const difficulty = config.difficulty
  if (difficulty == null) return null
  if (difficulty === 'easy' || difficulty === 'relaxed') return 'gentle'
  if (difficulty === 'hard' || difficulty === 'challenge') return 'challenging'
  return 'classic'
}

export function parseCodewordLevel(config: StudioConfig): CodewordLevel {
  const chosen = LEVEL_INDEX.get(String(config.level ?? '') as CodewordLevelId)
  if (chosen) return chosen
  const legacy = legacyLevelId(config)
  return (
    (legacy ? LEVEL_INDEX.get(legacy) : undefined) ??
    LEVEL_INDEX.get(DEFAULT_CODEWORD_LEVEL_ID)!
  )
}

const GIVEN_WORDS: Record<number, string> = { 2: 'Two', 3: 'Three' }

/**
 * What the page tells the solver.
 *
 * Two short sentences, because the rule of a codeword *is* the puzzle and a
 * reader meeting one for the first time has nothing else to go on. It names the
 * count of starters rather than listing them — the pairs themselves are printed
 * under the grid at a size the instruction strip could not carry, and repeating
 * them here would mean two places that could disagree.
 */
export function codewordInstruction(config: StudioConfig): string {
  if (config.showInstructions === false) return ''
  const level = parseCodewordLevel(config)
  const given = GIVEN_WORDS[level.starterLetters] ?? String(level.starterLetters)
  return (
    'Each number stands for the same letter every time. ' +
    `${given} letters are given.`
  )
}
