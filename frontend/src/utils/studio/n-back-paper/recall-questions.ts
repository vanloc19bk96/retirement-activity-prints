import type { StudioRng } from '../studio-rng'
import { createRng } from '../studio-rng'
import { TARGET_RATE, buildNBackSequence } from './sequence'

/** Max random draws when filling one bucket / pass. */
export const RECALL_PICK_ATTEMPTS = 50

/** Sequence regenerations before accepting a relaxed fallback. */
export const RECALL_SEQUENCE_ATTEMPTS = 8

export interface RecallQuestion {
  /** 0-based anchor index K (prompt names position K + 1). */
  anchorIndex: number
  /** 0-based target index (= anchorIndex - n). */
  targetIndex: number
}

export interface RecallQuestionConstraints {
  /** (c) answer symbol differs from anchor symbol. Default true. */
  requireSymbolDiff?: boolean
  /** (d) answer symbol differs from immediate neighbors. Default true. */
  requireAdjacentDiff?: boolean
}

/**
 * Validate a recall question. Indices are 0-based; constraint (a) uses
 * 1-based positions (target position >= 3 ⇒ targetIndex >= 2).
 */
export function isValidRecallQuestion(
  seq: readonly string[],
  anchorIndex: number,
  n: number,
  constraints: RecallQuestionConstraints = {},
): boolean {
  const requireSymbolDiff = constraints.requireSymbolDiff !== false
  const requireAdjacentDiff = constraints.requireAdjacentDiff !== false

  if (n < 1 || seq.length === 0) return false
  if (anchorIndex < 0 || anchorIndex >= seq.length) return false

  const targetIndex = anchorIndex - n
  // (a) never answer with one of the first two items (1-based target >= 3)
  if (targetIndex < 2) return false

  const answer = seq[targetIndex]
  const anchor = seq[anchorIndex]
  if (answer === undefined || anchor === undefined) return false

  // (c)
  if (requireSymbolDiff && answer === anchor) return false

  // (d)
  if (requireAdjacentDiff) {
    const left = seq[targetIndex - 1]
    const right = seq[targetIndex + 1]
    if (left !== undefined && answer === left) return false
    if (right !== undefined && answer === right) return false
  }

  return true
}

/** Inclusive 0-based anchor range satisfying (a): targetIndex >= 2. */
export function recallAnchorRange(
  seqLength: number,
  n: number,
): { minAnchor: number; maxAnchor: number } | null {
  if (n < 1 || seqLength < 1) return null
  const minAnchor = n + 2
  const maxAnchor = seqLength - 1
  if (minAnchor > maxAnchor) return null
  return { minAnchor, maxAnchor }
}

/** Distinct recall prompts possible for this sequence length and N. */
export function maxRecallQuestionCount(seqLength: number, n: number): number {
  const range = recallAnchorRange(seqLength, n)
  if (!range) return 0
  return range.maxAnchor - range.minAnchor + 1
}

function partitionBuckets(
  minAnchor: number,
  maxAnchor: number,
  bucketCount: number,
): number[][] {
  const anchors: number[] = []
  for (let a = minAnchor; a <= maxAnchor; a++) anchors.push(a)
  if (anchors.length === 0 || bucketCount < 1) return []

  const count = Math.min(bucketCount, anchors.length)
  const buckets: number[][] = Array.from({ length: count }, () => [])
  const base = Math.floor(anchors.length / count)
  let remainder = anchors.length % count
  let offset = 0
  for (let i = 0; i < count; i++) {
    const size = base + (remainder > 0 ? 1 : 0)
    if (remainder > 0) remainder--
    buckets[i] = anchors.slice(offset, offset + size)
    offset += size
  }
  return buckets
}

function tryPickInPool(
  seq: readonly string[],
  n: number,
  pool: readonly number[],
  usedAnchors: Set<number>,
  usedTargets: Set<number>,
  rng: StudioRng,
  constraints: RecallQuestionConstraints,
): RecallQuestion | null {
  if (pool.length === 0) return null

  for (let attempt = 0; attempt < RECALL_PICK_ATTEMPTS; attempt++) {
    const anchorIndex = rng.pick(pool)
    if (usedAnchors.has(anchorIndex)) continue
    const targetIndex = anchorIndex - n
    if (usedTargets.has(targetIndex)) continue
    if (!isValidRecallQuestion(seq, anchorIndex, n, constraints)) continue
    return { anchorIndex, targetIndex }
  }
  return null
}

