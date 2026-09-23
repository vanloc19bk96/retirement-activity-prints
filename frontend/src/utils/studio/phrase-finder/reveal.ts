import type { StudioRng } from '../studio-rng'
import type { PhraseModel, PhraseWord } from './phrase'

/**
 * Which letters are printed in before the solver starts.
 *
 * This is the whole puzzle. A Phrase Finder page is a phrase with most of its
 * letters removed, so the handful left behind are the only thing standing
 * between a solvable evening and a row of blanks a reader gives up on — and
 * *which* letters they are matters far more than how many.
 *
 * The obvious implementation picks positions at random from the whole phrase,
 * and it fails in a way that is easy to miss until a book is printed. Random
 * picks are not spread; they clump. Two of the four given letters land in THE,
 * a third lands in OF, and the nine-letter word carrying the sense of the
 * phrase gets nothing at all. The page has then given away its two easiest
 * words — the ones a solver would have guessed from the gaps anyway — and kept
 * every letter that was worth having. Worse, it reads as a mistake: a reader
 * sees T_E and _F filled in and assumes the book is padded.
 *
 * So the budget is spent per *word* rather than per phrase, longest word first,
 * and no word may be more than half given or left with fewer than two blanks.
 * Long words are served before short ones on every pass, which is what
 * guarantees the nine-letter word gets its foothold before THE gets a second
 * one. Inside a word the positions are spread by farthest-point choice, so two
 * given letters never sit side by side turning a blank into a near-complete
 * word.
 *
 * Everything here is driven by the sheet's own seeded RNG, so a page redraws
 * identically and two pages of one book get different — but equally spread —
 * letters.
 */

/**
 * Words this short are never given a letter.
 *
 * A two-letter word with one letter printed is a word with one blank, and
 * IS / IT / IN / IF all fit it. That is not a clue, it is a coin toss printed
 * where a clue should be — and it costs a budget the long words need. Short
 * words are also the ones a solver fills from context first, so leaving them
 * blank costs the puzzle nothing.
 */
const MIN_WORD_LETTERS_FOR_REVEAL = 3

/**
 * Blanks a word must keep, however long it is.
 *
 * Two, because one blank in a known-length word with every other letter given
 * is a word the solver reads rather than solves. It is also what stops a short
 * word being handed over whole: a three-letter word may take one letter and no
 * more.
 */
const MIN_BLANKS_PER_WORD = 2

/**
 * Ceiling on one word, as a share of its letters.
 *
 * Half, and the ceiling is what the levels actually run into — on a short
 * phrase the per-word caps bind long before the level's own share does, so this
 * number, not `revealShare`, is what decides how open a gentle page feels. Any
 * lower and a five-letter word could take only one letter, which on a phrase
 * built from short words leaves a page with almost nothing on it.
 *
 * Half a word is still a puzzle because of where the halves fall:
 * `revealPositionsInWord` never lets two given letters touch, so half of WEEK
 * is W_E_ rather than WEE_.
 */
const MAX_WORD_REVEAL_SHARE = 0.5

/**
 * A word long enough that a page with no letter in it reads as unfair.
 *
 * Six letters is where a blank run stops being guessable from its neighbours.
 * `kdp-preflight.ts` refuses a puzzle that left one of these empty while the
 * budget still had room, which is the check that catches a future change to the
 * allocation order rather than a bad phrase.
 */
export const LONG_WORD_LETTERS = 6

/** Most a puzzle may give away, whatever the level asked for. */
export const MAX_REVEALED_SHARE = 0.45
/** Least a puzzle may give away before the page is a wall of blanks. */
export const MIN_REVEALED_SHARE = 0.12
/** Below this many blanks the phrase is being read, not solved. */
export const MIN_HIDDEN_LETTERS = 8

/** Letters this word may be given, before the phrase's budget has its say. */
export function wordRevealCap(letters: number): number {
  if (letters < MIN_WORD_LETTERS_FOR_REVEAL) return 0
  return Math.max(
    0,
    Math.min(Math.floor(letters * MAX_WORD_REVEAL_SHARE), letters - MIN_BLANKS_PER_WORD),
  )
}

/** Letters the whole phrase may be given at this level, after the hard caps. */
export function revealBudget(letterCount: number, share: number): number {
  if (letterCount <= 0) return 0
  const wanted = Math.round(letterCount * share)
  const ceiling = Math.floor(letterCount * MAX_REVEALED_SHARE)
  const hiddenFloor = Math.max(0, letterCount - MIN_HIDDEN_LETTERS)
  return Math.max(0, Math.min(wanted, ceiling, hiddenFloor))
}

