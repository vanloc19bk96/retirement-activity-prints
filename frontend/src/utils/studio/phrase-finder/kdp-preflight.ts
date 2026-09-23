import { isNearDuplicateSaying } from '../cryptogram/content-quality'
import {
  MAX_CLUE_CHARS,
  MIN_CLUE_CHARS,
  clueGivesAnswerAway,
  isValidPhrase,
  strippedWords,
} from './content'
import type { PhraseFinderPuzzle } from './draw'
import { SLOT_MIN_W, type PhraseFinderMetrics } from './layout'
import type { PhraseFinderLength } from './levels'
import { letterAt, phraseFromModel } from './phrase'
import {
  LONG_WORD_LETTERS,
  MAX_REVEALED_SHARE,
  MIN_HIDDEN_LETTERS,
  MIN_REVEALED_SHARE,
  revealedInWord,
  wordRevealCap,
} from './reveal'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

/**
 * The last gate before a sheet is considered export-ready.
 *
 * Wrap, safe area and type size are already structural — a phrase that will not
 * fit is never laid out, and the slot pitch is chosen from a floor. What is
 * left is the part a reader only discovers after spending an evening on the
 * puzzle: a solution that does not match the page it belongs to, a given letter
 * printed in the wrong slot, a page that gave away so much there was nothing to
 * do, or one that gave away so little there was no way in.
 *
 * Every check here is a *second* opinion on work `reveal.ts`, `phrase.ts` and
 * the content gate already did. That is deliberate. The cost of a redundant
 * check is a few microseconds; the cost of a missing one is a printed book with
 * an unsolvable page in it, and a seller who finds out from a review.
 *
 * The clue checks are the newest and the least forgiving, because a page that
 * lost its clues fails in the way a reader cannot work around: these sayings
 * are written rather than quoted, so blanks and a third of their letters do not
 * name one wording, and a puzzle whose clue went missing on the way to the page
 * has no answer a solver could reach — only the one the key happens to print.
 */
export function runPhraseFinderKdpPreflight(options: {
  puzzles: readonly PhraseFinderPuzzle[]
  length: PhraseFinderLength
  metrics: PhraseFinderMetrics
}): KdpPreflightResult {
  const { puzzles, length, metrics } = options
  const errors: string[] = []
  const warnings: string[] = []

  if (puzzles.length === 0) {
    errors.push('No phrases were laid out.')
    return { ok: false, warnings, errors }
  }

  const texts = puzzles.map((puzzle) => strippedWords(puzzle.model.text))
  if (new Set(texts).size !== texts.length) {
    errors.push('The same phrase appears twice on one page.')
  }
  // One clue over two puzzles reads as the book asking the same question twice,
  // and on a page of invented sayings it is worse than that: two rows a solver
  // has no way of telling apart.
  const clueKeys = puzzles.map((puzzle) =>
    puzzle.clue.toUpperCase().replace(/[^A-Z]/g, ''),
  )
  if (new Set(clueKeys).size !== clueKeys.length) {
    errors.push('The same clue is printed over two puzzles on one page.')
  }
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      if (isNearDuplicateSaying(texts[i]!, texts[j]!)) {
        errors.push('Two phrases on this page are near-duplicates.')
      }
    }
  }

  for (const puzzle of puzzles) {
    const { model, revealed } = puzzle

    // The round trip is the check that keeps the key honest: the puzzle and the
    // solution are both drawn from this model, so a model that reads back as
    // its own phrase cannot print an answer the page does not ask for.
    if (phraseFromModel(model) !== model.text) {
      errors.push('A phrase does not read back as the answer it was built from.')
      continue
    }
    if (!isValidPhrase(model.text, length)) {
      errors.push('A phrase is not valid for this level.')
      continue
    }

    const clue = puzzle.clue.trim()
    if (clue.length < MIN_CLUE_CHARS) {
      errors.push('A phrase reached the page without a clue to solve it from.')
      continue
    }
    if (clue.length > MAX_CLUE_CHARS) {
      errors.push('A clue is longer than the column it prints in.')
    }
    if (clueGivesAnswerAway(clue, model.text)) {
      errors.push('A clue prints a word of the phrase it is meant to hide.')
    }

    const letters = model.letterCount
    if (letters < 1) {
      errors.push('A phrase has no letters to hide.')
      continue
    }

    for (const index of revealed) {
      if (!letterAt(model, index)) {
        errors.push('A given letter does not sit on a letter of its phrase.')
        break
      }
    }

    const given = revealed.size
    if (given > Math.floor(letters * MAX_REVEALED_SHARE)) {
      errors.push('Too much of a phrase is filled in to leave a puzzle.')
    }
    if (given < Math.ceil(letters * MIN_REVEALED_SHARE)) {
      errors.push('Too little of a phrase is filled in to give a way in.')
    }
    if (letters - given < MIN_HIDDEN_LETTERS) {
      errors.push('A phrase has too few blanks left to solve.')
    }

    for (const word of model.words) {
      const inWord = revealedInWord(word, revealed)
      if (inWord > wordRevealCap(word.letters.length)) {
        errors.push('One word of a phrase has been given away.')
        break
      }
      // A long word with nothing in it is the failure mode this game is most
      // likely to print: the budget clumps into the short words a solver would
      // have filled from grammar anyway, and the word carrying the sense of the
      // phrase is left as an unbroken run of blanks.
      if (word.letters.length >= LONG_WORD_LETTERS && inWord === 0 && given > 0) {
        errors.push('A long word in a phrase was left without a single letter.')
        break
      }
    }
  }

  if (metrics.slotW < SLOT_MIN_W) {
    errors.push('Letter blanks must stay wide enough to write in.')
  }

  return { ok: errors.length === 0, warnings, errors }
}
