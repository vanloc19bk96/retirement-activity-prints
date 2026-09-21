import type { StudioRng } from '../studio-rng'
import type { BlankPosition } from './types'

/**
 * Resolve where the blank sits.
 * - end: always last term
 * - random: any interior index ( ≥1 known term on each side )
 * - mixed: 50/50 end vs random
 * - middle: legacy alias for random
 */
export function resolveBlankIndex(
  blankPosition: BlankPosition,
  length: number,
  rng: StudioRng,
): number {
  if (length <= 2) return length - 1

  const wantsRandom =
    blankPosition === 'random' ||
    blankPosition === 'middle' ||
    (blankPosition === 'mixed' && rng.chance(0.5))

  if (!wantsRandom) return length - 1

  const minIndex = 1
  const maxIndex = length - 2
  return rng.int(minIndex, Math.max(minIndex, maxIndex))
}
