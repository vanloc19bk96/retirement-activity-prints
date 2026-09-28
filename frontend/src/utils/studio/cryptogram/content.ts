import type { CryptogramSayingLength } from './levels'
import { isNearDuplicateSaying, isUnsafeCopy } from './content-quality'

export const CRYPTOGRAM_AI_EMPTY_MESSAGE =
  'We could not write enough clear retirement sayings for this theme. Try again, or pick a broader theme.'

/**
 * What the page tells a first-time solver, in two sentences.
 *
 * The reader of a retirement activity book has not necessarily met a
 * cryptogram before, and the rule that makes one solvable — the same code
 * always means the same letter — is the one thing they cannot work out by
 * looking at the page. Everything past that sentence is cut, because the
 * instruction strip is set at 20 px across the full column: a third sentence
 * is another two printed lines, and on a 5 x 8 interior those lines come
 * straight out of the puzzle.
 */
export const CRYPTOGRAM_INSTRUCTION =
  'Each code letter stands for the same letter every time, and never for itself. Write the saying on the lines.'

/** Added when the level fills letters in — otherwise they look like a misprint. */
export const CRYPTOGRAM_STARTER_NOTE = 'Some letters are filled in for you.'

export function cryptogramInstruction(starterLetters: number): string {
  return starterLetters > 0
    ? `${CRYPTOGRAM_INSTRUCTION} ${CRYPTOGRAM_STARTER_NOTE}`
    : CRYPTOGRAM_INSTRUCTION
}

const ALLOWED_RE = /^[A-Z]+(?: [A-Z]+)*$/
const MIN_WORDS = 4
const MAX_WORDS = 12
/**
 * Longest word the narrowest trim can set without breaking it across lines.
 * A cryptogram word split over two lines is unsolvable in practice, so the
 * writer is capped here and anything that slips through is dropped.
 */
const MAX_WORD_LETTERS = 10

/**
 * Longest a saying's words may run on average.
 *
 * This is a layout rule wearing a grammar rule's clothes. A slot is half an
 * inch wide, so a word is a solid block the wrap cannot break, and the page's
 * capacity depends far more on how the letters are divided than on how many
 * there are: the same fifty-two letters set as five ten-letter words take five
 * printed lines where eleven ordinary words take three.
 *
 * The page has to promise a puzzle count before any saying exists, and it can
 * only promise what the worst admissible saying allows. Bounding the average
 * here is what lets that promise be two or three puzzles a page instead of
 * one. English prose averages nearer four and a half letters a word, so this
 * turns almost no real saying away.
 */
const MAX_AVERAGE_WORD_LETTERS = 6.5

function minWordsFor(letters: number): number {
  return Math.max(MIN_WORDS, Math.ceil(letters / MAX_AVERAGE_WORD_LETTERS))
}

/** Mirrors `letterRange` in `backend/app/data/studio/cryptogram/prompt.json`. */
const LENGTH_RANGE: Record<CryptogramSayingLength, { min: number; max: number }> = {
  short: { min: 18, max: 32 },
  medium: { min: 30, max: 52 },
  long: { min: 46, max: 68 },
}

/**
 * Sayings to ask for when the page needs `need`.
 *
 * Over-requesting is one field in the same call, and it is the only defence
 * against a page that comes back one usable saying short after the quality
 * gates have run.
 */
export function candidateCountFor(need: number): number {
  return Math.max(need + 4, Math.ceil(need * 2.5))
}

