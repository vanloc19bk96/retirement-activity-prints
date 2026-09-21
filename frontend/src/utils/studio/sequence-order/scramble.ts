import type { StudioRng } from '../studio-rng'
import type { SequenceItem } from '@/types/studio-sequence.types'

/** Rotate so every index moves — guaranteed derangement. */
function rotate(perm: number[]): number[] {
  if (perm.length <= 1) return [...perm]
  return [...perm.slice(1), perm[0]]
}

/**
 * Returns a permutation: scrambledIndex → originalIndex.
 * Constraint: a derangement — perm[i] !== i for every i (§6).
 */
export function scrambleSequence(items: SequenceItem[], rng: StudioRng): number[] {
  const n = items.length
  if (n === 0) return []
  if (n === 1) return [0]

  let perm: number[]
  let guard = 0
  do {
    perm = rng.shuffle(items.map((_, i) => i))
    guard++
  } while (perm.some((orig, i) => orig === i) && guard < 50)

  if (perm.some((orig, i) => orig === i)) {
    perm = rotate(perm)
  }
  return perm
}
