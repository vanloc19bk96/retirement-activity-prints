import type { StudioRng } from '../studio-rng'
import { hashStudioFingerprint } from '../studio-content-fingerprint'
import { solveBoard } from './solver'
import {
  ATTRIBUTES,
  DOMAINS,
  ROOMY_SHAPES,
  RULE_TIER,
  figureKey,
  isPrintable,
  planLabel,
  withAttribute,
  type AttributeKey,
  type AttributeRule,
  type Axis,
  type CountKind,
  type Difficulty,
  type Figure,
  type FigureValue,
  type LogicOp,
  type RuleKind,
} from './types'

/**
 * Building a board.
 *
 * The generator picks a *plan* — which channels vary and by what rule — lays
 * the nine cells out from it, and then throws the plan away and asks
 * `solveBoard` to read the result back off the page. Only boards the solver
 * recovers unaided are printed, so a plan is a proposal, never a guarantee.
 * That is what lets the rule vocabulary grow without every new family risking
 * a page with two right answers.
 */

export interface Board {
  cells: Figure[]
  rules: AttributeRule[]
  /** Tier the solver needed, not the tier the plan asked for. */
  tier: number
}

/** Attempts before a tier gives up and falls back to a plan that always works. */
const PLAN_ATTEMPTS = 60

/** Channels whose values have a natural order — kept ordered so they read as a ladder. */
const ORDERED: AttributeKey[] = ['count', 'size']

/** What this board is allowed to print, once the channel set is known. */
export interface Limits {
  shape: FigureValue[]
  count: FigureValue[]
  fill: FigureValue[]
  size: FigureValue[]
  mark: FigureValue[]
}

/**
 * Narrow every channel's domain to what will survive the trim.
 *
 * An inner mark is a hole in the ink around it, so a board that varies marks
 * cannot also print solid fills, small figures, crowded cells or spiky
 * outlines. Rather than sprinkling those conditions through the builders, they
 * are applied once, here, and every later choice draws from the narrowed
 * domains.
 */
export function limitsFor(channels: readonly AttributeKey[], allowTriples: boolean): Limits {
  const marked = channels.includes('mark')
  return {
    shape: marked ? [...ROOMY_SHAPES] : [...DOMAINS.shape],
    count: marked || !allowTriples ? [1, 2] : [...DOMAINS.count],
    fill: marked ? ['hollow', 'shaded'] : [...DOMAINS.fill],
    size: marked ? ['medium', 'large'] : [...DOMAINS.size],
    mark: [...DOMAINS.mark],
  }
}

/** Latin square of order 3, uniformly picked from all twelve. */
export function randomLatinSquare(rng: StudioRng): number[][] {
  // Both 1 and 2 are coprime with 3, so either step walks a full cycle.
  const step = rng.chance(0.5) ? 1 : 2
  const rowOrder = rng.shuffle([0, 1, 2])
  const colOrder = rng.shuffle([0, 1, 2])
  return rowOrder.map((r) => colOrder.map((c) => (r * step + c) % 3))
}

/** Which of a band rule's three values cell (r, c) takes. */
export function valueIndexAt(rule: AttributeRule, r: number, c: number): number {
  if (rule.kind === 'rowConstant') return r
  if (rule.kind === 'columnConstant') return c
  return rule.square![r]![c]!
}

function pickValues(attribute: AttributeKey, pool: FigureValue[], rng: StudioRng): FigureValue[] {
  if (!ORDERED.includes(attribute)) return rng.sample(pool, 3)
  // An ordered channel stays ordered (up or down) so the band reads as
  // small → large rather than as an arbitrary shuffle.
  const ordered = [...pool].slice(0, 3)
  return rng.chance(0.5) ? ordered : ordered.reverse()
}

/** One channel of the board: the rule, and the nine values it lays down. */
export interface Channel {
  rule: AttributeRule
  values: FigureValue[]
}

function bandChannel(
  attribute: AttributeKey,
  kind: Extract<RuleKind, 'rowConstant' | 'columnConstant' | 'latin'>,
  pool: FigureValue[],
  rng: StudioRng,
): Channel | null {
  if (pool.length < 3) return null
  const rule: AttributeRule = { attribute, kind, values: pickValues(attribute, pool, rng) }
  if (kind === 'latin') rule.square = randomLatinSquare(rng)

  const values: FigureValue[] = []
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) values.push(rule.values![valueIndexAt(rule, r, c)]!)
  }
  return { rule, values }
}

function applyOp(op: LogicOp, a: boolean, b: boolean): boolean {
  if (op === 'xor') return a !== b
  if (op === 'and') return a && b
  return a || b
}