/** An apostrophe inside a word: "DON'T", "IT’S", "GRANDMA'S". */
const INNER_APOSTROPHE_RE = /\p{L}['’‘`ʼ]\p{L}/u

/**
 * Contractions written without their apostrophe. The writer is told to use
 * letters only, and the obvious way to obey that is to drop the mark, which
 * leaves a misspelled word in the solution. Only forms that are never a word
 * of their own ("ITS", "LETS" and "WELL" are, so they stay).
 */
const APOSTROPHE_STUMPS = new Set([
  'AINT', 'ARENT', 'CANT', 'COULDNT', 'COULDVE', 'DIDNT', 'DOESNT', 'DONT',
  'HADNT', 'HASNT', 'HAVENT', 'HERES', 'IM', 'ISNT', 'ITLL', 'IVE', 'MIGHTNT',
  'MUSTNT', 'NEEDNT', 'SHANT', 'SHOULDNT', 'SHOULDVE', 'THATS', 'THERES',
  'THEYLL', 'THEYRE', 'THEYVE', 'WASNT', 'WERENT', 'WEVE', 'WHATS', 'WHERES',
  'WOULDNT', 'WOULDVE', 'YOUD', 'YOULL', 'YOURE', 'YOUVE',
])

/**
 * Uppercase A-Z words with single spaces, or '' when the line cannot be set
 * without changing what it says.
 *
 * Punctuation between words is only punctuation and becomes a space. Three
 * things are not, and splitting on them would print a broken saying whose
 * answer key reads back the break: an apostrophe inside a word ("DON'T" would
 * become "DON T", a one-letter word the solver takes for a misprint), a digit
 * ("AT 65" would lose its number), and a letter outside A-Z once accents are
 * folded off ("CAFÉ" is "CAFE"; a Greek or Cyrillic letter has no box to go
 * in). Those lines are refused so the writer's next saying takes the slot.
 */
export function normalizeSaying(raw: string): string {
  if (INNER_APOSTROPHE_RE.test(raw) || /\d/.test(raw)) return ''
  const folded = raw.normalize('NFKD').replace(/\p{M}+/gu, '').toUpperCase()
  if (/[^\P{L}A-Z]/u.test(folded)) return ''
  const text = folded
    .replace(/[^A-Z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.split(' ').some((word) => APOSTROPHE_STUMPS.has(word))) return ''
  return text
}

export function letterCount(text: string): number {
  return text.replace(/ /g, '').length
}

export function isValidSaying(text: string, length?: CryptogramSayingLength): boolean {
  if (!text || !ALLOWED_RE.test(text)) return false
  const words = text.split(' ').filter(Boolean)
  if (words.length < MIN_WORDS || words.length > MAX_WORDS) return false
  if (words.some((word) => word.length > MAX_WORD_LETTERS)) return false
  const letters = letterCount(text)
  if (words.length < minWordsFor(letters)) return false
  if (length) {
    const { min, max } = LENGTH_RANGE[length]
    return letters >= min && letters <= max
  }
  return letters >= LENGTH_RANGE.short.min && letters <= LENGTH_RANGE.long.max
}

/**
 * The hardest saying of this length the page could be handed.
 *
 * The form has to report how many puzzles a page holds before a single saying
 * exists, so it measures against the worst admissible shape: every letter the
 * band allows, packed into the longest words that still satisfy the average,
 * with the remainder as one-letter words. That is the arrangement that wraps
 * to the most printed lines, so anything `isValidSaying` accepts fits wherever
 * this one does.
 */
export function worstCaseSaying(length: CryptogramSayingLength): string {
  const letters = LENGTH_RANGE[length].max
  const minWords = Math.min(MAX_WORDS, minWordsFor(letters))
  const words: string[] = []
  let remaining = letters

  while (remaining > 0 && words.length < MAX_WORDS) {
    // Hold back a letter for each word still owed, so the shape stays legal.
    const reserved = Math.max(0, minWords - words.length - 1)
    const size = Math.max(1, Math.min(MAX_WORD_LETTERS, remaining - reserved))
    if (size > remaining) break
    words.push('A'.repeat(size))
    remaining -= size
  }
  while (words.length < minWords) words.push('A')
  return words.join(' ')
}

/**
 * Normalize and gate the writer's lines: drop malformed text, anything outside
 * the printable length band, repeats of a line already taken, and copy that
 * has no business in a book sold on KDP.
 */
export function selectAiSayings(
  remote: readonly string[] | undefined,
  options: { count: number; length: CryptogramSayingLength },
): string[] {
  const { count, length } = options
  const out: string[] = []
  const seen = new Set<string>()
  const limit = Math.max(count, candidateCountFor(count))
  for (const raw of remote ?? []) {
    const cleaned = normalizeSaying(String(raw ?? ''))
    if (!cleaned || seen.has(cleaned)) continue
    if (!isValidSaying(cleaned, length)) continue
    if (isUnsafeCopy(cleaned)) continue
    if (out.some((existing) => isNearDuplicateSaying(existing, cleaned))) continue
    seen.add(cleaned)
    out.push(cleaned)
    if (out.length >= limit) break
  }
  return out
}
