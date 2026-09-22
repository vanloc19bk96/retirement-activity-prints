/**
 * The printed row, described one slot at a time.
 *
 * The old sheet built a masked *string* — "G_RD_N_NG" — printed it as one run
 * of text, and drew the whole answer somewhere else on the row. Two things
 * followed from that. Underscores are a typographic accident, not a writing
 * space: at large-print sizes they run together into a rule with no gaps, and
 * there is nowhere above them to put a letter. And because the prompt and the
 * answer were two independent pieces of text, nothing in the layout tied them
 * together — they could disagree, and on the solution page the answer was
 * printed over the top of the prompt it was meant to complete.
 *
 * A slot list fixes both. Every letter of the answer owns one slot: consonants
 * print, vowels leave a writing rule, and the vowel a solver is supposed to
 * write is drawn in that same slot as a hidden object. So the solution page is
 * this page with the vowels filled in, at the exact positions the blanks were,
 * and the prompt cannot drift from the answer because both are read off the
 * same string.
 *
 * Y is never a blank. It is a vowel often enough to be argued about and a
 * consonant often enough that blanking it turns HAPPY into H_PP_, which reads
 * as a word nobody can place.
 */

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U'])

export interface MissingVowelsSlot {
  /** Letter of the answer at this slot; empty for the gap between two words. */
  letter: string
  /** True when this letter is a vowel the solver has to write in. */
  blank: boolean
  /** True for the gap between two words — no letter, no writing rule. */
  gap: boolean
}

export function isVowel(ch: string): boolean {
  return VOWELS.has(ch.toUpperCase())
}

/** Uppercase A–Z only, spaces stripped: "Road Trip" → "ROADTRIP". */
export function letterToken(raw: string): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}

/** Uppercase words of an answer: "Road Trip" → ["ROAD", "TRIP"]. */
export function answerWords(raw: string): string[] {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** One slot per letter, plus one gap slot between words. */
export function toSlots(answer: string): MissingVowelsSlot[] {
  const slots: MissingVowelsSlot[] = []
  const words = answerWords(answer)
  words.forEach((word, index) => {
    if (index > 0) slots.push({ letter: '', blank: false, gap: true })
    for (const letter of word) {
      slots.push({ letter, blank: VOWELS.has(letter), gap: false })
    }
  })
  return slots
}

/**
 * The row as flat text — "G_RD_N_NG".
 *
 * Not what the page draws; the page draws slots. This is how a test, a preflight
 * check or a duplicate filter talks about a row in one string.
 */
export function maskedText(answer: string): string {
  return toSlots(answer)
    .map((slot) => (slot.gap ? ' ' : slot.blank ? '_' : slot.letter))
    .join('')
}

export function vowelCount(answer: string): number {
  let count = 0
  for (const ch of letterToken(answer)) {
    if (VOWELS.has(ch)) count += 1
  }
  return count
}

export function consonantCount(answer: string): number {
  let count = 0
  for (const ch of letterToken(answer)) {
    if (!VOWELS.has(ch)) count += 1
  }
  return count
}

/** Fewest blanks a row can carry and still be a puzzle rather than a word. */
export const MIN_BLANKS = 2
/** Below this there is not enough of the word left to recognise it. */
export const MIN_CONSONANTS = 2

/**
 * A row worth printing.
 *
 * One blank is not a puzzle — with a clue beside it, it is a spelling test with
 * a single square. Two consonants is the other end: R_C_ leaves a solver
 * nothing to recognise, and the clue then has to carry the whole row.
 */
export function isPlayableAnswer(answer: string): boolean {
  if (vowelCount(answer) < MIN_BLANKS) return false
  if (consonantCount(answer) < MIN_CONSONANTS) return false
  return true
}
