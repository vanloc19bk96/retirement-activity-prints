import type { StudioRng } from '../studio-rng'
import { resolveBlankIndex } from './blank-position'
import { isForced, primeAt } from './families'
import {
  PATTERN_GROUPS,
  type BlankPosition,
  type Difficulty,
  type PatternGroup,
  type PatternItem,
} from './types'

/**
 * Number rules. Each rule owns only its *shape*; whether a generated sequence
 * is safe to print is decided by the family solver (families.ts), so adding a
 * rule here can never ship an ambiguous puzzle.
 */
export interface NumberRule {
  id: string
  /** Skill group the rule belongs to (drives the "Pattern types" picker). */
  group: PatternGroup
  /** Fewest shown terms that still pin the rule down. */
  minShown: number
  difficulties: readonly Difficulty[]
  /** Build exactly `length` terms (blank included). */
  generate(rng: StudioRng, difficulty: Difficulty, length: number): number[]
}

/** Every pattern type the picker offers, in picker order. */
const ALL_NUMBER_GROUPS: readonly PatternGroup[] = PATTERN_GROUPS.map((group) => group.value)

/** Longest sequence the sheet can lay out without shrinking type too far. */
export const MAX_TERMS = 7

const MAX_ABS: Record<Difficulty, number> = { easy: 120, medium: 999, hard: 9999 }

function byTier<T>(difficulty: Difficulty, easy: T, medium: T, hard: T): T {
  return difficulty === 'easy' ? easy : difficulty === 'medium' ? medium : hard
}

function linear(start: number, step: number, length: number): number[] {
  return Array.from({ length }, (_, i) => start + i * step)
}

// --- adding / subtracting -------------------------------------------------

function addConstant(rng: StudioRng, difficulty: Difficulty, length: number): number[] {
  const start = rng.int(1, byTier(difficulty, 25, 40, 60))
  const step = rng.int(2, byTier(difficulty, 6, 9, 14))
  return linear(start, step, length)
}

function subtractConstant(rng: StudioRng, difficulty: Difficulty, length: number): number[] {
  const step = rng.int(2, byTier(difficulty, 5, 9, 14))
  // Only hard sheets are allowed to run past zero into negatives.
  const floor = difficulty === 'hard' ? 0 : step * length
  const start = floor + rng.int(1, byTier(difficulty, 30, 60, 120))
  return linear(start, -step, length)
}

function countBy(rng: StudioRng, difficulty: Difficulty, length: number): number[] {
  const step = rng.pick(byTier(difficulty, [5, 10], [5, 10, 25], [10, 25, 50]))
  const start = step * rng.int(1, 6)
  return linear(start, step, length)
}

// --- multiplying / dividing ----------------------------------------------

function doubling(rng: StudioRng, _difficulty: Difficulty, length: number): number[] {
  const start = rng.int(1, 6)
  return Array.from({ length }, (_, i) => start * 2 ** i)
}

function geometric(rng: StudioRng, difficulty: Difficulty, length: number): number[] {
  const ratio = rng.pick(byTier(difficulty, [2], [2, 3], [2, 3, 4, 5]))
  const start = rng.int(1, difficulty === 'hard' ? 4 : 3)
  return Array.from({ length }, (_, i) => start * ratio ** i)
}

function halving(rng: StudioRng, difficulty: Difficulty, length: number): number[] {
  const ratio = rng.pick(difficulty === 'hard' ? [2, 3] : [2])
  const last = rng.int(1, 5)
  const first = last * ratio ** (length - 1)
  return Array.from({ length }, (_, i) => first / ratio ** i)
}

function affineStep(rng: StudioRng, difficulty: Difficulty, length: number): number[] {
  const m = rng.pick(difficulty === 'hard' ? [2, 3] : [2])
  const k = rng.int(1, difficulty === 'hard' ? 5 : 3)
  const seq = [rng.int(1, 4)]
  for (let i = 1; i < length; i++) seq.push(seq[i - 1]! * m + k)
  return seq
}

function multiplyGrowing(rng: StudioRng, _difficulty: Difficulty, length: number): number[] {
  const start = rng.int(1, 3)
  const from = rng.int(2, 3)
  const seq = [start]
  for (let i = 1; i < length; i++) seq.push(seq[i - 1]! * (from + i - 1))
  return seq
}

