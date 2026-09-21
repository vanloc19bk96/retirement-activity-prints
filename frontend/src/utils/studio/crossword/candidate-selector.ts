import type { CrosswordPair } from './types'
import { isNearDuplicateToken } from './content-quality'

/**
 * Prefer candidates that share letters with many peers so interlocking
 * succeeds more often before backtracking (spec §35–§37).
 */
export function sharedLetterCount(a: string, b: string): number {
  const setB = new Set(b)
  let count = 0
  const seen = new Set<string>()
  for (const ch of a) {
    if (seen.has(ch)) continue
    seen.add(ch)
    if (setB.has(ch)) count += 1
  }
  return count
}

export function crossabilityScore(word: string, pool: readonly string[]): number {
  let score = 0
  for (const other of pool) {
    if (other === word) continue
    const shared = sharedLetterCount(word, other)
    if (shared > 0) score += 1 + shared * 0.25
  }
  return score
}

function dedupeNearDuplicates(pairs: CrosswordPair[]): CrosswordPair[] {
  const kept: CrosswordPair[] = []
  for (const pair of pairs) {
    if (kept.some((k) => isNearDuplicateToken(k.word, pair.word))) continue
    kept.push(pair)
  }
  return kept
}

/**
 * Rank by crossability, drop isolates, return a packer-ready candidate list.
 */
export function selectCrosswordCandidates(
  pairs: CrosswordPair[],
  targetCount: number,
): CrosswordPair[] {
  const deduped = dedupeNearDuplicates(pairs)
  if (deduped.length === 0) return []

  const tokens = deduped.map((p) => p.word)
  const scored = deduped.map((pair) => ({
    pair,
    score: crossabilityScore(pair.word, tokens),
  }))
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.pair.word.length - a.pair.word.length ||
      a.pair.word.localeCompare(b.pair.word),
  )

  const connected = scored.filter((s) => s.score > 0 || scored.length < 6)
  const pool = (connected.length >= Math.min(4, targetCount) ? connected : scored).map(
    (s) => s.pair,
  )

  // Keep extras for substitute packing; generate slices to placeCount later.
  return pool
}
