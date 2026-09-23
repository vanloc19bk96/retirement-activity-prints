/**
 * The printed row, described one cell at a time.
 *
 * A Phrase Finder puzzle is a phrase shown as blanks, so everything the solver
 * works from is *shape*: how many letters each word holds, where the words
 * break, and where the punctuation sits. That makes a phrase a geometry problem
 * before it is a text one, and a plain string cannot answer it — "DON'T" is one
 * word of four letters with a mark between the third and the fourth, and any
 * model that counts the apostrophe as a letter prints a blank nobody can fill.
 *
 * So a phrase is taken apart into words, and a word into cells. A letter cell
 * prints a writing rule and holds one letter of the answer; a mark cell prints
 * its glyph and holds nothing. Words are the unit the wrap works in, because a
 * word broken across two rows cannot be read as a word at all.
 *
 * Every letter also carries its index in the phrase's letter sequence, which is
 * what the reveal logic addresses and what the preflight checks positions
 * against. The revealed letters are therefore never a second copy of the text
 * that could drift from it — they are indices into this one.
 */

/**
 * Marks that live *inside* a word and bind the letters either side of them.
 *
 * The distinction is not cosmetic. An inner mark keeps one word one word —
 * DON'T is four letters, not DON and T — while an end mark closes a word and is
 * followed by a full word gap. Getting it wrong changes the word count a solver
 * reads off the page, which is the most useful clue the puzzle gives them.
 */
const INNER_MARKS = new Set(["'", '-'])
const END_MARKS = new Set([',', '.', '?', '!'])

/**
 * Every mark a phrase may carry. Everything else is stripped on the way in.
 *
 * Deliberately short. Each mark is a glyph the page has to set at large print
 * between two writing rules, and each one is a character a solver has to decide
 * is *not* a blank — so the set earns its way in one mark at a time.
 */
export const PHRASE_FINDER_MARKS = [...INNER_MARKS, ...END_MARKS].join('')

export interface PhraseCell {
  /** A letter prints a writing rule; a mark prints its own glyph. */
  kind: 'letter' | 'mark'
  /** Uppercase A–Z for a letter, the glyph itself for a mark. */
  char: string
  /** Index of this letter in the phrase's letter sequence; -1 for a mark. */
  letterIndex: number
}

export interface PhraseWord {
  cells: PhraseCell[]
  /** Letters only, in order: "DON'T" → "DONT". */
  letters: string
  /** Letter index of this word's first letter. */
  firstLetterIndex: number
}

export interface PhraseModel {
  /** Normalized phrase, exactly as the solution page must read. */
  text: string
  words: PhraseWord[]
  /** Letters across the whole phrase — the reveal budget is a share of this. */
  letterCount: number
}

/**
 * Fold the typography a writer reaches for into the marks the page can set.
 *
 * A model asked for plain text still returns curly quotes and en dashes, and to
 * a solver they are the same three marks. Folding them keeps one apostrophe
 * glyph on the page instead of two that look like a printing fault. Colons and
 * semicolons fold to a comma for the same reason in reverse: they are rare
 * enough in a one-line saying that carrying two more glyphs through the layout
 * buys nothing, and a comma reads as the same pause.
 */
const FOLD: Record<string, string> = {
  '‘': "'",
  '’': "'",
  'ʼ': "'",
  '´': "'",
  '`': "'",
  '–': '-',
  '—': '-',
  '−': '-',
  '…': '.',
  ';': ',',
  ':': ',',
}

