import type { StudioRng } from '../studio-rng'

export type MathDifficulty = 'easy' | 'medium' | 'hard'
export type MathOperationSet = 'add-sub' | 'add-sub-mul' | 'all'
export type MathOperation =
  | 'add'
  | 'sub'
  | 'mul'
  | 'div'
  | 'half'
  | 'double'
  | 'percent'

export interface MathStep {
  /** Printed rung copy, e.g. "+ 9" or "half of it". */
  label: string
  /** Running total after this rung. */
  value: number
}

export interface MathChain {
  start: number
  steps: MathStep[]
  answer: number
}

/** Typographic operators — ASCII "-" and "x" read as a hyphen and a letter in print. */
const MINUS = '−'
const TIMES = '×'
const DIVIDE = '÷'

/** Running totals never drop below this, so the solver never meets 0 or a negative. */
const MIN_VALUE = 2
const PERCENTS = [10, 25, 50] as const

/** Distinct answers tried per start range before the range is widened. */
const MAX_TARGET_ATTEMPTS = 8
/** Slice of the start range a search is pinned to, as a fraction of its span. */
const START_SLICE = 1 / 12
/** Search nodes per answer — bounds worst-case work on a 12-ladder page. */
const MAX_SEARCH_NODES = 2_000
/** Operands kept per operation, so which operation runs stays near-uniform. */
const OPERAND_FANOUT = 6
/** Wider at the last rung searched — that one fixes the ladder's start number. */
const START_FANOUT = 16
/** Random draws before target picking falls back to a scan for a free answer. */
const TARGET_DRAWS = 24

const EMPTY_ANSWERS: ReadonlySet<number> = new Set()

const ANSWER_BANDS: Record<MathDifficulty, { min: number; max: number }> = {
  easy: { min: MIN_VALUE, max: 60 },
  medium: { min: 61, max: 250 },
  hard: { min: 251, max: 999 },
}

interface Ranges {
  start: readonly [number, number]
  term: readonly [number, number]
}

/**
 * Add/subtract-only ladders have no multiplier to climb with, so the start and
 * the terms have to span the band themselves. With small terms every ladder
 * stalls near its start and the answers collapse onto the band floor.
 */
const LINEAR_RANGES: Record<MathDifficulty, Ranges> = {
  easy: { start: [3, 24], term: [1, 12] },
  medium: { start: [35, 130], term: [6, 48] },
  hard: { start: [160, 480], term: [20, 150] },
}

/** Multiplication carries the climb, so starts and terms stay small and mental. */
const SCALING_RANGES: Record<MathDifficulty, Ranges> = {
  easy: { start: [2, 30], term: [1, 9] },
  medium: { start: [6, 120], term: [2, 25] },
  hard: { start: [11, 400], term: [8, 80] },
}

const FACTORS: Record<MathDifficulty, readonly number[]> = {
  easy: [2, 3],
  medium: [2, 3, 4, 5],
  hard: [2, 3, 4, 6, 7, 8, 9],
}

/** Division and percentages stay off the easier bands whatever the set allows. */
const DIFFICULTY_OPERATIONS: Record<MathDifficulty, readonly MathOperation[]> = {
  easy: ['add', 'sub', 'mul', 'half', 'double'],
  medium: ['add', 'sub', 'mul', 'div', 'half', 'double'],
  hard: ['add', 'sub', 'mul', 'div', 'half', 'double', 'percent'],
}

const OPERATIONS_BY_SET: Record<MathOperationSet, readonly MathOperation[]> = {
  'add-sub': ['add', 'sub'],
  'add-sub-mul': ['add', 'sub', 'mul', 'double'],
  all: ['add', 'sub', 'mul', 'div', 'half', 'double', 'percent'],
}

const SCALING_OPS: readonly MathOperation[] = ['mul', 'div', 'half', 'double', 'percent']

interface DifficultyProfile {
  band: { min: number; max: number }
  start: readonly [number, number]
  term: readonly [number, number]
  factors: readonly number[]
  /** No running total, start or answer may exceed this. */
  maxValue: number
}

/** Widest move a single rung can make — used to prune the search. */
interface Reach {
  addTerm: number
  subTerm: number
  growFactor: number
  shrinkFactor: number
}

