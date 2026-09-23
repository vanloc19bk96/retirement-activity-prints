import type { PhraseFinderItem } from '@/types/studio-phrase-finder.types'
import { isNearDuplicateSaying, isUnsafeCopy } from '../cryptogram/content-quality'
import {
  hasOnlySupportedCharacters,
  letterCount,
  letterToken,
  normalizePhrase,
  phraseWords,
  toPhraseModel,
} from './phrase'
import { MIN_REVEALED_SHARE, wordRevealCap } from './reveal'
import type { PhraseFinderLength } from './levels'

export type { PhraseFinderItem }

export const PHRASE_FINDER_DEFAULT_TITLE = 'Phrase Finder'

export const PHRASE_FINDER_AI_EMPTY_MESSAGE =
  'We could not write enough clear retirement phrases and clues for this theme. Try again, or pick a broader theme.'

export const PHRASE_FINDER_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a Phrase Finder page at this level. Pick a larger page in Settings, or a gentler level.'

/**
 * What the page tells a first-time solver, in two short sentences.
 *
 * The one thing a reader cannot work out by looking is that the blanks are
 * letters of a single phrase rather than a list of separate words — so that
 * comes first. The rest names what they are meant to solve *from*, in the order
 * they should reach for it: the clue, then the printed letters, then the shape.
 * A solver who does not realise the word lengths and the punctuation are clues
 * too will treat the printed letters as the only information on the page.
 *
 * Nothing past those two sentences. The instruction strip sets at 20 px across
 * the full column, so a third sentence is two more printed lines, and on a
 * 5 x 8 interior those lines come straight out of the puzzle.
 */
export const PHRASE_FINDER_INSTRUCTION =
  'Each line of blanks spells one retirement saying, a letter to a blank. ' +
  'Read the clue above it, then use the letters already filled in, the word lengths and the punctuation to finish it.'

export function phraseFinderInstruction(): string {
  return PHRASE_FINDER_INSTRUCTION
}

/**
 * Longest clue the printed column was planned for.
 *
 * Measured against the narrowest interior this app sells rather than chosen for
 * how much a writer might want to say: at the writing floor on a 5 x 8 page a
 * clue of this length still breaks into the two lines `MAX_CLUE_LINES` reserves.
 * Raising it without re-measuring that trim buys a better clue on a big page
 * and an error card on a small one.
 */
export const MAX_CLUE_CHARS = 48

/** Below this a "clue" is a label, not something a solver can reason from. */
export const MIN_CLUE_CHARS = 12

/**
 * How much of a word of the saying a clue may echo before it hands it over.
 *
 * Only the content words are protected — see `clueGivesAnswerAway`. Four
 * letters catches the whole family (GARDEN / GARDENING / GARDENER) without
 * rejecting the honest near-misses a longer prefix would let through.
 */
export const CLUE_STEM_LETTERS = 4

/**
 * Shortest word of a saying a clue is not allowed to echo.
 *
 * A saying is a whole sentence, so THE, AND, OUR and OFF turn up in half the
 * clues ever written and give nothing away there. Protecting them would reject
 * most usable clues; protecting only the words that carry the sense is what
 * makes the check mean something.
 */
export const CLUE_CONTENT_WORD_LETTERS = 4

/**
 * Longest word the narrowest trim can set without breaking it across rows.
 *
 * A word split over two rows cannot be read as a word, so the wrap never breaks
 * one — which makes the longest word a hard width the narrowest column has to
 * hold. Ten letters is what a 5 x 8 interior fits at the writing floor in
 * `layout.ts`; anything longer would print an error card instead of a page.
 */
export const MAX_WORD_LETTERS = 10

/**
 * Longest a phrase's words may run on average.
 *
 * A layout rule wearing a grammar rule's clothes, and the one that decides how
 * many puzzles a page can promise. A word is a block the wrap cannot break, so
 * capacity depends far more on how the letters are divided than on how many
 * there are: forty-five letters as five nine-letter words take five printed
 * rows where eleven ordinary words take three. The page has to promise a puzzle
 * count before a single phrase exists, and it can only promise what the worst
 * admissible shape allows — bounding the average is what makes that promise two
 * or three puzzles instead of one. English prose runs nearer four and a half
 * letters to the word, so almost no real saying is turned away.
 */
const MAX_AVERAGE_WORD_LETTERS = 5.5

/**
 * Marks one phrase may carry.
 *
 * Punctuation is a clue here — an apostrophe two letters from the end of a word
 * is worth as much as a given letter — but each mark is also a glyph set
 * between two writing rules, and a row with five of them reads as noise rather
 * than as a phrase. Three is enough for the shapes that matter (a possessive, a
 * contraction, a comma before the turn) without letting a page fill with specks.
 */
export const MAX_MARKS = 3

export interface PhraseFinderBand {
  minLetters: number
  maxLetters: number
  /**
   * Words the phrase must hold.
   *
   * The floor is what makes the puzzle a *phrase*: three long words with a
   * quarter of their letters given is a guessing game, where eight ordinary
   * words give a solver grammar to lean on. The ceiling is the page — every
   * word boundary is a gap wider than a letter slot, and past the cap a row is
   * more air than puzzle.
   */
  minWords: number
  maxWords: number
}

