import type { StudioRng } from '../studio-rng'
import { N_BACK_SHAPES } from './shapes'

export const ALPHABETS: Record<string, readonly string[]> = {
  letters: [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  ],
  digits: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
  shapes: N_BACK_SHAPES,
}

/** Fraction of answerable rows that should be N-back matches. */
export const TARGET_RATE = 0.3

/**
 * Build a sequence with a target fraction of N-back matches.
 * Position i (i >= n) is a match iff seq[i] === seq[i - n].
 */
export function buildNBackSequence(
  symbols: readonly string[],
  rowCount: number,
  n: number,
  targetRate: number,
  rng: StudioRng,
): { seq: string[]; isMatch: boolean[] } {
  if (symbols.length === 0) throw new Error('N-back alphabet must not be empty')
  if (rowCount < 1) throw new Error('N-back rowCount must be >= 1')
  if (n < 1) throw new Error('N-back n must be >= 1')

  const seq: string[] = []
  const isMatch: boolean[] = []

  for (let i = 0; i < rowCount; i++) {
    if (i < n) {
      seq.push(rng.pick(symbols))
      isMatch.push(false)
      continue
    }

    const wantMatch = rng.chance(targetRate)
    if (wantMatch) {
      seq.push(seq[i - n])
      isMatch.push(true)
      continue
    }

    let candidate = rng.pick(symbols)
    let guard = 0
    while (candidate === seq[i - n] && guard++ < 20) {
      candidate = rng.pick(symbols)
    }
    seq.push(candidate)
    isMatch.push(false)
  }

  return { seq, isMatch }
}
