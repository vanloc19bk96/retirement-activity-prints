import type { WordSearchPuzzle } from '@/utils/puzzles/word-search-core'
import { tryBuildWordSearch } from '../retirement-word-search/place'
import { deriveSeed } from '../studio-rng'
import {
  ALPHABET,
  ATOZ_WORD_COUNT,
  selectAlphabetSet,
  sortByLetter,
  type AtoZEntry,
} from './content'
import type { AtoZLevel } from './levels'

/**
 * A grid, its placements, and the letter every placed word answers for.
 *
 * `entries` is A to Z order, and `words` / `displays` are kept in that same order
 * so nothing downstream can number the band one way and check it another. The
 * letter at position 3 is `entries[3].letter`, its word is `words[3]`, and the
 * placement the key circles for it is the one whose `word` is that token.
 */
export interface AtoZPuzzle extends WordSearchPuzzle {
  entries: AtoZEntry[]
}

/**
 * Fresh alphabet draws tried before the page gives up.
 *
 * Placement can fail for reasons nothing upstream can see: twenty-six particular
 * words may simply not interlock on a particular grid, and at the floor size this
 * grid is packed tighter than any other word search in the library. Re-drawing the
 * alphabet is cheap — a different word for a dozen letters is a different puzzle
 * to place — and it is the only lever left, because the word count cannot be
 * stepped down. Twenty-five words is not an A to Z puzzle.
 */
const ALPHABET_DRAWS = 12

/**
 * Build this page's puzzle: one word per letter, all twenty-six placed, or null.
 *
 * The heavy lifting is the shared word-search ladder, which is what the plain
 * word search and the trivia page both use — fourteen shuffles at the requested
 * count, each with up to forty re-draws of the filler letters until every listed
 * word reads in exactly one place. Its floor is set to twenty-six here, so it
 * cannot quietly hand back a grid with a letter missing; a short grid is a failure
 * this function reports rather than a page it prints.
 */
export function tryBuildAtoZPuzzle(options: {
  level: AtoZLevel
  gridSide: number
  maxWordLetters: number
  seed: number
}): AtoZPuzzle | null {
  const { level, gridSide, maxWordLetters, seed } = options

  for (let draw = 0; draw < ALPHABET_DRAWS; draw++) {
    const entries = selectAlphabetSet({
      level: { ...level, maxLetters: Math.min(level.maxLetters, maxWordLetters) },
      gridSide,
      seed: deriveSeed(seed, `a-to-z-draw-${draw}`),
    })
    if (!entries || entries.length !== ATOZ_WORD_COUNT) continue

    const built = tryBuildWordSearch({
      entries,
      wordCount: ATOZ_WORD_COUNT,
      gridSide,
      // The floor is the whole alphabet: anything less is a different puzzle.
      level: { directions: level.directions, minWords: ATOZ_WORD_COUNT },
      seed: deriveSeed(seed, `a-to-z-place-${draw}`),
    })
    if (!built) continue

    const byToken = new Map(entries.map((entry) => [entry.token, entry]))
    const placed = built.words.map((token) => byToken.get(token))
    if (placed.some((entry) => entry == null)) continue

    const ordered = sortByLetter(placed as AtoZEntry[])
    // One word for each letter, in alphabet order, or this draw is not a puzzle.
    if (ordered.length !== ATOZ_WORD_COUNT) continue
    if (ordered.some((entry, index) => entry.letter !== ALPHABET[index])) continue

    return {
      ...built,
      words: ordered.map((entry) => entry.token),
      displays: ordered.map((entry) => entry.display),
      entries: ordered,
    }
  }

  return null
}
