import { createRng, deriveSeed, type StudioRng } from '../studio-rng'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import lexiconData from '@/data/studio/word-wheel/lexicon.json'
import targetData from '@/data/studio/word-wheel/targets.json'
import {
  WORD_WHEEL_LETTER_COUNT,
  WORD_WHEEL_MIN_WORD_LENGTH,
  type WordWheelLevel,
} from './levels'

/**
 * The puzzle itself: nine letters, one of them in the middle, and everything
 * that can be made from them.
 *
 * Built in the one order that cannot produce a broken page. A wheel drawn first
 * and a long word looked for afterwards is a wheel that sometimes has no long
 * word — and "one word uses all nine letters" printed over nine letters that
 * spell nothing is the single fault this page cannot survive, because a solver
 * cannot tell it from their own failure. So the nine-letter answer is chosen
 * first, from a curated list, and the wheel is simply its letters: the promised
 * word exists because the wheel was made out of it.
 */

export const WORD_WHEEL_DEFAULT_TITLE = 'Word Wheel'

export const WORD_WHEEL_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a word wheel — the letters would print below large-print size. ' +
  'Pick a larger page in Settings.'

export const WORD_WHEEL_BUILD_FAILED_MESSAGE =
  'Could not build a word wheel at this level. Try a fresh variation code, or a gentler level.'

/** Outer letters — the wheel is one centre and eight around it. */
export const WORD_WHEEL_OUTER_COUNT = WORD_WHEEL_LETTER_COUNT - 1

/**
 * How many recently printed nine-letter words a new wheel refuses to reuse.
 *
 * Forty is a long book's worth of games, and the thinnest level's usable target
 * list is comfortably larger, so a book never prints the same wheel twice and
 * never runs out of candidates either. The store is the Studio's own variety
 * ledger, which persists between sittings — a book built over three evenings
 * still avoids repeating itself.
 *
 * A wheel repeated is worse than a word search repeated: its nine letters are
 * the first thing on the page and a reader who solved it three days ago
 * recognises them instantly.
 */
export const WORD_WHEEL_AVOID_WINDOW = 40

/** One bucket for the whole template: a book must not repeat a wheel per level. */
const VARIETY_KEY = studioVarietyKey('word-wheel', 'target')

export interface WordWheelPuzzle {
  /** The nine-letter word. Uses every wheel letter exactly once. */
  target: string
  /** The letter every answer must contain. */
  center: string
  /** The eight letters around the rim, in the order the wheel prints them. */
  outer: string[]
  /**
   * Every word this wheel makes, from the curated lexicon, shortest first.
   * Never contains `target` — the long word is printed on its own line.
   */
  answers: string[]
  /** Shortest word on this page, from the level. */
  minWordLength: number
}

export type LetterCounts = Record<string, number>

export function letterCounts(word: string): LetterCounts {
  const counts: LetterCounts = {}
  for (const letter of word) counts[letter] = (counts[letter] ?? 0) + 1
  return counts
}

/** Normalised to the alphabet the wheel prints: A–Z, uppercase, nothing else. */
export function normalizeWord(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '')
}

/**
 * True when `word` can be spelled from `available` without reusing a letter.
 *
 * Multiplicity is the whole point. AFTERNOON puts two O's and two N's on the
 * wheel, so NOON is fair and ONION is not, and a subset test that only asked
 * "is every letter present" would print ONION on the answer page of a wheel
 * that cannot spell it.
 */
export function fitsLetters(word: string, available: LetterCounts): boolean {
  return countsFit(letterCounts(word), available)
}

/** `need` is spellable from `available`, counting repeats. */
function countsFit(need: LetterCounts, available: LetterCounts): boolean {
  for (const letter of Object.keys(need)) {
    if ((available[letter] ?? 0) < need[letter]!) return false
  }
  return true
}

interface LexiconEntry {
  word: string
  counts: LetterCounts
}

let cachedLexicon: LexiconEntry[] | null = null

/**
 * The answer lexicon: everyday words an adult reader recognises on sight.
 *
 * Deliberately not a full dictionary. A page that answers its own puzzle with
 * ABSEIL and CAROB is a page a reader argues with, and every entry printed on
 * the solution is a word this book is now vouching for. Anything the lexicon
 * omits is simply a word the solution does not claim — which is why the page
 * says the list is what it found, not everything there is.
 */
export function loadWordWheelLexicon(): LexiconEntry[] {
  if (!cachedLexicon) {
    const seen = new Set<string>()
    cachedLexicon = []
    for (const raw of lexiconData as string[]) {
      const word = normalizeWord(raw)
      if (word.length < WORD_WHEEL_MIN_WORD_LENGTH) continue
      if (word.length > WORD_WHEEL_LETTER_COUNT) continue
      if (seen.has(word)) continue
      if (isUnsafeCopy(word)) continue
      seen.add(word)
      cachedLexicon.push({ word, counts: letterCounts(word) })
    }
  }
  return cachedLexicon
}