/**
 * Letters and words each level asks the writer for.
 *
 * Mirrors `bands` in `backend/app/data/studio/phrase-finder/prompt.json` and
 * must be edited in both places together — a phrase the page cannot set is
 * worse than one never written.
 */
const BANDS: Record<PhraseFinderLength, PhraseFinderBand> = {
  short: { minLetters: 20, maxLetters: 32, minWords: 5, maxWords: 9 },
  medium: { minLetters: 32, maxLetters: 46, minWords: 8, maxWords: 13 },
  long: { minLetters: 46, maxLetters: 60, minWords: 11, maxWords: 16 },
}

export function bandFor(length: PhraseFinderLength): PhraseFinderBand {
  return BANDS[length]
}

function minWordsFor(letters: number, band: PhraseFinderBand): number {
  return Math.max(band.minWords, Math.ceil(letters / MAX_AVERAGE_WORD_LETTERS))
}

/**
 * Phrases to ask for when the page needs `need`.
 *
 * Over-requesting is one field in the same call, and it is the only defence
 * against a page that comes back a phrase short once the shape gates, the
 * clue gate and the fairness gate have run. The fairness gate is the expensive
 * one: a phrase can read beautifully and still have no word long enough to
 * carry a given letter.
 */
export function candidateCountFor(need: number): number {
  return Math.max(need + 5, Math.ceil(need * 3))
}

/** Marks and spaces dropped, so two phrases compare as text: "DON'T GO." → "DONT GO". */
export function strippedWords(text: string): string {
  return phraseWords(text)
    .map((word) => word.replace(/[^A-Z]/g, ''))
    .filter(Boolean)
    .join(' ')
}

export function markCount(text: string): number {
  return text.replace(/[A-Z ]/g, '').length
}

/**
 * One line of sentence-case prose, no trailing stop and no quote marks.
 *
 * Mirrors `_normalize_clue` on the service. A full stop over a row of writing
 * rules reads as a stray mark at this size, and the clue is never a sentence to
 * begin with.
 */
export function normalizeClue(raw: unknown): string {
  const text = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/[.…]+$/, '')
    .trim()
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * A clue that hands its own saying over.
 *
 * Not the whole sentence, only the words carrying its sense. A saying is prose,
 * so a clue that happens to use THE or AND has given nothing away — but a clue
 * reading "gardening mornings" over a row whose long word is GARDEN has printed
 * half the answer above the blanks it was meant to make solvable.
 */
export function clueGivesAnswerAway(clue: string, phrase: string): boolean {
  const tokens = clue.toUpperCase().split(/[^A-Z]+/).filter(Boolean)
  for (const word of phraseWords(phrase)) {
    const letters = letterToken(word)
    if (letters.length < CLUE_CONTENT_WORD_LETTERS) continue
    const stem = letters.slice(0, CLUE_STEM_LETTERS)
    if (tokens.some((token) => token.startsWith(stem))) return true
  }
  return false
}

export function isValidClue(clue: string, phrase: string): boolean {
  if (clue.length < MIN_CLUE_CHARS || clue.length > MAX_CLUE_CHARS) return false
  if (clueGivesAnswerAway(clue, phrase)) return false
  return !isUnsafeCopy(clue)
}

/**
 * Letters this phrase could give away without breaking a word's own caps.
 *
 * A backstop, and openly so. `reveal.ts` refuses to hand any word more than
 * half its letters, so a phrase of nothing but two-letter words would pass
 * every length check and then print as a wall of blanks with the budget
 * unspent. The bands make that phrase impossible today — nine two-letter words
 * cannot reach twenty letters — so this check does not currently fire.
 *
 * It stays because the thing it guards is not the bands, it is the *pairing* of
 * the bands with the per-word caps, and those two numbers live in different
 * files and are tuned for different reasons. Widening a word band or tightening
 * `wordRevealCap` would break the pairing silently, and the failure it would
 * produce — a printed page nobody can start — is the most expensive one this
 * game has.
 */
export function revealCapacity(text: string): number {
  return toPhraseModel(text).words.reduce(
    (total, word) => total + wordRevealCap(word.letters.length),
    0,
  )
}

export function isValidPhrase(text: string, length?: PhraseFinderLength): boolean {
  if (!text || !hasOnlySupportedCharacters(text)) return false
  if (markCount(text) > MAX_MARKS) return false

  const words = phraseWords(text)
  if (words.some((word) => letterToken(word).length > MAX_WORD_LETTERS)) return false

  const letters = letterCount(text)
  const bands = length ? [BANDS[length]] : Object.values(BANDS)
  const fitsBand = bands.some(
    (band) =>
      letters >= band.minLetters &&
      letters <= band.maxLetters &&
      words.length >= minWordsFor(letters, band) &&
      words.length <= band.maxWords,
  )
  if (!fitsBand) return false

  return revealCapacity(text) >= Math.ceil(letters * MIN_REVEALED_SHARE)
}

