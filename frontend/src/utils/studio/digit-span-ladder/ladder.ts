import type { StudioRng } from '../studio-rng'

export interface Rung {
  length: number
  digits: number[]
  answer: number[]
}

export type DigitSpanDirection = 'forward' | 'backward'
export type DigitSpanMode = 'cover' | 'spread'

export const DIRECTION_PRESETS = {
  forward: { start: 3, end: 9 },
  backward: { start: 2, end: 8 },
} as const

export const FORWARD_INSTRUCTION =
  'Cover the numbers with a card. Reveal one row, read it once, cover it, then ' +
  'write the same numbers in order from memory'

export const BACKWARD_INSTRUCTION =
  'Cover the numbers with a card. Reveal one row, read it once, cover it, then ' +
  'write the numbers in REVERSE order from memory'

export const STUDY_INSTRUCTION =
  'Read and memorize each row. You will write them on the next page'

function isMonotonic(seq: number[]): boolean {
  if (seq.length < 2) return false
  let ascending = true
  let descending = true
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] <= seq[i - 1]) ascending = false
    if (seq[i] >= seq[i - 1]) descending = false
  }
  return ascending || descending
}

/** Random digits: no adjacent repeats, reject fully monotonic runs. */
export function randomDigits(len: number, rng: StudioRng): number[] {
  for (let attempt = 0; attempt < 20; attempt++) {
    const seq: number[] = []
    for (let i = 0; i < len; i++) {
      let d = rng.int(0, 9)
      let guard = 0
      while (i > 0 && d === seq[i - 1] && guard++ < 10) d = rng.int(0, 9)
      seq.push(d)
    }
    if (!isMonotonic(seq)) return seq
  }
  return Array.from({ length: len }, () => rng.int(0, 9))
}

export function buildLadder(
  startLength: number,
  endLength: number,
  trialsPerLength: number,
  direction: DigitSpanDirection,
  rng: StudioRng,
): Rung[] {
  const rungs: Rung[] = []
  for (let len = startLength; len <= endLength; len++) {
    for (let t = 0; t < trialsPerLength; t++) {
      const digits = randomDigits(len, rng)
      const answer = direction === 'backward' ? [...digits].reverse() : [...digits]
      rungs.push({ length: len, digits, answer })
    }
  }
  return rungs
}

/**
 * Thin the ladder so every row keeps a legible height on one page.
 * Drops extra tries per length first, then whole lengths spread evenly —
 * the climb (short → long) is preserved either way.
 */
export function limitRungsToRows(rungs: Rung[], maxRows: number): Rung[] {
  if (maxRows >= rungs.length) return rungs
  if (maxRows <= 0) return rungs.slice(0, 1)

  const byLength = new Map<number, Rung[]>()
  for (const rung of rungs) {
    const group = byLength.get(rung.length)
    if (group) group.push(rung)
    else byLength.set(rung.length, [rung])
  }
  const groups = [...byLength.values()]

  const triesPerLength = Math.floor(maxRows / groups.length)
  if (triesPerLength >= 1) {
    return groups.flatMap((group) => group.slice(0, triesPerLength))
  }

  // One try per length, keeping an even spread across the difficulty range.
  const step = groups.length / maxRows
  return Array.from({ length: maxRows }, (_, i) => groups[Math.floor(i * step)]![0]!)
}

export function clampStart(n: number): number {
  return Math.min(6, Math.max(2, Math.floor(n) || 3))
}

export function clampEnd(n: number, start: number): number {
  return Math.max(start, Math.min(12, Math.floor(n) || start))
}

/** Single spaces — triple gaps made length-8+ strings wrap out of the safe area. */
export function formatDigits(digits: number[]): string {
  return digits.join(' ')
}

export function directionBanner(direction: DigitSpanDirection): string {
  return direction === 'backward'
    ? 'BACKWARD: write in reverse order'
    : 'FORWARD: write in the same order'
}

export function instructionFor(direction: DigitSpanDirection): string {
  return direction === 'backward' ? BACKWARD_INSTRUCTION : FORWARD_INSTRUCTION
}