export function parseDifficulty(raw: unknown): MathDifficulty {
  return raw === 'easy' || raw === 'hard' ? raw : 'medium'
}

export function parseOperationSet(raw: unknown): MathOperationSet {
  return raw === 'add-sub' || raw === 'all' ? raw : 'add-sub-mul'
}

function profileFor(
  difficulty: MathDifficulty,
  allowed: readonly MathOperation[],
): DifficultyProfile {
  const scales = allowed.some((op) => SCALING_OPS.includes(op))
  const ranges = (scales ? SCALING_RANGES : LINEAR_RANGES)[difficulty]
  const band = ANSWER_BANDS[difficulty]
  return {
    band,
    start: ranges.start,
    term: ranges.term,
    factors: FACTORS[difficulty],
    maxValue: band.max,
  }
}

function reachOf(
  allowed: readonly MathOperation[],
  profile: DifficultyProfile,
): Reach {
  const has = (op: MathOperation) => allowed.includes(op)
  const maxFactor = Math.max(...profile.factors)
  let growFactor = 1
  if (has('mul')) growFactor = Math.max(growFactor, maxFactor)
  if (has('double')) growFactor = Math.max(growFactor, 2)
  let shrinkFactor = 1
  if (has('div')) shrinkFactor = Math.max(shrinkFactor, maxFactor)
  if (has('half')) shrinkFactor = Math.max(shrinkFactor, 2)
  if (has('percent')) shrinkFactor = Math.max(shrinkFactor, 100 / Math.min(...PERCENTS))
  return {
    addTerm: has('add') ? profile.term[1] : 0,
    subTerm: has('sub') ? profile.term[1] : 0,
    growFactor,
    shrinkFactor,
  }
}

/** The rung as seen from its result: what the total was before it ran. */
interface BackStep {
  label: string
  previous: number
}

/**
 * Every whole-number total that could sit one rung *before* `value`. Working
 * backwards is what lets a ladder land on a chosen answer exactly, instead of
 * walking forward and hoping it lands in band.
 */
function backCandidates(
  operation: MathOperation,
  value: number,
  profile: DifficultyProfile,
): BackStep[] {
  const [minTerm, maxTerm] = profile.term
  const out: BackStep[] = []

  if (operation === 'add') {
    const max = Math.min(maxTerm, value - MIN_VALUE)
    for (let t = minTerm; t <= max; t++) out.push({ label: `+ ${t}`, previous: value - t })
    return out
  }

  if (operation === 'sub') {
    const max = Math.min(maxTerm, profile.maxValue - value)
    for (let t = minTerm; t <= max; t++) {
      out.push({ label: `${MINUS} ${t}`, previous: value + t })
    }
    return out
  }

  if (operation === 'mul') {
    for (const f of profile.factors) {
      if (value % f === 0 && value / f >= MIN_VALUE) {
        out.push({ label: `${TIMES} ${f}`, previous: value / f })
      }
    }
    return out
  }

  if (operation === 'div') {
    for (const f of profile.factors) {
      if (value * f <= profile.maxValue) {
        out.push({ label: `${DIVIDE} ${f}`, previous: value * f })
      }
    }
    return out
  }

  if (operation === 'double') {
    if (value % 2 === 0 && value / 2 >= MIN_VALUE) {
      out.push({ label: 'double it', previous: value / 2 })
    }
    return out
  }

  if (operation === 'half') {
    if (value * 2 <= profile.maxValue) out.push({ label: 'half of it', previous: value * 2 })
    return out
  }

  for (const p of PERCENTS) {
    const previous = (value * 100) / p
    if (Number.isInteger(previous) && previous <= profile.maxValue) {
      out.push({ label: `${p}% of it`, previous })
    }
  }
  return out
}

/** n random entries — add/sub lists run to a hundred-odd terms, so no full shuffle. */
function sampleUpTo<T>(items: readonly T[], n: number, rng: StudioRng): T[] {
  if (items.length <= n) return rng.shuffle(items)
  const picked: T[] = []
  const seen = new Set<number>()
  while (picked.length < n) {
    const i = rng.int(0, items.length - 1)
    if (seen.has(i)) continue
    seen.add(i)
    picked.push(items[i]!)
  }
  return picked
}