// --- figurate numbers -----------------------------------------------------

function squares(rng: StudioRng, difficulty: Difficulty, length: number): number[] {
  const start = rng.int(1, byTier(difficulty, 3, 6, 12))
  return Array.from({ length }, (_, i) => (start + i) ** 2)
}

function cubes(rng: StudioRng, difficulty: Difficulty, length: number): number[] {
  const start = rng.int(1, difficulty === 'hard' ? 5 : 3)
  return Array.from({ length }, (_, i) => (start + i) ** 3)
}

function triangular(rng: StudioRng, _difficulty: Difficulty, length: number): number[] {
  const start = rng.int(1, 8)
  return Array.from({ length }, (_, i) => ((start + i) * (start + i + 1)) / 2)
}

// --- growing / shrinking steps -------------------------------------------

function growingStep(rng: StudioRng, difficulty: Difficulty, length: number): number[] {
  const start = rng.int(1, byTier(difficulty, 10, 25, 45))
  const first = rng.int(1, byTier(difficulty, 3, 4, 6))
  const growth = rng.int(1, difficulty === 'hard' ? 3 : 2)
  const seq = [start]
  let step = first
  for (let i = 1; i < length; i++) {
    seq.push(seq[i - 1]! + step)
    step += growth
  }
  return seq
}

function shrinkingStep(rng: StudioRng, difficulty: Difficulty, length: number): number[] {
  const growth = rng.int(1, 3)
  // Keep every step positive so the run reads as a steady slow-down, and start
  // high enough that the last term stays above zero.
  const first = growth * length + rng.int(1, byTier(difficulty, 4, 8, 12))
  const steps = Array.from({ length: length - 1 }, (_, i) => first - i * growth)
  const start = steps.reduce((sum, step) => sum + step, 0) + rng.int(1, 20)
  const seq = [start]
  for (const step of steps) seq.push(seq[seq.length - 1]! - step)
  return seq
}

// --- recursive ------------------------------------------------------------

function fibonacciLike(rng: StudioRng, difficulty: Difficulty, length: number): number[] {
  const a = rng.int(1, byTier(difficulty, 4, 8, 12))
  const b = a + rng.int(1, byTier(difficulty, 4, 8, 14))
  const seq = [a, b]
  while (seq.length < length) seq.push(seq[seq.length - 1]! + seq[seq.length - 2]!)
  return seq.slice(0, length)
}

// --- interleaved / alternating -------------------------------------------

function interleaved(rng: StudioRng, difficulty: Difficulty, length: number): number[] {
  const startA = rng.int(1, 15)
  const startB = startA + rng.int(2, 20)
  const stepA = rng.int(1, byTier(difficulty, 4, 6, 9))
  const stepB = rng.int(1, byTier(difficulty, 4, 6, 9))
  return Array.from({ length }, (_, i) =>
    i % 2 === 0 ? startA + (i / 2) * stepA : startB + ((i - 1) / 2) * stepB,
  )
}

function alternatingOps(rng: StudioRng, difficulty: Difficulty, length: number): number[] {
  const m = rng.pick(difficulty === 'hard' ? [2, 3] : [2])
  const k = rng.int(2, difficulty === 'hard' ? 8 : 5)
  const seq = [rng.int(1, 6)]
  for (let i = 1; i < length; i++) {
    seq.push(i % 2 === 1 ? seq[i - 1]! * m : seq[i - 1]! + k)
  }
  return seq
}

// --- special --------------------------------------------------------------

function primes(rng: StudioRng, difficulty: Difficulty, length: number): number[] {
  const offset = rng.int(0, difficulty === 'hard' ? 12 : 4)
  return Array.from({ length }, (_, i) => primeAt(offset + i) ?? Number.NaN)
}

