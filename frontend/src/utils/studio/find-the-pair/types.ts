/**
 * Find the Pair — the tier table and fixed figure-variation axes.
 *
 * The puzzle is a field of figures in which exactly `pairCount` figures appear
 * twice and every other figure appears once. Difficulty is not the size of the
 * field: it is how close the *distractors* sit to the twins, measured in
 * changed attributes. A field of wildly different figures is solved at a
 * glance however many cells it has.
 */

import type { AttributeKey } from '../matrix-reasoning/types'

/**
 * Attributes every field varies. Shape, paint and inner mark all survive print
 * at scanning size, and together they span 51 printable figures — enough to
 * fill the largest field with distinct figures, which is the one hard
 * requirement the builder cannot negotiate.
 */
export const PAIR_BASE_ATTRIBUTES: readonly AttributeKey[] = ['shape', 'fill', 'mark']

/** Optional axes the builder can open on top of the base attributes. */
export const PAIR_EXTRA_ATTRIBUTES = ['count', 'size'] as const
export type PairExtraAttribute = (typeof PAIR_EXTRA_ATTRIBUTES)[number]

export type FindThePairTierKey = 'warmup' | 'easy' | 'medium' | 'hard'

export interface FindThePairTier {
  /** Figures the tier asks for. A tight trim may print fewer (see `fitPairField`). */
  cells: number
  /**
   * Closest and furthest a distractor may sit from the twin it was drawn
   * against, counted in attributes that differ. `1` is a near miss — the same
   * figure with one thing altered — and is what makes a field genuinely hard.
   */
  minDistance: number
  maxDistance: number
  /** Distractors that must be near misses, so a tier cannot drift easy by luck. */
  closeQuota: number
}

/**
 * The four tiers, and why the numbers are what they are.
 *
 * Warm-up keeps every distractor three or more attributes away, so the repeat
 * is found by looking rather than by comparing. Medium and Hard invert that:
 * nothing on the page is more than two attributes from a twin, so the reader
 * has to hold a full description in mind while scanning — which is the working
 * memory load this template exists to create.
 */
export const FIND_THE_PAIR_TIERS: Record<FindThePairTierKey, FindThePairTier> = {
  warmup: { cells: 16, minDistance: 3, maxDistance: 5, closeQuota: 0 },
  easy: { cells: 24, minDistance: 2, maxDistance: 5, closeQuota: 0 },
  medium: { cells: 30, minDistance: 1, maxDistance: 2, closeQuota: 4 },
  hard: { cells: 36, minDistance: 1, maxDistance: 2, closeQuota: 10 },
}

export const FIND_THE_PAIR_TIER_KEYS = Object.keys(
  FIND_THE_PAIR_TIERS,
) as FindThePairTierKey[]

export function parsePairTier(raw: unknown): FindThePairTierKey {
  const key = String(raw ?? '')
  return (FIND_THE_PAIR_TIER_KEYS as string[]).includes(key)
    ? (key as FindThePairTierKey)
    : 'easy'
}

export const PAIR_COUNT_MIN = 1
export const PAIR_COUNT_MAX = 4

export function parsePairCount(raw: unknown): number {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n)) return PAIR_COUNT_MIN
  return Math.min(PAIR_COUNT_MAX, Math.max(PAIR_COUNT_MIN, n))
}
