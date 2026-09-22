/**
 * One row of a missing-vowels sheet: the complete answer, and the clue that
 * reaches it.
 *
 * The clue is not decoration. A masked word has more than one fair reading —
 * B_LL is BALL, BELL and BULL — and the solution page prints only one of them,
 * so a sheet without clues can be wrong about its own answers. The page filters
 * out patterns a common word could fill two ways as well, but the clue is what
 * a solver actually reads, and it is what makes the puzzle solvable rather than
 * a guessing game.
 */
export interface MissingVowelsClue {
  /** Complete, with every vowel. The page removes them. */
  answer: string
  clue: string
}

export interface MissingVowelsRequest {
  theme: string
  count: number
  /** Letters excluding spaces — the band the level asked for. */
  minLetters: number
  maxLetters: number
  /** Words the answer may run to, so a phrase still fits one printed row. */
  maxWords: number
  /** Longest clue the printed column was laid out for. */
  maxClueChars: number
  seed: number
  /** Recently printed answers for this template + theme; the model avoids them. */
  avoid?: string[]
  locale?: string
}

export interface MissingVowelsResponse {
  items: MissingVowelsClue[]
}

/** One row after the page has normalized and accepted it. */
export interface MissingVowelsItem {
  /** Uppercase, single-spaced, letters only. */
  answer: string
  clue: string
}
