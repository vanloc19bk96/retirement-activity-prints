export type PhraseFinderLength = 'short' | 'medium' | 'long'

/**
 * What a Phrase Finder page asks the content service for.
 *
 * `length` is the only shape field, and it carries more than it looks. The page
 * sets one phrase as a run of write-in slots that wraps across rows, so the
 * letter count decides how tall a puzzle stands and therefore how many fit a
 * trim. Words are bounded on the service side rather than here, because the
 * rule they enforce is a layout rule — a word is never broken across rows.
 *
 * Unlike the other saying games, the reply may carry punctuation. A phrase
 * shown as blanks is solved from its shape, and an apostrophe or a hyphen is
 * part of that shape: DON'T and WELL-EARNED read as one word with a mark in
 * it, not as two. The supported set is deliberately small (see
 * `PHRASE_FINDER_MARKS`) because every mark is a glyph the page has to set at
 * large print without turning the row into a line of noise.
 *
 * `maxClueChars` goes out with the request because the clue prints in a column
 * this page has already sized. A clue written past that budget is a layout bug
 * rather than a slightly long clue, so the service drops it there.
 *
 * `itemCount` over-requests on purpose: the page keeps the candidates it can
 * both lay out and validate, so a reply of exactly two may print one.
 */
export interface PhraseFinderRequest {
  theme: string
  /** Phrase candidates to write — the page keeps the ones it can set. */
  itemCount: number
  length: PhraseFinderLength
  /** Longest clue the printed column was laid out for. */
  maxClueChars: number
  seed: number
  /** Recently printed phrases for this template + theme; the model avoids them. */
  avoid?: string[]
  locale?: string
}

/**
 * One printed puzzle: the saying, and the clue that reaches it.
 *
 * The clue is not decoration, and it is the difference between this game and a
 * guessing game. A cryptogram can be reasoned out from its own cipher and a
 * missing-vowels row from its consonants, but these sayings are written fresh
 * for a theme rather than quoted from anywhere a solver could already know —
 * so a row of blanks, its word lengths and a third of its letters do not
 * single out one wording. Several plain English sentences fit the same row and
 * the answer page prints exactly one of them. The clue is what makes that one
 * the answer.
 */
export interface PhraseFinderItem {
  /** Uppercase saying: A–Z, single spaces, and the supported marks only. */
  text: string
  /** One line of prose, printed above the blanks it belongs to. */
  clue: string
}

export interface PhraseFinderResponse {
  items: PhraseFinderItem[]
}