/** A phrase and its clue, both as the page would have to print them. */
export function isValidItem(
  item: PhraseFinderItem,
  length?: PhraseFinderLength,
): boolean {
  if (!isValidPhrase(item.text, length)) return false
  return isValidClue(item.clue, item.text)
}

/**
 * The hardest phrase of this length the page could be handed.
 *
 * Every letter the band allows, split into as many words as it allows, with the
 * longest legal words taken first and the remainder left as one-letter words —
 * then the full allowance of marks on top.
 *
 * Both halves of that shape are load-bearing, and taking only one of them is
 * the mistake this replaced. The longest-words-first pass is what strands
 * space: a ten-letter block cannot share a row with another one, so the column
 * beside it goes to waste and the phrase wraps to more rows than its letter
 * count suggests. The maximum word *count* is what pays for gaps: a word break
 * is wider than a letter slot, so fifteen breaks cost more than five do, and a
 * probe built from a handful of long words alone measured narrower than the
 * ordinary fifteen-word sayings a writer actually returns — which is a promise
 * the page then could not keep on a 5 x 8 interior.
 *
 * Anything `isValidPhrase` accepts fits wherever this one does, which is what
 * lets the form's note be a promise rather than a guess.
 */
export function worstCasePhrase(length: PhraseFinderLength): string {
  const band = BANDS[length]
  const letters = band.maxLetters
  const wordCount = Math.max(band.maxWords, minWordsFor(letters, band))
  const words: string[] = []
  let remaining = letters

  while (remaining > 0 && words.length < wordCount) {
    // Hold back a letter for each word still owed, so the shape stays legal.
    const reserved = Math.max(0, wordCount - words.length - 1)
    const size = Math.max(1, Math.min(MAX_WORD_LETTERS, remaining - reserved))
    if (size > remaining) break
    words.push('N'.repeat(size))
    remaining -= size
  }
  while (words.length < wordCount) words.push('N')

  // Marks widen a row without adding a blank, so the probe carries its full
  // allowance, spread across different words — three on one word is a shape the
  // content gate would reject and is not what is being measured here.
  let marks = 0
  for (let i = 1; i < words.length && marks < MAX_MARKS; i += 2) {
    const word = words[i]!
    words[i] =
      word.length >= 3 ? `${word.slice(0, -1)}'${word.slice(-1)}` : `${word},`
    marks += 1
  }
  return words.join(' ')
}

/**
 * The widest clue the budget allows, in wide letters.
 *
 * Paired with `worstCasePhrase` so the page is measured against the tallest
 * puzzle block a writer could return: the longest phrase the band permits, with
 * a clue that fills its whole character budget in glyphs wider than ordinary
 * prose. A probe of typical clues would promise a puzzle count the first wordy
 * clue of a book run then broke.
 */
export function worstCaseClue(): string {
  return 'Wandering '.repeat(8).slice(0, MAX_CLUE_CHARS).trim()
}

export function worstCaseItem(length: PhraseFinderLength): PhraseFinderItem {
  return { text: worstCasePhrase(length), clue: worstCaseClue() }
}

/**
 * Normalize and gate the writer's replies.
 *
 * Drops malformed text, anything outside the printable band, a phrase with
 * nowhere to put its given letters, a phrase whose clue is missing, too long
 * for its column or echoing the answer, repeats of a line already taken, and
 * copy that has no business in a book sold on KDP. Near-duplicates are compared
 * with their marks stripped, because "EVERY DAY IS A SATURDAY" and "EVERY DAY
 * IS A SATURDAY!" are one phrase printed twice however differently they
 * punctuate — and one clue used for two sayings is dropped for the same reason
 * in reverse: on a printed page it reads as the book asking one question twice.
 */
export function selectAiItems(
  remote: readonly PhraseFinderItem[] | undefined,
  options: { count: number; length: PhraseFinderLength },
): PhraseFinderItem[] {
  const { count, length } = options
  const out: PhraseFinderItem[] = []
  const seen = new Set<string>()
  const seenClues = new Set<string>()
  const limit = Math.max(count, candidateCountFor(count))

  for (const raw of remote ?? []) {
    const text = normalizePhrase(raw?.text)
    const clue = normalizeClue(raw?.clue)
    if (!text) continue
    const plain = strippedWords(text)
    if (seen.has(plain)) continue
    if (!isValidPhrase(text, length)) continue
    if (!isValidClue(clue, text)) continue
    if (isUnsafeCopy(text)) continue
    if (out.some((existing) => isNearDuplicateSaying(strippedWords(existing.text), plain))) {
      continue
    }
    const clueKey = clue.toUpperCase().replace(/[^A-Z]/g, '')
    if (seenClues.has(clueKey)) continue
    seen.add(plain)
    seenClues.add(clueKey)
    out.push({ text, clue })
    if (out.length >= limit) break
  }
  return out
}
