import {
  MIN_PAIRS_PER_PAGE,
  letterWlPairs,
  orderWlPairs,
  pairsConflict,
  wlLetter,
  type WlPair,
} from './content'
import {
  MAX_MEANING_LINES,
  MAX_PHRASE_LINES,
  breakKeyMeaning,
  breakKeyPhrase,
  breakMeaning,
  breakPhrase,
  type WlPagePlan,
} from './layout'

/** A pair with its letter, and its phrase and meanings already broken to their columns. */
export interface FittedWlPair extends WlPair {
  /** The letter its meaning prints under — the answer to its phrase. */
  letter: string
  phraseLines: string[]
  meaningLines: string[]
  /** The phrase as the answer page sets it, across the full block. */
  keyPhraseLines: string[]
  /** The meaning as the answer page sets it, under the phrase. */
  keyLines: string[]
}

/**
 * Hold real pairs to the page the form promised, and letter their meanings.
 *
 * The type size and the page's line budgets stay exactly as the worst-case
 * plan set them, so every page of a run matches. Pairs are taken in a seeded
 * reading order, and one is passed over when its phrase or either setting of
 * its meaning needs more lines than it may use or than the page has left, or
 * when it could be confused with a pair already placed. Only the count may
 * fall — never the type — and never below the fewest pairs a puzzle needs.
 *
 * Returned in phrase order. The meanings list is the same records sorted by
 * letter, and the answer page is the same records again, so a meaning can only
 * ever print under its own phrase's letter.
 */
export function fitWlPairs(
  pairs: readonly WlPair[],
  promised: WlPagePlan,
  font: string,
  seed: number,
): { pairs: FittedWlPair[]; plan: WlPagePlan } | null {
  const placed: Omit<FittedWlPair, 'letter'>[] = []
  let phraseLines = 0
  let meaningLines = 0
  let keyLines = 0

  for (const pair of orderWlPairs(pairs, seed)) {
    if (placed.length >= promised.count) break
    const phrase = breakPhrase(pair.phrase, promised, font)
    const meaning = breakMeaning(pair.meaning, promised, font)
    const key = breakKeyMeaning(pair.meaning, promised, font)
    if (phrase.length > MAX_PHRASE_LINES) continue
    if (meaning.length > MAX_MEANING_LINES || key.length > MAX_MEANING_LINES) continue
    if (phraseLines + phrase.length > promised.phraseLines) continue
    if (meaningLines + meaning.length > promised.meaningLines) continue
    if (keyLines + key.length > promised.keyLines) continue
    if (placed.some((kept) => pairsConflict(pair, kept))) continue
    phraseLines += phrase.length
    meaningLines += meaning.length
    keyLines += key.length
    placed.push({
      ...pair,
      phraseLines: phrase,
      meaningLines: meaning,
      keyPhraseLines: breakKeyPhrase(pair.phrase, promised, font),
      keyLines: key,
    })
  }

  if (placed.length < MIN_PAIRS_PER_PAGE) return null
  const shown = letterWlPairs(placed.length, seed)
  const fitted = placed.map((pair, index) => ({ ...pair, letter: wlLetter(shown.indexOf(index)) }))
  return { pairs: fitted, plan: { ...promised, count: fitted.length } }
}

/** The meanings in the order the puzzle page lists them: A, B, C… */
export function meaningsByLetter(pairs: readonly FittedWlPair[]): FittedWlPair[] {
  return [...pairs].sort((a, b) => a.letter.localeCompare(b.letter))
}