/**
 * Hand the budget out one letter at a time, longest word first.
 *
 * Round-robin rather than proportional. Proportional shares look fairer written
 * down and are worse on the page: a phrase of one long word and six short ones
 * rounds every short word down to zero and pours the whole budget into the long
 * one, which is the clumping this function exists to prevent. Passing over the
 * words in length order and giving one letter each time spreads the budget
 * across as many words as it can reach, and only doubles back to a word that
 * already has one when every other eligible word has been served.
 */
export function allocateWordReveals(
  words: readonly PhraseWord[],
  budget: number,
): number[] {
  const counts = words.map(() => 0)
  const caps = words.map((word) => wordRevealCap(word.letters.length))
  // Longest first, and the earlier word wins a tie so the order never depends
  // on the sort being stable.
  const order = words
    .map((_, index) => index)
    .sort(
      (a, b) => words[b]!.letters.length - words[a]!.letters.length || a - b,
    )

  let left = Math.max(0, budget)
  let served = true
  while (left > 0 && served) {
    served = false
    for (const index of order) {
      if (left === 0) break
      if (counts[index]! >= caps[index]!) continue
      counts[index] += 1
      left -= 1
      served = true
    }
  }
  return counts
}

/**
 * Positions inside one word, spread as far apart as they will go.
 *
 * Farthest-point choice: take a first position, then repeatedly take whichever
 * remaining position sits furthest from everything already taken. Two given
 * letters side by side are the failure this avoids — GA_DEN has had its word
 * handed over, while G_RD_N asks the same solver for the same word and gets an
 * answer.
 *
 * The first position avoids the opening and closing letters of a word long
 * enough to have an inside. A first letter is the single most valuable letter
 * in a word and the one a solver can most often infer from grammar; spending
 * the budget in the middle buys more of the word's shape. Ties are broken by
 * the sheet's RNG, so the same word gets different letters on different pages.
 */
export function revealPositionsInWord(
  word: PhraseWord,
  count: number,
  rng: StudioRng,
): number[] {
  const n = word.letters.length
  const wanted = Math.max(0, Math.min(count, n))
  if (wanted === 0) return []

  const interior = n >= 4 ? rangeOf(1, n - 1) : rangeOf(0, n)
  const chosen = [rng.pick(interior.length > 0 ? interior : rangeOf(0, n))!]

  while (chosen.length < wanted) {
    let best: number[] = []
    let bestScore = -1
    for (let i = 0; i < n; i++) {
      if (chosen.includes(i)) continue
      const spread = Math.min(...chosen.map((taken) => Math.abs(taken - i)))
      // A letter the word does not already show is worth a little more than one
      // it does: two printed E's in one word tell a solver less than an E and
      // an N, even when the E's are well spread.
      const fresh = chosen.some((taken) => word.letters[taken] === word.letters[i])
        ? 0
        : 1
      const score = spread * 2 + fresh
      if (score > bestScore) {
        bestScore = score
        best = [i]
      } else if (score === bestScore) {
        best.push(i)
      }
    }
    if (best.length === 0) break
    chosen.push(rng.pick(best)!)
  }

  return chosen.sort((a, b) => a - b)
}

function rangeOf(from: number, to: number): number[] {
  const out: number[] = []
  for (let i = from; i < to; i++) out.push(i)
  return out
}

/**
 * The letters this puzzle prints in, as indices into the phrase's letters.
 *
 * Indices rather than characters, so the page and the solution can only ever
 * disagree by disagreeing about the phrase itself — which `phraseFromModel`
 * already rules out.
 */
export function planReveals(
  model: PhraseModel,
  share: number,
  rng: StudioRng,
): Set<number> {
  const revealed = new Set<number>()
  const budget = revealBudget(model.letterCount, share)
  if (budget === 0) return revealed

  const counts = allocateWordReveals(model.words, budget)
  model.words.forEach((word, index) => {
    for (const offset of revealPositionsInWord(word, counts[index]!, rng)) {
      revealed.add(word.firstLetterIndex + offset)
    }
  })
  return revealed
}

/** Letters this word has been given. */
export function revealedInWord(
  word: PhraseWord,
  revealed: ReadonlySet<number>,
): number {
  let count = 0
  for (let i = 0; i < word.letters.length; i++) {
    if (revealed.has(word.firstLetterIndex + i)) count += 1
  }
  return count
}
