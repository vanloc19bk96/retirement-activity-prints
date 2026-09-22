import type { StudioConfig, StudioSelectOption } from '@/types/studio-template.types'

/**
 * The one difficulty decision a missing-vowels page asks for.
 *
 * The old form asked five — a category, a theme inside that category, a custom
 * theme box, a difficulty, a print style, and a "Number of items" spinner from
 * 8 to 18. Three of those were traps. The category existed only to shorten the
 * theme list, so a book could not put this game and the crossword on one theme.
 * "Print style: standard" let a seller drop the puzzle to 12 pt on a page sold
 * to readers who bought it *because* it was large print. And the item count was
 * a promise nobody kept: eighteen rows on a 5 x 8 paperback squeezed the table
 * until the blanks were too small to write a letter in.
 *
 * One plain-language level answers what is left. Item count is a *target* here,
 * not a setting: `layout.ts` steps it down until every blank is still wide
 * enough to write in, and the level's help line reports what that produced on
 * the trim currently in Settings.
 *
 * The bands run longer than they would in a game of unscrambling, and that is
 * not an oversight. Missing vowels gets *easier* as the word gets longer: more
 * consonants means more of the shape is already on the page, and — the part
 * that decides whether a sheet can be printed at all — far fewer words share a
 * vowel pattern. Barely half of four-letter words have a single common filling
 * (B_LL, R__D, T_M_); past six letters it is nine in ten. Short words are the
 * ambiguous ones, so "gentle" does not mean "tiny".
 */
export type MissingVowelsLevelId = 'gentle' | 'classic' | 'challenging'

export interface MissingVowelsLevel {
  id: MissingVowelsLevelId
  /** Option label in the form — short enough not to truncate in the panel. */
  label: string
  /** Letter band asked of the writer, spaces excluded. */
  minLetters: number
  maxLetters: number
  /**
   * Words one answer may run to.
   *
   * Capped at two everywhere it is above one: the row is a single line of
   * letter slots, and the widest answer a level allows has to fit that line on
   * the narrowest trim the app sells (5 x 8) without the letters dropping below
   * the large-print floor. That is also what caps the bands at ten letters —
   * about twelve slots is all a five-inch page has once the row number and a
   * word gap are paid for, and a level that promised more would print an error
   * message instead of a puzzle.
   *
   * It is what decides the *columns*, too. A word gap is charged once per
   * column, so a level that allows phrases needs a much wider page before a
   * second column fits — which is why the longest level takes single words.
   */
  maxWords: number
  /**
   * Rows the page aims for, before the page-size cap.
   *
   * Set to what the largest trim the app sells can actually hold, not to a
   * comfortable-looking number. The aim is a ceiling the page then cuts down,
   * so an aim below the page's capacity is invisible: the sheet simply stops
   * short and no one can tell whether the trim or the aim was the reason. Every
   * level reaches sixteen on an 8.5 x 11, so sixteen is where they all aim and
   * the trim is left to be the only thing that decides.
   */
  targetItems: number
}

export const MISSING_VOWELS_LEVELS: readonly MissingVowelsLevel[] = [
  {
    id: 'gentle',
    label: 'Gentle — short familiar words',
    minLetters: 5,
    maxLetters: 7,
    maxWords: 1,
    targetItems: 16,
  },
  {
    id: 'classic',
    label: 'Classic — everyday words and short phrases',
    minLetters: 6,
    // Nine rather than eight, because this is now the only level that prints
    // a phrase, and BOOK CLUB is eight letters while SPARE ROOM and MARKET
    // DAY are nine — capping here at eight would leave most of the warmest
    // retirement copy with nowhere to go. It costs the 8 x 10 trim its second
    // column, which is the narrowest page where two ever fit; the two 11-inch
    // trims, which is where a wide page is actually sold, still get both.
    maxLetters: 9,
    maxWords: 2,
    targetItems: 16,
  },
  {
    id: 'challenging',
    label: 'Challenging — the longest words',
    minLetters: 8,
    maxLetters: 10,
    // Single words, and that is what makes this the two-column level rather
    // than the wasteful one. A word gap is the widest thing a row can hold,
    // and a two-column page pays for it twice: allowing phrases here cost
    // 70px across a US Letter page, which was exactly the margin by which a
    // second column would not fit. The page then printed eight long words
    // down the left half of the sheet and left the right half blank.
    //
    // Nothing is lost by it. Phrases live in Classic, where they are short
    // enough to fit either way, and a writer asked for eight to ten letters
    // returns single words almost every time regardless.
    maxWords: 1,
    targetItems: 16,
  },
]

export const DEFAULT_MISSING_VOWELS_LEVEL_ID: MissingVowelsLevelId = 'classic'

const LEVEL_INDEX = new Map(MISSING_VOWELS_LEVELS.map((level) => [level.id, level]))

export const MISSING_VOWELS_LEVEL_OPTIONS: StudioSelectOption[] =
  MISSING_VOWELS_LEVELS.map((level) => ({ label: level.label, value: level.id }))

/** Sheets saved before the ladder replaced difficulty + item count. */
function legacyLevelId(config: StudioConfig): MissingVowelsLevelId | null {
  const difficulty = config.difficulty
  if (difficulty === 'relaxed' || difficulty === 'easy') return 'gentle'
  if (difficulty === 'challenge' || difficulty === 'hard') return 'challenging'
  if (difficulty === 'classic' || difficulty === 'medium') return 'classic'
  return null
}

export function parseMissingVowelsLevel(config: StudioConfig): MissingVowelsLevel {
  const chosen = LEVEL_INDEX.get(String(config.level ?? '') as MissingVowelsLevelId)
  if (chosen) return chosen
  const legacy = legacyLevelId(config)
  return (
    (legacy ? LEVEL_INDEX.get(legacy) : undefined) ??
    LEVEL_INDEX.get(DEFAULT_MISSING_VOWELS_LEVEL_ID)!
  )
}