/** Loosest interval the totals could still occupy `remaining` rungs earlier. */
function backwardBounds(
  value: number,
  remaining: number,
  profile: DifficultyProfile,
  reach: Reach,
): { lo: number; hi: number } {
  let lo = value
  let hi = value
  for (let i = 0; i < remaining; i++) {
    lo = Math.max(MIN_VALUE, Math.min(lo - reach.addTerm, lo / reach.growFactor))
    hi = Math.min(profile.maxValue, Math.max(hi + reach.subTerm, hi * reach.shrinkFactor))
  }
  return { lo, hi }
}

/** Answers this many rungs can actually reach, clipped to the difficulty band. */
function answerWindow(
  profile: DifficultyProfile,
  reach: Reach,
  steps: number,
): { min: number; max: number } {
  let lo = profile.start[0]
  let hi = profile.start[1]
  for (let i = 0; i < steps; i++) {
    lo = Math.max(MIN_VALUE, Math.min(lo - reach.subTerm, lo / reach.shrinkFactor))
    hi = Math.min(profile.maxValue, Math.max(hi + reach.addTerm, hi * reach.growFactor))
  }
  const min = Math.max(profile.band.min, Math.ceil(lo))
  const max = Math.min(profile.band.max, Math.floor(hi))
  return max >= min ? { min, max } : { ...profile.band }
}

/**
 * A fresh answer per ladder — two ladders sharing an answer is the tell that a
 * page was machine-filled, and it also hands the solver a free check.
 */
function pickTarget(
  rng: StudioRng,
  window: { min: number; max: number },
  used: ReadonlySet<number>,
): number {
  for (let i = 0; i < TARGET_DRAWS; i++) {
    const target = rng.int(window.min, window.max)
    if (!used.has(target)) return target
  }
  const span = window.max - window.min + 1
  const base = rng.int(window.min, window.max)
  for (let offset = 0; offset < span; offset++) {
    const target = window.min + ((base - window.min + offset) % span)
    if (!used.has(target)) return target
  }
  return base
}

/**
 * A narrow, randomly placed slice of the start range. Searching the whole range
 * makes starts pile up against whichever edge the walk reaches first — pinning
 * each ladder to its own slice spreads them across the range instead.
 */
function startWindow(
  rng: StudioRng,
  profile: DifficultyProfile,
  usedStarts: ReadonlySet<number>,
): readonly [number, number] {
  const [min, max] = profile.start
  const half = Math.max(1, Math.round(((max - min + 1) * START_SLICE) / 2))
  let center = rng.int(min, max)
  for (let i = 0; i < TARGET_DRAWS && usedStarts.has(center); i++) {
    center = rng.int(min, max)
  }
  return [Math.max(min, center - half), Math.min(max, center + half)]
}

/** Backward rungs are collected answer-first; replay them into printed order. */
function chainFromBackward(rungs: readonly BackStep[], answer: number): MathChain {
  const ordered = [...rungs].reverse()
  const start = ordered[0]?.previous ?? answer
  const steps = ordered.map((rung, i) => ({
    label: rung.label,
    value: i + 1 < ordered.length ? ordered[i + 1]!.previous : answer,
  }))
  return { start, steps, answer }
}

/**
 * Randomised depth-first search for a ladder that lands on `target` exactly.
 * Totals stay whole, in range and never repeat, and no rung repeats the one
 * above it verbatim.
 */
