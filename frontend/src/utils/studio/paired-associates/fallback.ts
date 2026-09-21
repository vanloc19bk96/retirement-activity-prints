import type {
  PairResponse,
  PairSet,
  PairType,
  WordPair,
} from '@/types/studio-pairs.types'
import fallbackBank from '@/data/studio/pairs/fallback.json'
import { createRng } from '../studio-rng'

interface FallbackEntry {
  pairType: PairType
  pairs: Array<{ left: string; right: string }>
}

const BANK = fallbackBank as FallbackEntry[]

function asType(value: unknown): PairType {
  if (value === 'related' || value === 'word-picture' || value === 'arbitrary') {
    return value
  }
  return 'arbitrary'
}

function toSet(entry: FallbackEntry, pairCount: number): PairSet {
  const pairs: WordPair[] = entry.pairs
    .slice(0, pairCount)
    .map((p) => ({ left: p.left, right: p.right }))
  return { pairs }
}

/** Hand-checked bank for curated mode and API outage fallback. */
export function resolvePairsFallback(
  pairType: unknown,
  pairCount: number,
  exerciseCount: number,
  seed: number,
): PairResponse {
  const type = asType(pairType)
  const count = Math.min(40, Math.max(1, Math.floor(exerciseCount)))
  const pairsWanted = Math.min(10, Math.max(4, Math.floor(pairCount)))

  // word-picture falls back to arbitrary word pairs (images attached in prefetch when available)
  const bankType = type === 'word-picture' ? 'arbitrary' : type
  const matches = BANK.filter(
    (e) => e.pairType === bankType && e.pairs.length >= pairsWanted,
  )
  const pool =
    matches.length > 0
      ? matches
      : BANK.filter((e) => e.pairs.length >= pairsWanted)
  const source = pool.length > 0 ? pool : BANK

  const rng = createRng(seed)
  const shuffled = rng.shuffle(source)
  const sets: PairSet[] = []
  for (let i = 0; i < count; i++) {
    const entry = shuffled[i % shuffled.length]
    sets.push(toSet(entry, Math.min(pairsWanted, entry.pairs.length)))
  }
  return { sets }
}