let cachedTargets: string[] | null = null

/** Nine-letter words this game may hide, already gated for print safety. */
export function loadWordWheelTargets(): string[] {
  if (!cachedTargets) {
    const seen = new Set<string>()
    cachedTargets = []
    for (const raw of targetData as string[]) {
      const word = normalizeWord(raw)
      if (word.length !== WORD_WHEEL_LETTER_COUNT) continue
      if (seen.has(word)) continue
      if (isUnsafeCopy(word)) continue
      seen.add(word)
      cachedTargets.push(word)
    }
  }
  return cachedTargets
}

/** Sorted-letters key: "GARDENING" → "ADEGGINNR". Two anagrams share one key. */
export function lettersKey(word: string): string {
  return [...word].sort().join('')
}

/**
 * Every word the nine letters make at all, whatever the middle letter is.
 *
 * Measured once per wheel rather than once per candidate centre. The subset
 * test is the expensive part of building this puzzle — nearly five thousand
 * words against nine letters — and running it again for each of the seven or
 * eight letters a target offers made a forty-game book take seconds of pure
 * arithmetic before a single object was drawn. Filtering this list by the
 * middle letter afterwards is a substring test on a few dozen words.
 */
function wheelWords(target: string, minWordLength: number): string[] {
  const available = letterCounts(target)
  const out: string[] = []
  for (const entry of loadWordWheelLexicon()) {
    if (entry.word.length < minWordLength) continue
    if (entry.word === target) continue
    if (!countsFit(entry.counts, available)) continue
    out.push(entry.word)
  }
  return out
}

/**
 * Every word this wheel makes with `center` in it, shortest first.
 *
 * Sorted by length and then alphabetically, which is how a printed solution is
 * read: a solver checks the short finds in a block and then looks at what they
 * missed at the long end. The target is excluded — it has its own line, and
 * listing it twice would give the page's one secret away in the list.
 */
export function answersFor(options: {
  target: string
  center: string
  minWordLength: number
}): string[] {
  const { target, center, minWordLength } = options
  return sortAnswers(
    wheelWords(target, minWordLength).filter((word) => word.includes(center)),
  )
}

/** Print order for an answer list: shortest first, alphabetical within a length. */
export function sortAnswers(words: readonly string[]): string[] {
  return [...words].sort((a, b) => a.length - b.length || a.localeCompare(b))
}

export interface WordWheelCenterChoice {
  center: string
  answers: string[]
}

/**
 * What every letter of the target is worth as a middle letter.
 *
 * Cached per target and word length: a book run asks for this repeatedly, both
 * across its games and across the retries the duplicate check makes, and the
 * answer never changes — it is a fact about a fixed word list.
 */
const centerCache = new Map<string, WordWheelCenterChoice[]>()

function scoredCenters(target: string, minWordLength: number): WordWheelCenterChoice[] {
  const key = `${target}|${minWordLength}`
  let scored = centerCache.get(key)
  if (!scored) {
    const words = wheelWords(target, minWordLength)
    scored = [...new Set(target)]
      .map((center) => ({
        center,
        answers: sortAnswers(words.filter((word) => word.includes(center))),
      }))
      .sort((a, b) => a.answers.length - b.answers.length || a.center.localeCompare(b.center))
    centerCache.set(key, scored)
  }
  return scored
}

/**
 * Centre letters worth using.
 *
 * The centre is the only letter that appears in every answer, so it decides how
 * much the wheel is worth solving: GARDENING centred on G makes a page, centred
 * on I it makes a handful of words and an afternoon of frustration. Every letter
 * of the target is measured, and the ones the level would actually enjoy are
 * returned — not simply the richest, because the richest is often too rich. A
 * wheel that makes fifty words prints an answer list that will not fit beside it
 * on a 5 x 8 interior, and asks a reader for an afternoon they did not agree to.
 *
 * When nothing lands inside the band, the leanest wheel above the floor is used
 * rather than the fattest: over the ceiling is a page that still works and reads
 * long, and there is no reason to pick the longest of those.
 */
export function centerChoicesFor(options: {
  target: string
  minWordLength: number
  minAnswers: number
  maxAnswers: number
}): WordWheelCenterChoice[] {
  const { target, minWordLength, minAnswers, maxAnswers } = options
  const eligible = scoredCenters(target, minWordLength).filter(
    (choice) => choice.answers.length >= minAnswers,
  )
  if (eligible.length === 0) return []
  const inBand = eligible.filter((choice) => choice.answers.length <= maxAnswers)
  return inBand.length > 0 ? inBand : [eligible[0]!]
}

/**
 * Where the eight rim letters sit.
 *
 * Shuffled, then checked against the one arrangement that would give the page
 * away: the rim reading as the target with its centre letter taken out. It
 * costs nothing to test and it is the only ordering a solver could read the
 * answer straight off the wheel from.
 */