function searchBackward(options: {
  target: number
  steps: number
  profile: DifficultyProfile
  allowed: readonly MathOperation[]
  reach: Reach
  startRange: readonly [number, number]
  usedStarts: ReadonlySet<number>
  rng: StudioRng
}): MathChain | null {
  const { target, steps, profile, allowed, reach, startRange, usedStarts, rng } = options
  const rungs: BackStep[] = []
  const visited = new Set<number>([target])
  let budget = MAX_SEARCH_NODES

  const inStartRange = (value: number) =>
    value >= startRange[0] && value <= startRange[1]

  const collect = (value: number, remaining: number): BackStep[] => {
    // The last rung searched fixes the start, so it gets the wider draw.
    const leaf = remaining === 1
    const out: BackStep[] = []
    for (const operation of allowed) {
      const all = backCandidates(operation, value, profile)
      const usable = leaf ? all.filter((c) => inStartRange(c.previous)) : all
      // Capped per operation so long add/sub lists don't crowd out × and ÷.
      out.push(...sampleUpTo(usable, leaf ? START_FANOUT : OPERAND_FANOUT, rng))
    }
    const shuffled = rng.shuffle(out)
    if (!leaf) return shuffled
    // Untaken start numbers first, but keep the rest as backtracking fodder.
    const fresh = shuffled.filter((c) => !usedStarts.has(c.previous))
    if (fresh.length === 0 || fresh.length === shuffled.length) return shuffled
    return [...fresh, ...shuffled.filter((c) => usedStarts.has(c.previous))]
  }

  const visit = (value: number, remaining: number): boolean => {
    if (remaining === 0) return inStartRange(value)
    if (budget-- <= 0) return false
    const { lo, hi } = backwardBounds(value, remaining, profile, reach)
    if (hi < startRange[0] || lo > startRange[1]) return false

    const adjacent = rungs[rungs.length - 1]?.label
    for (const candidate of collect(value, remaining)) {
      if (candidate.label === adjacent) continue
      if (visited.has(candidate.previous)) continue
      visited.add(candidate.previous)
      rungs.push(candidate)
      if (visit(candidate.previous, remaining - 1)) return true
      rungs.pop()
      visited.delete(candidate.previous)
    }
    return false
  }

  return visit(target, steps) ? chainFromBackward(rungs, target) : null
}

/**
 * Reached only if the search exhausts every target it tried. A one-directional
 * add-or-subtract walk is always legal, so the ladder still lands on its own
 * answer rather than collapsing onto the band floor.
 */
function fallbackChain(
  target: number,
  steps: number,
  profile: DifficultyProfile,
): MathChain {
  const [minTerm, maxTerm] = profile.term
  const terms = [minTerm, Math.min(maxTerm, minTerm + 1)] as const
  // Alternating two terms keeps consecutive rungs from reading identically.
  const span = Math.ceil(steps / 2) * (terms[0] + terms[1])
  const descend = target - span >= MIN_VALUE

  const rungs: BackStep[] = []
  let value = target
  for (let i = 0; i < steps; i++) {
    const term = terms[i % 2]!
    value = descend ? value - term : value + term
    rungs.push({ label: descend ? `+ ${term}` : `${MINUS} ${term}`, previous: value })
  }
  return chainFromBackward(rungs, target)
}

export function buildChain(options: {
  steps: number
  difficulty: MathDifficulty
  operationSet: MathOperationSet
  rng: StudioRng
  /** Answers already on this page — kept distinct so one sheet never repeats. */
  usedAnswers?: ReadonlySet<number>
  /** Start numbers already on this page — kept distinct where the search allows. */
  usedStarts?: ReadonlySet<number>
}): MathChain {
  const { steps, difficulty, operationSet, rng } = options
  const set = OPERATIONS_BY_SET[operationSet]
  const allowed = DIFFICULTY_OPERATIONS[difficulty].filter((op) => set.includes(op))
  if (allowed.length === 0) throw new Error('mental-math-ladder: no operations allowed')

  const profile = profileFor(difficulty, allowed)
  const reach = reachOf(allowed, profile)
  const window = answerWindow(profile, reach, steps)
  const used = options.usedAnswers ?? EMPTY_ANSWERS
  const usedStarts = options.usedStarts ?? EMPTY_ANSWERS

  // Own slice of the start range first, then the whole range, then any legal
  // start — an odd-looking start still beats a repeated or floor-pinned answer.
  const tiers: readonly (() => readonly [number, number])[] = [
    () => startWindow(rng, profile, usedStarts),
    () => profile.start,
    () => [MIN_VALUE, profile.maxValue],
  ]

  let target = window.min
  for (const startRange of tiers) {
    for (let attempt = 0; attempt < MAX_TARGET_ATTEMPTS; attempt++) {
      target = pickTarget(rng, window, used)
      const chain = searchBackward({
        target,
        steps,
        profile,
        allowed,
        reach,
        startRange: startRange(),
        usedStarts,
        rng,
      })
      if (chain) return chain
    }
  }

  return fallbackChain(target, steps, profile)
}