export const NUMBER_RULES: readonly NumberRule[] = [
  { id: 'addConstant', group: 'add', minShown: 4, difficulties: ['easy', 'medium', 'hard'], generate: addConstant },
  { id: 'subtractConstant', group: 'add', minShown: 4, difficulties: ['easy', 'medium', 'hard'], generate: subtractConstant },
  { id: 'countBy', group: 'add', minShown: 4, difficulties: ['easy', 'medium'], generate: countBy },
  // Pure ×/÷ only — ×m+k looks like growing steps to solvers, so it lives under `growing`.
  { id: 'doubling', group: 'multiply', minShown: 4, difficulties: ['easy', 'medium', 'hard'], generate: doubling },
  { id: 'geometric', group: 'multiply', minShown: 4, difficulties: ['medium', 'hard'], generate: geometric },
  { id: 'halving', group: 'multiply', minShown: 4, difficulties: ['medium', 'hard'], generate: halving },
  { id: 'multiplyGrowing', group: 'multiply', minShown: 4, difficulties: ['hard'], generate: multiplyGrowing },
  // Entry rules for each PatternGroup cover easy — ticking a type must be able to print
  // it even on easy sheets (difficulty only hardens the parameters inside generate).
  { id: 'squares', group: 'figurate', minShown: 4, difficulties: ['easy', 'medium', 'hard'], generate: squares },
  { id: 'triangular', group: 'figurate', minShown: 4, difficulties: ['easy', 'medium', 'hard'], generate: triangular },
  { id: 'cubes', group: 'figurate', minShown: 5, difficulties: ['hard'], generate: cubes },
  { id: 'growingStep', group: 'growing', minShown: 4, difficulties: ['easy', 'medium', 'hard'], generate: growingStep },
  { id: 'shrinkingStep', group: 'growing', minShown: 4, difficulties: ['medium', 'hard'], generate: shrinkingStep },
  // ×m+k (gaps double) — not pure multiply; keep "Multiplying & dividing" free of these.
  { id: 'affineStep', group: 'growing', minShown: 4, difficulties: ['medium', 'hard'], generate: affineStep },
  { id: 'fibonacci', group: 'recursive', minShown: 4, difficulties: ['easy', 'medium', 'hard'], generate: fibonacciLike },
  { id: 'interleaved', group: 'interleaved', minShown: 6, difficulties: ['easy', 'medium', 'hard'], generate: interleaved },
  { id: 'alternatingOps', group: 'interleaved', minShown: 6, difficulties: ['hard'], generate: alternatingOps },
  { id: 'primes', group: 'special', minShown: 5, difficulties: ['easy', 'medium', 'hard'], generate: primes },
]

export function eligibleNumberRules(
  difficulty: Difficulty,
  groups?: readonly PatternGroup[],
): NumberRule[] {
  const byDifficulty = NUMBER_RULES.filter((rule) => rule.difficulties.includes(difficulty))
  if (!groups || groups.length === 0) return byDifficulty
  const wanted = byDifficulty.filter((rule) => groups.includes(rule.group))
  // A group selection that leaves nothing at this difficulty falls back to all.
  return wanted.length > 0 ? wanted : byDifficulty
}

/** Terms to build for a rule, allowing one extra when the blank sits inside. */
export function sequenceLength(rule: NumberRule, wantsInterior: boolean): number {
  return Math.min(MAX_TERMS, rule.minShown + 1 + (wantsInterior ? 1 : 0))
}

function isPrintable(seq: number[], difficulty: Difficulty): boolean {
  if (seq.length < 3) return false
  const limit = MAX_ABS[difficulty]
  if (seq.some((n) => !Number.isInteger(n) || Math.abs(n) > limit)) return false
  if (difficulty === 'easy' && seq.some((n) => n < 0)) return false
  if (new Set(seq).size < seq.length - 1) return false
  return true
}

export interface NumberItemOptions {
  difficulty: Difficulty
  blankPosition: BlankPosition
  /** Types the sheet may print. Nothing outside this set is ever drawn. */
  groups?: readonly PatternGroup[]
  /** Sequences already on this sheet, keyed by `terms.join(',')`. */
  used?: Set<string>
  /** Rules already spent on this sheet, so one rule cannot fill the page. */
  ruleUsage?: Map<string, number>
  /** Puzzles on the sheet — sets how often a single rule may repeat. */
  itemCount?: number
}

const ATTEMPTS = 64

/** Rule id -> the pattern type it prints. Lets callers audit a finished sheet. */
export const NUMBER_RULE_GROUP: ReadonlyMap<string, PatternGroup> = new Map(
  NUMBER_RULES.map((rule) => [rule.id, rule.group] as const),
)

/**
 * Rules for one type, widened past the difficulty filter only when that type
 * declares nothing at this difficulty. The widening stays inside the group, so
 * a ticked type can never be quietly served by a different one.
 */
