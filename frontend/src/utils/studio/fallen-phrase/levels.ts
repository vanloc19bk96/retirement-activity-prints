import type { StudioConfig, StudioSelectOption } from '@/types/studio-template.types'
import type { FallenPhraseLength } from '@/types/studio-fallen-phrase.types'

export type { FallenPhraseLength }

/**
 * The one difficulty decision a Fallen Phrase page asks for.
 *
 * Rows are the whole of it. A column of a quotefall is its own small puzzle —
 * k letters to drop into k boxes — so a three-row grid offers a solver at most
 * six orders to try per column where a five-row grid offers a hundred and
 * twenty. Every other number on the page follows from that one: the saying has
 * to be long enough to fill `rows` rows of the grid the trim can print, which
 * fixes the letter band, which fixes how wide the grid wants to be. A form
 * that asked for rows *and* length could be answered inconsistently, and a
 * form that asked for grid width would be asking a seller to do arithmetic
 * about a page size they set in another panel.
 *
 * What the level does not decide is how big anything prints. `layout.ts`
 * derives that from the trim in Settings, and the level's help line reports
 * what came out — the form never promises a page it cannot set.
 */
export type FallenPhraseLevelId = 'gentle' | 'classic' | 'challenging'

export interface FallenPhraseLevel {
  id: FallenPhraseLevelId
  /** Option label in the form — short enough not to truncate in the panel. */
  label: string
  /** Saying length band asked of the writer; mirrors the API's own ranges. */
  length: FallenPhraseLength
  /** Grid rows this level aims for, and the puzzle's real difficulty dial. */
  rows: number
  /**
   * Columns this level would rather have, before the trim has its say.
   *
   * Derived, not chosen: a typical saying of this band needs about this many
   * columns to wrap into `rows` rows without leaving the grid full of gaps.
   * All three levels land on the same width, which is not a coincidence — a
   * row of English prose that wraps comfortably is about the same length
   * whatever the saying, so a level makes its puzzle harder by asking for more
   * rows rather than wider ones. It is also why three pages at three levels
   * still look like one book.
   *
   * `layout.ts` clamps it to what the page can print at a writable box, so a
   * wide trim prints the level's grid in bigger boxes rather than a wider,
   * easier grid in the same ones.
   */
  preferredCols: number
}

export const FALLEN_PHRASE_LEVELS: readonly FallenPhraseLevel[] = [
  {
    id: 'gentle',
    label: 'Gentle — a short saying, 3 rows',
    length: 'short',
    rows: 3,
    preferredCols: 13,
  },
  {
    id: 'classic',
    label: 'Classic — the everyday puzzle, 4 rows',
    length: 'medium',
    rows: 4,
    preferredCols: 13,
  },
  {
    id: 'challenging',
    label: 'Challenging — a longer saying, 5 rows',
    length: 'long',
    rows: 5,
    preferredCols: 13,
  },
]

export const DEFAULT_FALLEN_PHRASE_LEVEL_ID: FallenPhraseLevelId = 'classic'

/**
 * Rows a grid may use, whatever the level asked for.
 *
 * Below three there is no puzzle left — a two-letter column is a coin toss.
 * Above six the boxes and the letters under them stop fitting the shortest
 * trim at a size an older hand can write in.
 */
export const FALLEN_PHRASE_MIN_ROWS = 3
export const FALLEN_PHRASE_MAX_ROWS = 6

/**
 * Row counts to try, best first.
 *
 * The level's own count leads. One more is the graceful fallback when a narrow
 * trim clamped the grid to fewer columns than the level wanted — a page a row
 * taller is still a page, where an error card is a refund. One fewer catches
 * the saying that came back at the short end of its band.
 */
export function rowCandidatesFor(level: FallenPhraseLevel): number[] {
  return [level.rows, level.rows + 1, level.rows - 1].filter(
    (rows) => rows >= FALLEN_PHRASE_MIN_ROWS && rows <= FALLEN_PHRASE_MAX_ROWS,
  )
}

/**
 * How far the grid may drift from the width this level prefers.
 *
 * One column either way. Sayings of one band still differ by a word or two,
 * and a grid forced to a single width would have to swallow that difference as
 * blocked cells; a column of slack is the cheaper way to absorb it. Wider than
 * this and two pages of one book stop looking like they belong together,
 * because the box size moves with the column count.
 */
export const COLUMN_FLEX = 1

const LEVEL_INDEX = new Map(FALLEN_PHRASE_LEVELS.map((level) => [level.id, level]))

export const FALLEN_PHRASE_LEVEL_OPTIONS: StudioSelectOption[] =
  FALLEN_PHRASE_LEVELS.map((level) => ({ label: level.label, value: level.id }))

/** Sheets saved with a plain length / difficulty field before the ladder existed. */
function legacyLevelId(config: StudioConfig): FallenPhraseLevelId | null {
  const length = config.length
  if (length === 'short') return 'gentle'
  if (length === 'long') return 'challenging'
  if (length === 'medium') return 'classic'
  const difficulty = config.difficulty
  if (difficulty === 'easy' || difficulty === 'relaxed') return 'gentle'
  if (difficulty === 'hard' || difficulty === 'challenge') return 'challenging'
  if (difficulty === 'medium') return 'classic'
  return null
}

export function parseFallenPhraseLevel(config: StudioConfig): FallenPhraseLevel {
  const chosen = LEVEL_INDEX.get(String(config.level ?? '') as FallenPhraseLevelId)
  if (chosen) return chosen
  const legacy = legacyLevelId(config)
  return (
    (legacy ? LEVEL_INDEX.get(legacy) : undefined) ??
    LEVEL_INDEX.get(DEFAULT_FALLEN_PHRASE_LEVEL_ID)!
  )
}