/**
 * "The third one is the first two combined."
 *
 * Two of the three lines have to be *visible* for the reader to work out which
 * combination is in play, and they only pin it down when they disagree with
 * each other: a line whose operands are both on separates `xor` from `or`, and
 * a line with exactly one on separates `and` from both. Handing those two out
 * first is the difference between a rule that can be deduced and one that has
 * to be guessed. The remaining line carries the answer.
 */
function logicChannel(
  attribute: AttributeKey,
  pool: FigureValue[],
  rng: StudioRng,
): Channel | null {
  if (pool.length < 2) return null
  const [off, on] = rng.sample(pool, 2) as [FigureValue, FigureValue]
  const op = rng.pick<LogicOp>(['xor', 'and', 'or'])
  const axis: Axis = rng.chance(0.5) ? 'row' : 'column'

  const pinning = rng.shuffle([
    [true, true],
    rng.chance(0.5) ? [true, false] : [false, true],
  ])
  const free = rng.pick([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])
  const lines = [...pinning, free] as boolean[][]

  const values: FigureValue[] = Array.from({ length: 9 }, () => off)
  lines.forEach((operands, line) => {
    const [a, b] = operands as [boolean, boolean]
    const result = applyOp(op, a, b)
    const cell = (index: number): number => (axis === 'row' ? line * 3 + index : index * 3 + line)
    values[cell(0)] = a ? on : off
    values[cell(1)] = b ? on : off
    values[cell(2)] = result ? on : off
  })

  return { rule: { attribute, kind: 'logic', axis, op, poles: [off, on] }, values }
}

/**
 * Quantities that add along a line — the one rule on the page that is genuinely
 * arithmetic rather than visual. Only 1 + 1 and 1 + 2 stay inside three shapes
 * per cell, and the two visible lines must differ or the board collapses into
 * "every line looks the same".
 */
function sumChannel(pool: FigureValue[], rng: StudioRng): Channel | null {
  const counts = new Set(pool as CountKind[])
  if (!counts.has(1) || !counts.has(2) || !counts.has(3)) return null

  const axis: Axis = rng.chance(0.5) ? 'row' : 'column'
  const operands: [number, number][] = [
    [1, 1],
    [1, 2],
    [2, 1],
  ]
  const lines = rng.shuffle(operands).slice(0, 2)
  lines.push(rng.pick(operands))

  const values: FigureValue[] = Array.from({ length: 9 }, () => 1 as FigureValue)
  lines.forEach(([a, b], line) => {
    const cell = (index: number): number => (axis === 'row' ? line * 3 + index : index * 3 + line)
    values[cell(0)] = a as FigureValue
    values[cell(1)] = b as FigureValue
    values[cell(2)] = (a + b) as FigureValue
  })

  return { rule: { attribute: 'count', kind: 'sum', axis }, values }
}

/** Rule families each channel can carry, given what it has to stay legible for. */
function kindsFor(attribute: AttributeKey, limits: Limits, tier3: boolean): RuleKind[] {
  const pool = limits[attribute]
  const kinds: RuleKind[] = []
  if (pool.length >= 3) kinds.push('rowConstant', 'columnConstant', 'latin')
  if (!tier3) return kinds
  // Logic reads as a rule only where the two poles are obvious opposites:
  // painted or not, marked or not. "Circle xor square" is a riddle, not a rule.
  if (attribute === 'fill' || attribute === 'mark' || attribute === 'count') kinds.push('logic')
  // Adding needs all three quantities: the sums are 1 + 1 and 1 + 2.
  if (attribute === 'count' && [1, 2, 3].every((value) => pool.includes(value as FigureValue))) {
    kinds.push('sum')
  }
  return kinds
}

function buildChannel(
  attribute: AttributeKey,
  kind: RuleKind,
  limits: Limits,
  rng: StudioRng,
): Channel | null {
  const pool = limits[attribute]
  if (kind === 'logic') return logicChannel(attribute, pool, rng)
  if (kind === 'sum') return sumChannel(pool, rng)
  if (kind === 'constant') return null
  return bandChannel(attribute, kind, pool, rng)
}

/**
 * Value for a channel no rule governs.
 *
 * Weighted for a page that stays light and legible: mostly hollow shapes, an
 * inner mark only where a rule asked for one, and never a wall of three solids
 * per cell. Size leans large whenever quantity is ruled, because those are
 * exactly the boards that have to fit three shapes into one cell.
 */
function restingValue(
  attribute: AttributeKey,
  ruled: ReadonlySet<AttributeKey>,
  limits: Limits,
  rng: StudioRng,
): FigureValue {
  const pool = limits[attribute]
  const prefer = (...wanted: FigureValue[]): FigureValue | null => {
    const available = wanted.filter((value) => pool.includes(value))
    return available.length > 0 ? rng.pick(available) : null
  }

  if (attribute === 'mark') return 'none'
  if (attribute === 'fill') {
    return (rng.chance(0.55) ? prefer('hollow') : prefer('shaded', 'solid')) ?? pool[0]!
  }
  if (attribute === 'size') {
    return (ruled.has('count') ? prefer('large') : prefer('medium', 'large')) ?? pool[0]!
  }
  if (attribute === 'count') return (rng.chance(0.6) ? prefer(1) : prefer(2)) ?? pool[0]!
  return rng.pick(pool)
}