export function groupNumberRules(group: PatternGroup, difficulty: Difficulty): NumberRule[] {
  const inGroup = NUMBER_RULES.filter((rule) => rule.group === group)
  const atDifficulty = inGroup.filter((rule) => rule.difficulties.includes(difficulty))
  return atDifficulty.length > 0 ? atDifficulty : inGroup
}

/** The selected types that can actually print, de-duplicated. Never empty. */
export function usableNumberGroups(
  groups: readonly PatternGroup[] | undefined,
  difficulty: Difficulty,
): PatternGroup[] {
  const wanted = groups && groups.length > 0 ? groups : ALL_NUMBER_GROUPS
  const usable = [...new Set(wanted)].filter(
    (group) => groupNumberRules(group, difficulty).length > 0,
  )
  return usable.length > 0 ? usable : [...ALL_NUMBER_GROUPS]
}

interface Candidate {
  terms: string[]
  blankIndex: number
}

/** One draw from a rule: inside print range, with exactly one forced answer. */
function drawCandidate(
  rule: NumberRule,
  difficulty: Difficulty,
  blankPosition: BlankPosition,
  rng: StudioRng,
): Candidate | null {
  // Probe the blank first so long-form rules only pay for the extra term
  // when the blank actually lands inside the sequence.
  const probeLength = sequenceLength(rule, false)
  const wantsInterior = resolveBlankIndex(blankPosition, probeLength, rng) !== probeLength - 1
  const length = sequenceLength(rule, wantsInterior)
  const seq = rule.generate(rng, difficulty, length)
  if (!isPrintable(seq, difficulty)) return null

  const blankIndex = wantsInterior
    ? resolveBlankIndex('random', seq.length, rng)
    : seq.length - 1
  if (!isForced(seq, blankIndex)) return null
  return { terms: seq.map(String), blankIndex }
}

/** Take the candidate for the sheet, or reject it as a repeat. */
function claimCandidate(
  rule: NumberRule,
  candidate: Candidate,
  options: NumberItemOptions,
): PatternItem | null {
  const signature = candidate.terms.join(',')
  if (options.used?.has(signature)) return null
  options.used?.add(signature)
  options.ruleUsage?.set(rule.id, (options.ruleUsage.get(rule.id) ?? 0) + 1)
  return {
    kind: 'number',
    ruleId: rule.id,
    terms: candidate.terms,
    answerText: candidate.terms[candidate.blankIndex],
    blankIndex: candidate.blankIndex,
  }
}

/** Spread a type's slots over its own rules before any of them repeats. */
function pickWithinGroup(
  rules: readonly NumberRule[],
  ruleUsage: Map<string, number> | undefined,
  attempt: number,
  rng: StudioRng,
): NumberRule {
  if (!ruleUsage || attempt >= ATTEMPTS / 2) return rng.pick(rules)
  const min = Math.min(...rules.map((rule) => ruleUsage.get(rule.id) ?? 0))
  const leastUsed = rules.filter((rule) => (ruleUsage.get(rule.id) ?? 0) === min)
  return rng.pick(leastUsed.length > 0 ? leastUsed : rules)
}

/**
 * Draw an item guaranteed to belong to `group`, or null when that type cannot
 * fill this slot at these settings.
 *
 * The null is the point: silently switching to another rule is exactly how a
 * ticked pattern type used to go missing from a sheet. The caller owns what
 * happens next, so the omission can be seen and repaired.
 */
export function pickNumberItemFromGroup(
  group: PatternGroup,
  options: NumberItemOptions,
  rng: StudioRng,
): PatternItem | null {
  const rules = groupNumberRules(group, options.difficulty)
  if (rules.length === 0) return null
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const rule = pickWithinGroup(rules, options.ruleUsage, attempt, rng)
    const candidate = drawCandidate(rule, options.difficulty, options.blankPosition, rng)
    if (!candidate) continue
    const item = claimCandidate(rule, candidate, options)
    if (item) return item
  }
  return null
}

