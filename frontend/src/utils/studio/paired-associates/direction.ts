import type { StudioRng } from '../studio-rng'
import type {
  PairTestDirection,
  WordPair,
} from '@/types/studio-pairs.types'

export type ResolvedDirection = 'forward' | 'backward'

export function resolveDirections(
  count: number,
  mode: PairTestDirection,
  rng: StudioRng,
): ResolvedDirection[] {
  if (mode === 'forward') return Array.from({ length: count }, () => 'forward')
  if (mode === 'backward') return Array.from({ length: count }, () => 'backward')
  return Array.from({ length: count }, () =>
    rng.chance(0.5) ? 'forward' : 'backward',
  )
}

export function cueOf(pair: WordPair, direction: ResolvedDirection): string {
  return direction === 'forward' ? pair.left : pair.right
}

export function partnerOf(pair: WordPair, direction: ResolvedDirection): string {
  return direction === 'forward' ? pair.right : pair.left
}
