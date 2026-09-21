import type { CryptogramPuzzle } from './draw'
import { ALPHABET } from './cipher'
import { isValidSaying, letterCount, type CryptogramLength } from './content'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

function cipherIsValid(cipher: ReadonlyMap<string, string>): boolean {
  if (cipher.size !== 26) return false
  if (new Set(cipher.values()).size !== 26) return false
  for (const letter of ALPHABET) {
    const mapped = cipher.get(letter)
    if (!mapped || mapped === letter) return false
  }
  return true
}

/**
 * Hard checks before a cryptogram sheet is considered export-ready.
 * Font / safe-area / wrap are enforced by layout (null = does not print).
 */
export function runCryptogramKdpPreflight(options: {
  puzzles: readonly CryptogramPuzzle[]
  length: CryptogramLength
  minFont: number
  fontSizes: readonly number[]
}): KdpPreflightResult {
  const { puzzles, length, minFont, fontSizes } = options
  const errors: string[] = []
  const warnings: string[] = []

  if (puzzles.length === 0) {
    errors.push('No cryptogram sayings were laid out.')
    return { ok: false, warnings, errors }
  }

  const plains = puzzles.map((p) => p.plain)
  if (new Set(plains).size !== plains.length) {
    errors.push('Duplicate sayings on one page.')
  }

  for (const puzzle of puzzles) {
    if (!isValidSaying(puzzle.plain, length)) {
      errors.push('A saying is not valid for this length.')
    }
    if (!cipherIsValid(puzzle.cipher)) {
      errors.push('Cipher must be a 26-letter bijection with no self-mapping.')
    }
    if (letterCount(puzzle.plain) < 1) {
      errors.push('A saying has no letters to encipher.')
    }
  }

  if (fontSizes.some((size) => size < minFont)) {
    errors.push(`Letter slots must stay at least ${minFont} pt.`)
  }

  return { ok: errors.length === 0, warnings, errors }
}