/**
 * Pick recall questions with bucketing + constraint relaxation.
 * Never relaxes (a) or (e). Relaxation order: (d) → (c) → (b).
 */
export function pickRecallQuestions(
  seq: readonly string[],
  n: number,
  count: number,
  rng: StudioRng,
): RecallQuestion[] {
  const range = recallAnchorRange(seq.length, n)
  if (!range || count < 1) return []

  const want = Math.min(count, range.maxAnchor - range.minAnchor + 1)
  const relaxationPasses: Array<{
    requireAdjacentDiff: boolean
    requireSymbolDiff: boolean
    useBuckets: boolean
  }> = [
    { requireAdjacentDiff: true, requireSymbolDiff: true, useBuckets: true },
    { requireAdjacentDiff: false, requireSymbolDiff: true, useBuckets: true },
    { requireAdjacentDiff: false, requireSymbolDiff: false, useBuckets: true },
    { requireAdjacentDiff: false, requireSymbolDiff: false, useBuckets: false },
  ]

  let last: RecallQuestion[] = []

  for (const pass of relaxationPasses) {
    const constraints: RecallQuestionConstraints = {
      requireAdjacentDiff: pass.requireAdjacentDiff,
      requireSymbolDiff: pass.requireSymbolDiff,
    }
    const usedAnchors = new Set<number>()
    const usedTargets = new Set<number>()
    const picked: RecallQuestion[] = []

    if (pass.useBuckets) {
      const buckets = partitionBuckets(range.minAnchor, range.maxAnchor, want)
      for (const bucket of buckets) {
        const q = tryPickInPool(
          seq,
          n,
          bucket,
          usedAnchors,
          usedTargets,
          rng,
          constraints,
        )
        if (!q) continue
        usedAnchors.add(q.anchorIndex)
        usedTargets.add(q.targetIndex)
        picked.push(q)
      }
    } else {
      const pool: number[] = []
      for (let a = range.minAnchor; a <= range.maxAnchor; a++) pool.push(a)
      while (picked.length < want) {
        const available = pool.filter((a) => !usedAnchors.has(a))
        const q = tryPickInPool(
          seq,
          n,
          available,
          usedAnchors,
          usedTargets,
          rng,
          constraints,
        )
        if (!q) break
        usedAnchors.add(q.anchorIndex)
        usedTargets.add(q.targetIndex)
        picked.push(q)
      }
    }

    const sorted = picked.toSorted((a, b) => a.anchorIndex - b.anchorIndex)
    if (sorted.length > last.length) last = sorted
    if (last.length >= want) return last
  }

  return last
}

export interface BuildRecallPuzzleResult {
  seq: string[]
  questions: RecallQuestion[]
}

/**
 * Build sequence + questions. Regenerates the sequence (seed + attempt) only
 * when even the fully relaxed pick cannot fill the set; then falls back to the
 * last partial result rather than throwing.
 */
export function buildRecallPuzzle(options: {
  symbols: readonly string[]
  seqLength: number
  n: number
  questionCount: number
  seed: number
  targetRate?: number
}): BuildRecallPuzzleResult {
  const {
    symbols,
    seqLength,
    n,
    questionCount,
    seed,
    targetRate = TARGET_RATE,
  } = options

  const range = recallAnchorRange(seqLength, n)
  const want = range
    ? Math.min(questionCount, range.maxAnchor - range.minAnchor + 1)
    : 0

  let fallback: BuildRecallPuzzleResult = { seq: [], questions: [] }

  for (let attempt = 0; attempt < RECALL_SEQUENCE_ATTEMPTS; attempt++) {
    const rng = createRng(seed + attempt)
    const { seq } = buildNBackSequence(symbols, seqLength, n, targetRate, rng)
    const questions = pickRecallQuestions(seq, n, questionCount, rng)
    const isComplete = want > 0 && questions.length >= want
    const isStrict =
      isComplete &&
      questions.every((q) => isValidRecallQuestion(seq, q.anchorIndex, n))

    if (isStrict) return { seq, questions }

    // Prefer the fullest set; among ties keep the later attempt (last relaxed pass).
    if (
      questions.length > fallback.questions.length ||
      (questions.length === fallback.questions.length && isComplete)
    ) {
      fallback = { seq, questions }
    }
  }

  return fallback
}