/** Prefer rules from the least-used groups so every picked type reaches the page. */
function pickCandidateRule(
  rules: readonly NumberRule[],
  options: {
    ruleUsage?: Map<string, number>
    groupUsage: Map<PatternGroup, number>
    itemCount?: number
    attempt: number
    rng: StudioRng
  },
): NumberRule {
  const { ruleUsage, groupUsage, itemCount, attempt, rng } = options
  const ruleCap =
    ruleUsage && itemCount ? Math.max(1, Math.ceil(itemCount / rules.length)) : null

  let pool: readonly NumberRule[] = rules
  // First half of attempts: fill unseen groups before any group repeats.
  // (A flat "under cap" filter lets popular groups take a 2nd slot while primes stay at 0.)
  if (attempt < ATTEMPTS / 2) {
    const minGroupUsage = Math.min(...rules.map((rule) => groupUsage.get(rule.group) ?? 0))
    const leastUsedGroups = pool.filter(
      (rule) => (groupUsage.get(rule.group) ?? 0) === minGroupUsage,
    )
    if (leastUsedGroups.length > 0) pool = leastUsedGroups

    if (ruleCap !== null && ruleUsage) {
      const underRule = pool.filter((rule) => (ruleUsage.get(rule.id) ?? 0) < ruleCap)
      if (underRule.length > 0) pool = underRule
    }
  }
  return rng.pick(pool)
}

/**
 * Unassigned draw: any rule from the selected types, biased towards the types
 * this sheet has used least. Serves direct callers, and the sheet planner's
 * fallback when an assigned type cannot fill its slot.
 */
export function pickNumberItem(options: NumberItemOptions, rng: StudioRng): PatternItem {
  const { difficulty, blankPosition, groups, ruleUsage, itemCount } = options
  const rules = eligibleNumberRules(difficulty, groups)
  const groupUsage = new Map<PatternGroup, number>()
  if (ruleUsage) {
    for (const rule of rules) {
      const count = ruleUsage.get(rule.id) ?? 0
      if (count > 0) {
        groupUsage.set(rule.group, (groupUsage.get(rule.group) ?? 0) + count)
      }
    }
  }

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const rule = pickCandidateRule(rules, {
      ruleUsage,
      groupUsage,
      itemCount,
      attempt,
      rng,
    })
    const candidate = drawCandidate(rule, difficulty, blankPosition, rng)
    if (!candidate) continue
    const item = claimCandidate(rule, candidate, options)
    if (item) return item
  }

  return fallbackNumberItem(difficulty, options.used, rng, rules)
}

/** Last-resort fill from the same eligible pool — never leaks an unticked group. */
function fallbackNumberItem(
  difficulty: Difficulty,
  used: Set<string> | undefined,
  rng: StudioRng,
  rules: readonly NumberRule[],
): PatternItem {
  const pool = rules.length > 0 ? rules : eligibleNumberRules(difficulty)
  for (let attempt = 0; attempt < 48; attempt++) {
    const rule = rng.pick(pool)
    const length = sequenceLength(rule, false)
    const seq = rule.generate(rng, difficulty, length)
    if (!isPrintable(seq, difficulty)) continue
    const blankIndex = length - 1
    if (!isForced(seq, blankIndex)) continue
    const terms = seq.map(String)
    const signature = terms.join(',')
    if (used?.has(signature)) continue
    used?.add(signature)
    return {
      kind: 'number',
      ruleId: rule.id,
      terms,
      answerText: terms[blankIndex],
      blankIndex,
    }
  }

  // Absolute last resort: plain arithmetic only if that group is still eligible.
  const addRule = pool.find((rule) => rule.id === 'addConstant')
  if (addRule) {
    const step = rng.int(2, 9)
    for (let start = rng.int(1, 40); start < 400; start += 1) {
      const seq = linear(start, step, 5)
      if (!isPrintable(seq, difficulty)) continue
      const terms = seq.map(String)
      const signature = terms.join(',')
      if (used?.has(signature)) continue
      used?.add(signature)
      return {
        kind: 'number',
        ruleId: 'addConstant',
        terms,
        answerText: terms[terms.length - 1],
        blankIndex: terms.length - 1,
      }
    }
  }

  const rule = pool[0]!
  const length = sequenceLength(rule, false)
  const seq = rule.generate(rng, difficulty, length)
  const terms = seq.map(String)
  used?.add(terms.join(','))
  return {
    kind: 'number',
    ruleId: rule.id,
    terms,
    answerText: terms[terms.length - 1],
    blankIndex: terms.length - 1,
  }
}
