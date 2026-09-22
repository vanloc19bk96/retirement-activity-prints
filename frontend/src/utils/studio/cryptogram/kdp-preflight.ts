import type { CryptogramPuzzle } from './draw'
import { cipherIsValid, decodeSaying, encodeLetter } from './cipher'
import { isValidSaying, letterCount } from './content'
import { isNearDuplicateSaying } from './content-quality'
import { revealedSlotCount } from './hints'
import { SLOT_MIN_W, type CryptogramSlotMetrics } from './layout'
import type { CryptogramSayingLength } from './levels'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

/** Matches the cap in `hints.ts` — a starter set past this gives the page away. */
const MAX_REVEALED_SHARE = 0.4

/**
 * The last gate before a sheet is considered export-ready.
 *
 * Wrap, safe area and type size are already structural — a saying that will
 * not fit is never laid out, and the slot pitch is chosen from a floor. What
 * is left is the part a reader only discovers after spending an evening on the
 * puzzle: a code that does not read back, a solution that does not match the
 * page, or a page printing the same saying twice.
 */
export function runCryptogramKdpPreflight(options: {
  puzzles: readonly CryptogramPuzzle[]
  length: CryptogramSayingLength
  metrics: CryptogramSlotMetrics
}): KdpPreflightResult {
  const { puzzles, length, metrics } = options
  const errors: string[] = []
  const warnings: string[] = []

  if (puzzles.length === 0) {
    errors.push('No cryptogram sayings were laid out.')
    return { ok: false, warnings, errors }
  }

  const plains = puzzles.map((puzzle) => puzzle.plain)
  if (new Set(plains).size !== plains.length) {
    errors.push('The same saying appears twice on one page.')
  }
  for (let i = 0; i < plains.length; i++) {
    for (let j = i + 1; j < plains.length; j++) {
      if (isNearDuplicateSaying(plains[i]!, plains[j]!)) {
        errors.push('Two sayings on this page are near-duplicates.')
      }
    }
  }

  for (const puzzle of puzzles) {
    if (!isValidSaying(puzzle.plain, length)) {
      errors.push('A saying is not valid for this level.')
      continue
    }
    if (!cipherIsValid(puzzle.cipher)) {
      errors.push('Cipher must be a 26-letter bijection with no self-mapping.')
      continue
    }

    // The round trip is what the solver actually does. Checking it here means a
    // sheet can only print if its own code reads back to its own solution.
    const coded = [...puzzle.plain]
      .map((ch) => (ch === ' ' ? ' ' : encodeLetter(ch, puzzle.cipher)))
      .join('')
    if (decodeSaying(coded, puzzle.cipher) !== puzzle.plain) {
      errors.push('A coded saying does not decode back to its solution.')
    }

    const letters = letterCount(puzzle.plain)
    if (letters < 1) {
      errors.push('A saying has no letters to encipher.')
      continue
    }
    const revealed = revealedSlotCount(puzzle.plain, puzzle.starters)
    if (revealed > Math.floor(letters * MAX_REVEALED_SHARE)) {
      errors.push('Too much of a saying is filled in to leave a puzzle.')
    }
    for (const starter of puzzle.starters) {
      if (!puzzle.plain.includes(starter)) {
        errors.push('A starter letter does not appear in its saying.')
      }
    }
  }

  if (metrics.slotW < SLOT_MIN_W) {
    errors.push('Letter slots must stay wide enough to write in.')
  }

  return { ok: errors.length === 0, warnings, errors }
}