export function arrangeOuterLetters(
  target: string,
  center: string,
  rng: StudioRng,
): string[] {
  const rim = removeOne([...target], center)
  const giveaway = rim.join('')
  let arranged = rng.shuffle(rim)
  for (let attempt = 0; attempt < 8 && ringReads(arranged, giveaway); attempt++) {
    arranged = rng.shuffle(rim)
  }
  return arranged
}

/** Drop the first occurrence of `letter`, so repeats survive on the rim. */
function removeOne(letters: string[], letter: string): string[] {
  const at = letters.indexOf(letter)
  return at < 0 ? [...letters] : [...letters.slice(0, at), ...letters.slice(at + 1)]
}

/** True when the rim spells `run` from some starting point, either way round. */
function ringReads(rim: readonly string[], run: string): boolean {
  const doubled = [...rim, ...rim].join('')
  const reversed = [...rim].reverse()
  const doubledBack = [...reversed, ...reversed].join('')
  return doubled.includes(run) || doubledBack.includes(run)
}

/**
 * Everything that has to be true before a wheel is allowed onto a page.
 *
 * Checked against the built puzzle rather than trusted from the code that built
 * it, because the two failures this page cannot recover from are both silent: a
 * nine-letter word its own wheel cannot spell, and an answer list holding a word
 * the solver had no letters for. Both look exactly like a correct page until
 * someone sits down with a pencil.
 */
export function wordWheelFaults(puzzle: WordWheelPuzzle): string[] {
  const faults: string[] = []
  const { target, center, outer, answers, minWordLength } = puzzle

  if (target.length !== WORD_WHEEL_LETTER_COUNT) {
    faults.push('The hidden word is not nine letters long.')
  }
  if (outer.length !== WORD_WHEEL_OUTER_COUNT) {
    faults.push('The wheel does not hold eight letters around its center.')
  }
  if (center.length !== 1 || !/^[A-Z]$/.test(center)) {
    faults.push('The wheel has no single center letter.')
  }
  // The wheel and the hidden word must be the same nine letters, counted — not
  // the same set. A wheel that quietly lost one of AFTERNOON's two O's spells
  // the long word nowhere.
  if (lettersKey(center + outer.join('')) !== lettersKey(target)) {
    faults.push('The wheel letters do not spell the hidden word exactly.')
  }
  if (isUnsafeCopy(target)) {
    faults.push('The hidden word is not suitable for a published activity book.')
  }

  const available = letterCounts(target)
  const seen = new Set<string>()
  for (const answer of answers) {
    if (answer === target) {
      faults.push('The hidden word is also printed in the answer list.')
      break
    }
    if (seen.has(answer)) {
      faults.push('The answer list prints the same word twice.')
      break
    }
    seen.add(answer)
    if (answer.length < minWordLength) {
      faults.push('An answer is shorter than this level prints.')
      break
    }
    if (!answer.includes(center)) {
      faults.push('An answer does not use the center letter.')
      break
    }
    if (!fitsLetters(answer, available)) {
      faults.push('An answer uses letters the wheel does not hold.')
      break
    }
    if (isUnsafeCopy(answer)) {
      faults.push('An answer is not suitable for a published activity book.')
      break
    }
  }

  return faults
}

/**
 * One wheel, or null.
 *
 * Draws from the curated nine-letter list in a seeded shuffle, skipping what
 * this book has printed lately, and keeps the first target that clears the
 * level's floor with a centre letter worth using. Null means no target did,
 * which the caller answers with a message rather than a thin puzzle.
 */
export function buildWordWheelPuzzle(options: {
  level: WordWheelLevel
  seed: number
}): WordWheelPuzzle | null {
  const { level, seed } = options
  const rng = createRng(deriveSeed(seed, 'word-wheel:target'))
  const pool = loadWordWheelTargets()
  if (pool.length === 0) return null

  const recent = new Set(studioAvoidList(VARIETY_KEY, WORD_WHEEL_AVOID_WINDOW))
  const fresh = pool.filter((target) => !recent.has(target))
  // Every target used lately still beats no puzzle: the ledger reopens rather
  // than failing a page.
  const candidates = rng.shuffle(fresh.length > 0 ? fresh : pool)

  for (const target of candidates) {
    const choices = centerChoicesFor({
      target,
      minWordLength: level.minWordLength,
      minAnswers: level.minAnswers,
      maxAnswers: level.maxAnswers,
    })
    if (choices.length === 0) continue
    const choice = rng.pick(choices)
    const puzzle: WordWheelPuzzle = {
      target,
      center: choice.center,
      outer: arrangeOuterLetters(target, choice.center, rng),
      answers: choice.answers,
      minWordLength: level.minWordLength,
    }
    if (wordWheelFaults(puzzle).length > 0) continue
    rememberStudioContent(VARIETY_KEY, [target])
    return puzzle
  }

  return null
}
