/**
 * Word Fit-In — the puzzle model.
 *
 * A fill-in is a crossword with the clues taken away and the answers handed
 * over instead: the reader works out where each word goes from its length and
 * from the letters where slots cross. That makes it a visual-matching and
 * working-memory task rather than a vocabulary one, which is why it stays
 * solvable for a reader whose word-finding has declined — and why it outsells
 * clued crosswords in the large-print senior segment.
 */

export type WordFitMode = 'themed' | 'numbers'

export const WORD_FIT_MODES: readonly WordFitMode[] = ['themed', 'numbers']

export function parseWordFitMode(raw: unknown): WordFitMode {
  const value = String(raw ?? '')
  return (WORD_FIT_MODES as readonly string[]).includes(value)
    ? (value as WordFitMode)
    : 'themed'
}

export type WordFitDir = 'across' | 'down'

export interface WordFitSlot {
  /** Index into `WordFitPuzzle.slots`. */
  id: number
  row: number
  col: number
  dir: WordFitDir
  length: number
}

/** One shared cell: `slots[a]` position `ai` is the same square as `slots[b]` position `bi`. */
export interface WordFitCrossing {
  a: number
  ai: number
  b: number
  bi: number
}

export interface WordFitPuzzle {
  /** Square lattice the slots are cut from; `null` is a gap. */
  grid: (string | null)[][]
  size: number
  slots: WordFitSlot[]
  crossings: WordFitCrossing[]
  /** The bank, as printed (sorted by length then alphabetically). */
  words: string[]
  /** `assignment[slotId]` is an index into `words`. */
  assignment: number[]
  /** Slot ids printed already filled in, so the puzzle has one solution. */
  starters: number[]
  mode: WordFitMode
}

/**
 * Entries a fill-in page can hold.
 *
 * The default is twelve rather than a word search's fourteen or more, and the
 * reason is geometry, not taste: the bank is printed in full beside the grid,
 * so every extra entry both lengthens the bank *and* widens the lattice it has
 * to leave room for. On a 6x9 trim, fourteen entries push the cells below the
 * size a reader can write a letter into — see `MIN_WORD_FIT_CELL`.
 */
export const WORD_FIT_COUNT_MIN = 8
export const WORD_FIT_COUNT_MAX = 16
export const WORD_FIT_COUNT_DEFAULT = 12

export function parseWordFitCount(raw: unknown): number {
  const n = Number(raw ?? WORD_FIT_COUNT_DEFAULT)
  if (!Number.isFinite(n)) return WORD_FIT_COUNT_DEFAULT
  return Math.min(WORD_FIT_COUNT_MAX, Math.max(WORD_FIT_COUNT_MIN, Math.round(n)))
}

/**
 * Starter words the generator may print to force a single solution.
 *
 * Zero is offered, and honoured whenever the draw happens to be unambiguous on
 * its own — but it is a preference, not a promise: a fill-in with two valid
 * fillings has an answer key that is simply wrong for half its readers, and no
 * seller preference outranks that.
 */
export const WORD_FIT_STARTERS_MAX = 3

export function parseWordFitStarters(raw: unknown): number {
  const n = Number(raw ?? 1)
  if (!Number.isFinite(n)) return 1
  return Math.min(WORD_FIT_STARTERS_MAX, Math.max(0, Math.round(n)))
}

/**
 * Digits are laid out as letters so one interlocking builder and one solver
 * serve both modes: a crossing is a symbol match either way, and the renderer
 * maps back at the last moment.
 */
export const DIGIT_PROXY_BASE = 'A'.charCodeAt(0)

export function digitToProxy(digit: number): string {
  return String.fromCharCode(DIGIT_PROXY_BASE + digit)
}

export function proxyToDigit(proxy: string): string {
  return String(proxy.charCodeAt(0) - DIGIT_PROXY_BASE)
}

/** What a cell prints: digits come back out of their letter proxy. */
export function glyphFor(mode: WordFitMode, cell: string): string {
  return mode === 'numbers' ? proxyToDigit(cell) : cell
}

/** What a bank entry prints. */
export function bankGlyphs(mode: WordFitMode, word: string): string {
  return mode === 'numbers'
    ? [...word].map(proxyToDigit).join('')
    : word
}
