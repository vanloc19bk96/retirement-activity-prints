import type { WordSearchPuzzle } from '@/utils/puzzles/word-search-core'
import { createRng, deriveSeed } from '../studio-rng'
import { tryBuildWordSearch } from '../retirement-word-search/place'
import type { TriviaEntry } from './content'
import type { TriviaLevel } from './levels'

/**
 * A grid, its placements, and the clue that belongs to every placed answer.
 *
 * `entries` is the printed order, and `words` / `displays` are kept in that
 * same order so nothing downstream can number the list one way and check it
 * another. Clue 3 is `entries[2]`, its answer is `words[2]`, and the placement
 * the key circles for it is the one whose `word` is that token.
 */
export interface TriviaPuzzle extends WordSearchPuzzle {
  entries: TriviaEntry[]
}

/**
 * Printed order, which is deliberately not the order anything else uses.
 *
 * A word bank is set alphabetically because a reader scans it. A clue list
 * cannot be: sorting by answer would tell a solver that clue 1's answer starts
 * nearer A than clue 2's, which is a free letter on every clue in the book.
 * Sorting by placement would leak where to look. So the order is drawn from
 * the puzzle's own seed — reproducible, and meaningless to a solver.
 */
function printedOrder(entries: readonly TriviaEntry[], seed: number): TriviaEntry[] {
  return createRng(deriveSeed(seed, 'trivia-clue-order')).shuffle([...entries])
}

/**
 * Build the page's puzzle at exactly `clueCount` answers, or null.
 *
 * The count is fixed rather than laddered down here, because the caller has to
 * re-measure the clue block every time the count changes — a shorter list is a
 * different block height, and a block height is what the grid was sized
 * against. Stepping the count is therefore the caller's loop, and this function
 * answers one question: can these answers interlock at this size, with every
 * one of them readable in exactly one place.
 */
export function tryBuildTriviaPuzzle(options: {
  entries: readonly TriviaEntry[]
  clueCount: number
  gridSide: number
  level: TriviaLevel
  seed: number
}): TriviaPuzzle | null {
  const { entries, clueCount, gridSide, level, seed } = options
  if (entries.length < clueCount) return null

  const built = tryBuildWordSearch({
    entries,
    wordCount: clueCount,
    gridSide,
    // The floor is this count: a shorter grid would leave the caller holding a
    // clue list it has not measured a band for.
    level: { directions: level.directions, minWords: clueCount },
    seed,
  })
  if (!built) return null

  const byToken = new Map(entries.map((entry) => [entry.token, entry]))
  const placed = built.words.map((token) => byToken.get(token))
  if (placed.some((entry) => entry == null)) return null

  const ordered = printedOrder(placed as TriviaEntry[], seed)
  return {
    ...built,
    words: ordered.map((entry) => entry.token),
    displays: ordered.map((entry) => entry.token),
    entries: ordered,
  }
}