const UNSUPPORTED_RE = /[^A-Z'\-,.?! ]+/g
const MARK_CLASS = "[',.?!-]"

/**
 * Uppercase, single-spaced, supported marks only.
 *
 * Anything outside the set becomes a space rather than vanishing, so a stray
 * character splits a word instead of silently welding two together — a phrase
 * that came back with a digit in it then fails the word-shape gate rather than
 * printing as one unreadable run.
 *
 * The tidying afterwards is what stops a mark being drawn where a solver cannot
 * use it: no mark opens the phrase, no mark sits with a space on its left, two
 * marks never stack, and an inner mark with no letter after it is dropped —
 * "WELL-" reads as a word the page cut in half.
 */
export function normalizePhrase(raw: unknown): string {
  let folded = ''
  for (const ch of String(raw ?? '').toUpperCase()) folded += FOLD[ch] ?? ch

  const text = folded
    .replace(UNSUPPORTED_RE, ' ')
    .replace(new RegExp(`\\s+(${MARK_CLASS})`, 'g'), '$1')
    .replace(new RegExp(`(${MARK_CLASS})(?:${MARK_CLASS})+`, 'g'), '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(new RegExp(`^${MARK_CLASS}+`), '')
    .replace(/([A-Z])['-](?![A-Z])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

  return text
}

/** Letters only, marks and spaces dropped: "DON'T GO." → "DONTGO". */
export function letterToken(text: string): string {
  return text.replace(/[^A-Z]/g, '')
}

export function letterCount(text: string): number {
  return letterToken(text).length
}

/** Words as printed, marks kept: "DON'T GO." → ["DON'T", "GO."]. */
export function phraseWords(text: string): string[] {
  return text.split(' ').filter(Boolean)
}

export function isInnerMark(ch: string): boolean {
  return INNER_MARKS.has(ch)
}

export function isEndMark(ch: string): boolean {
  return END_MARKS.has(ch)
}

function isLetter(ch: string | undefined): boolean {
  return ch !== undefined && ch >= 'A' && ch <= 'Z'
}

/**
 * True when every character is one the page knows how to set, *where* it sits.
 *
 * Structural rather than a character whitelist, because a mark in the wrong
 * place is not a typo the page can absorb — it is a cell drawn where a solver
 * expects a blank. A mark with no letter to its left opens a word with
 * punctuation; an inner mark with no letter to its right is a word the page cut
 * in half; an end mark mid-word splits a word count a solver is reading off the
 * row. `normalizePhrase` fixes all of them on the way in, and this is the gate
 * that refuses anything that reached the page some other way.
 */
export function hasOnlySupportedCharacters(text: string): boolean {
  if (!/^[A-Z][A-Z'\-,.?! ]*$/.test(text)) return false
  if (/ {2,}/.test(text)) return false

  for (const word of phraseWords(text)) {
    // A word with no letters is a mark the page would draw on its own rule.
    if (!/[A-Z]/.test(word)) return false
    for (let i = 0; i < word.length; i++) {
      const ch = word[i]!
      if (isLetter(ch)) continue
      if (!isLetter(word[i - 1])) return false
      if (isInnerMark(ch)) {
        if (!isLetter(word[i + 1])) return false
      } else if (isEndMark(ch)) {
        if (i !== word.length - 1) return false
      } else {
        return false
      }
    }
  }
  return true
}

/** The phrase taken apart into the cells the page draws. */
export function toPhraseModel(text: string): PhraseModel {
  const words: PhraseWord[] = []
  let letterIndex = 0

  for (const raw of phraseWords(text)) {
    const cells: PhraseCell[] = []
    let letters = ''
    const firstLetterIndex = letterIndex
    for (const ch of raw) {
      if (ch >= 'A' && ch <= 'Z') {
        cells.push({ kind: 'letter', char: ch, letterIndex })
        letters += ch
        letterIndex += 1
      } else {
        cells.push({ kind: 'mark', char: ch, letterIndex: -1 })
      }
    }
    words.push({ cells, letters, firstLetterIndex })
  }

  return { text, words, letterCount: letterIndex }
}

/**
 * Read the model back as text.
 *
 * This is the round trip the preflight runs before a puzzle reaches a page.
 * Both the puzzle and its solution are drawn from the model, so a model that
 * reads back as the phrase it was built from cannot let the page and the key
 * disagree about the answer — which is the one mistake in this game a reader
 * only discovers after spending an evening on it.
 */
export function phraseFromModel(model: PhraseModel): string {
  return model.words
    .map((word) => word.cells.map((cell) => cell.char).join(''))
    .join(' ')
}

/** The letter at a phrase-letter index, or '' when the index is not one. */
export function letterAt(model: PhraseModel, index: number): string {
  for (const word of model.words) {
    const offset = index - word.firstLetterIndex
    if (offset >= 0 && offset < word.letters.length) return word.letters[offset]!
  }
  return ''
}

/**
 * The puzzle as flat text — "T_E G_RD_N _S _P_N".
 *
 * Not what the page draws; the page draws cells. This is how a test, a
 * duplicate filter or a fingerprint talks about one puzzle in a single string.
 */
export function maskedText(model: PhraseModel, revealed: ReadonlySet<number>): string {
  return model.words
    .map((word) =>
      word.cells
        .map((cell) =>
          cell.kind === 'mark' || revealed.has(cell.letterIndex) ? cell.char : '_',
        )
        .join(''),
    )
    .join(' ')
}