function restingFigure(
  ruled: ReadonlySet<AttributeKey>,
  limits: Limits,
  rng: StudioRng,
): Figure {
  const figure = {} as Figure
  for (const attribute of ATTRIBUTES) {
    Object.assign(figure, { [attribute]: restingValue(attribute, ruled, limits, rng) })
  }
  return figure
}

export function assembleCells(channels: readonly Channel[], resting: Figure): Figure[] {
  return Array.from({ length: 9 }, (_, index) => {
    let figure = resting
    for (const channel of channels) {
      figure = withAttribute(figure, channel.rule.attribute, channel.values[index]!)
    }
    return figure
  })
}

/**
 * How a channel partitions the nine cells, ignoring which values it used.
 *
 * Two channels that carve the board up the same way move in lockstep, so the
 * second one is ink without information — the reader gets no second rule to
 * check, only a second way of seeing the first. Comparing partitions catches
 * that across rule families, where comparing rule kinds could not: a latin
 * square and a column band can lay down the very same pattern.
 */
export function partitionSignature(values: readonly FigureValue[]): string {
  return values.map((value) => values.indexOf(value)).join('')
}

/** Channels a board may vary, and how many at once. */
function pickChannels(width: number, rng: StudioRng, allowMarks: boolean): AttributeKey[] {
  // Quantity and size both eat cell space: a board that varies them at once has
  // to print three *small* shapes inside one grid square — legible on screen,
  // mush at 6×9 in print.
  const spatial: AttributeKey = rng.chance(0.5) ? 'count' : 'size'
  const pool: AttributeKey[] = ['shape', 'fill', spatial]
  if (allowMarks) pool.push('mark')
  return rng.sample(pool, Math.min(width, pool.length))
}

interface Plan {
  channels: AttributeKey[]
  tier3: boolean
  minTier: number
}

/**
 * What each tier asks of a board.
 *
 * Easy is two plain bands with at most one distribution rule — the standard
 * beginner form. Hard always carries a rule the reader has to reason about
 * rather than match: a logical combination or a quantity that adds up.
 */
function planFor(difficulty: Difficulty, rng: StudioRng, allowMarks: boolean): Plan {
  if (difficulty === 'easy') {
    return {
      channels: pickChannels(2, rng, allowMarks),
      tier3: false,
      minTier: RULE_TIER.rowConstant,
    }
  }
  if (difficulty === 'hard') {
    return {
      channels: pickChannels(rng.chance(0.35) ? 4 : 3, rng, allowMarks),
      tier3: true,
      minTier: RULE_TIER.logic,
    }
  }
  return {
    channels: pickChannels(rng.int(2, 3), rng, allowMarks),
    tier3: rng.chance(0.25),
    minTier: RULE_TIER.latin,
  }
}

/** How many distribution rules a tier may run at once. */
const LATIN_CAP: Record<Difficulty, number> = { easy: 1, medium: 3, hard: 4 }

function rollChannels(
  plan: Plan,
  difficulty: Difficulty,
  limits: Limits,
  rng: StudioRng,
): Channel[] | null {
  const built: Channel[] = []
  let latins = 0
  let tier3Used = false

  for (const attribute of plan.channels) {
    const allowed = kindsFor(attribute, limits, plan.tier3).filter((kind) => {
      if (kind === 'latin' && latins >= LATIN_CAP[difficulty]) return false
      return true
    })
    if (allowed.length === 0) return null

    // A tier that promises a reasoning rule has to place one: once the last
    // channel is up and none has landed, take whatever tier-3 kind is on offer.
    const remaining = plan.channels.length - built.length
    const forced =
      plan.tier3 && !tier3Used && remaining === 1
        ? allowed.filter((kind) => RULE_TIER[kind] >= RULE_TIER.logic)
        : []
    const kind = rng.pick(forced.length > 0 ? forced : allowed)

    const channel = buildChannel(attribute, kind, limits, rng)
    if (!channel) return null
    if (kind === 'latin') latins++
    if (RULE_TIER[kind] >= RULE_TIER.logic) tier3Used = true
    built.push(channel)
  }

  if (plan.tier3 && !tier3Used) return null
  return built
}

/**
 * Whether a finished board is worth printing.
 *
 * Three things have to hold, and the solver decides two of them: the eight
 * visible cells must lead to exactly one figure, that figure must be the one
 * the plan intended, and the reasoning must be as hard as the tier promised —
 * a "hard" board a reader can finish by matching rows is a mislabelled page.
 */
export function vetBoard(
  cells: readonly Figure[],
  channels: readonly Channel[],
  minTier: number,
): number | null {
  if (!cells.every(isPrintable)) return null

  const signatures = channels.map((channel) => partitionSignature(channel.values))
  if (new Set(signatures).size !== signatures.length) return null
  // A channel the plan ruled but that came out the same everywhere is not a
  // rule at all; it silently drops the board a tier.
  if (signatures.some((signature) => signature === '000000000')) return null

  const solved = solveBoard(cells)
  if (!solved) return null
  if (figureKey(solved.figure) !== figureKey(cells[8]!)) return null
  if (solved.tier < minTier) return null

  // The answer has to be a figure the board does not already show, or the
  // reader is copying a neighbour rather than completing a pattern.
  const answer = figureKey(cells[8]!)
  if (cells.slice(0, 8).some((cell) => figureKey(cell) === answer)) return null

  return solved.tier
}

/**
 * Crossed bands on shape and quantity — always usable, whatever the rolls.
 * Shape values are sampled distinct, so the answer can only match a cell that
 * shares both its row band and its column band, i.e. only itself.
 */
function fallbackBoard(difficulty: Difficulty, allowTriples: boolean, rng: StudioRng): Board {
  const limits = limitsFor(['shape', 'count', 'fill'], allowTriples)
  const channels: Channel[] = [
    bandChannel('shape', 'rowConstant', limits.shape, rng)!,
    bandChannel('fill', 'columnConstant', limits.fill, rng)!,
  ]
  if (difficulty !== 'easy') {
    const size = bandChannel('size', 'latin', limits.size, rng)
    if (size) channels.push(size)
  }
  const ruled = new Set(channels.map((channel) => channel.rule.attribute))
  const cells = assembleCells(channels, restingFigure(ruled, limits, rng))
  const solved = solveBoard(cells)
  return {
    cells,
    rules: channels.map((channel) => channel.rule),
    tier: solved?.tier ?? RULE_TIER.rowConstant,
  }
}

export interface BoardOptions {
  difficulty: Difficulty
  /** False on small trims, where three shapes in a cell stop being countable. */
  allowTriples?: boolean
  /**
   * False on small trims. An inner mark is drawn at a fifth of a figure's
   * width, so on a cell that already prints figures small it stops being a
   * dot and starts being a speck of toner.
   */
  allowMarks?: boolean
  /** Plan ids this page (or this seller) has printed lately — soft avoid. */
  avoidPlans?: ReadonlySet<string>
  /** Board ids already printed — hard avoid. See `boardId`. */
  avoidBoards?: ReadonlySet<string>
}

export function boardSignature(cells: readonly Figure[]): string {
  return cells.map(figureKey).join('/')
}

/**
 * Short, stable ids for a board and for its rule plan.
 *
 * The variety store trims what it remembers to 60 characters, and a board
 * signature is four times that — hashing is what lets a board be recognised
 * again in a later sitting instead of being remembered as a shared prefix.
 */
export function boardId(cells: readonly Figure[]): string {
  return hashStudioFingerprint(boardSignature(cells))
}

export function planId(rules: readonly AttributeRule[]): string {
  return hashStudioFingerprint(planLabel(rules))
}

/**
 * Draw one board.
 *
 * Rolls a plan, lays it out, and keeps it only if the solver agrees. Plans the
 * caller has printed recently are skipped while there is still budget to find
 * something else, so a book rotates through the rule vocabulary instead of
 * printing forty pages of "shape by row, paint by column".
 */
export function buildBoard(options: BoardOptions, rng: StudioRng): Board {
  const {
    difficulty,
    allowTriples = true,
    allowMarks = true,
    avoidPlans,
    avoidBoards,
  } = options
  // The last quarter of the budget stops being picky about variety: a printed
  // page that repeats a rule beats a page that failed to generate.
  const strictUntil = Math.floor(PLAN_ATTEMPTS * 0.75)

  for (let attempt = 0; attempt < PLAN_ATTEMPTS; attempt++) {
    const plan = planFor(difficulty, rng, allowMarks)
    const limits = limitsFor(plan.channels, allowTriples)
    const channels = rollChannels(plan, difficulty, limits, rng)
    if (!channels) continue

    const rules = channels.map((channel) => channel.rule)
    if (attempt < strictUntil && avoidPlans?.has(planId(rules))) continue

    const ruled = new Set(rules.map((rule) => rule.attribute))
    const cells = assembleCells(channels, restingFigure(ruled, limits, rng))
    if (avoidBoards?.has(boardId(cells))) continue

    const tier = vetBoard(cells, channels, plan.minTier)
    if (tier === null) continue
    return { cells, rules, tier }
  }

  return fallbackBoard(difficulty, allowTriples, rng)
}
