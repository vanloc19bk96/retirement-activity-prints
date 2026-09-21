import {
  ATTRIBUTES,
  RULE_TIER,
  type AttributeKey,
  type Figure,
  type FigureValue,
  type LogicOp,
} from './types'

/**
 * Reading the board the way the reader does.
 *
 * A printed matrix has exactly one defensible answer or it has none: a puzzle
 * whose grid supports two readings marks half of a correct audience wrong, and
 * that is what turns into refunds and a flagged KDP title. Rather than trusting
 * the generator's own intent, every board is handed back to this solver with
 * its ninth cell hidden, and is only printed when the solver — which knows
 * nothing about how the board was made — recovers the same figure.
 *
 * Two ideas make that cheap:
 *
 * 1. Channels are independent, so nine figures are five separate little
 *    puzzles of nine values each.
 * 2. Readers are parsimonious. They take the simplest rule that fits, so rule
 *    families are searched in tier order (see RULE_TIER) and the first tier
 *    that fits the eight visible values settles the answer. A cleverer rule
 *    that also fits never gets a vote, and a *simpler* rule that fits and
 *    disagrees is the definition of an ambiguous board.
 */

export interface ChannelSolution {
  value: FigureValue
  /** Tier of the rule family that settled it — 0 constant … 3 logic. */
  tier: number
}

/** Eight visible values, row-major; the ninth cell is the hole. */
export type VisibleChannel = readonly FigureValue[]

const at = (values: VisibleChannel, r: number, c: number): FigureValue => values[r * 3 + c]!

function constantFit(values: VisibleChannel): FigureValue[] {
  const first = values[0]!
  return values.every((value) => value === first) ? [first] : []
}

function rowConstantFit(values: VisibleChannel): FigureValue[] {
  for (const r of [0, 1]) {
    if (at(values, r, 0) !== at(values, r, 1) || at(values, r, 1) !== at(values, r, 2)) return []
  }
  return at(values, 2, 0) === at(values, 2, 1) ? [at(values, 2, 0)] : []
}

function columnConstantFit(values: VisibleChannel): FigureValue[] {
  for (const c of [0, 1]) {
    if (at(values, 0, c) !== at(values, 1, c) || at(values, 1, c) !== at(values, 2, c)) return []
  }
  return at(values, 0, 2) === at(values, 1, 2) ? [at(values, 0, 2)] : []
}

/**
 * "Each of three things once in every row and column."
 *
 * The board must spend exactly three symbols over nine cells, so the eight
 * visible ones show two symbols three times and one symbol twice — and the one
 * that is a cell short is the answer. Without the three-symbol requirement a
 * seven-shape domain would let any unused shape complete the square, and the
 * grid would have five right answers.
 */
function latinFit(values: VisibleChannel): FigureValue[] {
  const tally = new Map<FigureValue, number>()
  for (const value of values) tally.set(value, (tally.get(value) ?? 0) + 1)
  if (tally.size !== 3) return []

  let candidate: FigureValue | null = null
  for (const [value, count] of tally) {
    if (count === 3) continue
    if (count !== 2 || candidate !== null) return []
    candidate = value
  }
  if (candidate === null) return []

  const full = [...values, candidate]
  for (let i = 0; i < 3; i++) {
    const row = new Set([full[i * 3], full[i * 3 + 1], full[i * 3 + 2]])
    const column = new Set([full[i], full[i + 3], full[i + 6]])
    if (row.size !== 3 || column.size !== 3) return []
  }
  return [candidate]
}

const LOGIC_OPS: LogicOp[] = ['xor', 'and', 'or']

function applyOp(op: LogicOp, a: boolean, b: boolean): boolean {
  if (op === 'xor') return a !== b
  if (op === 'and') return a && b
  return a || b
}

/**
 * Third-cell-from-the-other-two, on a channel that only ever shows two values.
 *
 * Both polarities are tried, because nothing on the page says which of the two
 * values is the "on" one — and a board that reads one way round and differently
 * the other way round is ambiguous, whatever the generator meant. Lines run
 * down columns as readily as along rows.
 */
function logicFits(values: VisibleChannel): FigureValue[] {
  const distinct = [...new Set(values)]
  if (distinct.length !== 2) return []

  const out: FigureValue[] = []
  for (const poles of [distinct, [distinct[1]!, distinct[0]!]]) {
    const on = (value: FigureValue): boolean => value === poles[1]
    const valueOf = (flag: boolean): FigureValue => (flag ? poles[1]! : poles[0]!)

    for (const op of LOGIC_OPS) {
      // Along rows: the two complete rows have to hold before the third speaks.
      const rowsHold = [0, 1].every(
        (r) => on(at(values, r, 2)) === applyOp(op, on(at(values, r, 0)), on(at(values, r, 1))),
      )
      if (rowsHold) {
        out.push(valueOf(applyOp(op, on(at(values, 2, 0)), on(at(values, 2, 1)))))
      }
      const columnsHold = [0, 1].every(
        (c) => on(at(values, 2, c)) === applyOp(op, on(at(values, 0, c)), on(at(values, 1, c))),
      )
      if (columnsHold) {
        out.push(valueOf(applyOp(op, on(at(values, 0, 2)), on(at(values, 1, 2)))))
      }
    }
  }
  return out
}

/** Quantities that add along a line: 1 + 2 → 3. Counts only. */
function sumFits(values: VisibleChannel): FigureValue[] {
  const asNumber = (value: FigureValue): number => (typeof value === 'number' ? value : NaN)
  if (values.some((value) => !Number.isFinite(asNumber(value)))) return []

  const out: FigureValue[] = []
  const rowsHold = [0, 1].every(
    (r) => asNumber(at(values, r, 0)) + asNumber(at(values, r, 1)) === asNumber(at(values, r, 2)),
  )
  if (rowsHold) {
    out.push((asNumber(at(values, 2, 0)) + asNumber(at(values, 2, 1))) as FigureValue)
  }

  const columnsHold = [0, 1].every(
    (c) => asNumber(at(values, 0, c)) + asNumber(at(values, 1, c)) === asNumber(at(values, 2, c)),
  )
  if (columnsHold) {
    out.push((asNumber(at(values, 0, 2)) + asNumber(at(values, 1, 2))) as FigureValue)
  }

  return out
}

/** Rule families in the order a reader reaches for them. */
const TIERS: { tier: number; fit: (values: VisibleChannel) => FigureValue[] }[] = [
  { tier: RULE_TIER.constant, fit: constantFit },
  {
    tier: RULE_TIER.rowConstant,
    fit: (values) => [...rowConstantFit(values), ...columnConstantFit(values)],
  },
  { tier: RULE_TIER.latin, fit: latinFit },
  { tier: RULE_TIER.logic, fit: (values) => [...logicFits(values), ...sumFits(values)] },
]

/**
 * What the ninth value has to be, or `null` when the eight visible ones do not
 * settle it — no family fits, or the simplest family that fits cannot make up
 * its mind.
 */
export function solveChannel(values: VisibleChannel): ChannelSolution | null {
  if (values.length !== 8) return null
  for (const { tier, fit } of TIERS) {
    const predictions = fit(values)
    if (predictions.length === 0) continue
    const first = predictions[0]!
    if (predictions.some((value) => value !== first)) return null
    return { value: first, tier }
  }
  return null
}

export interface BoardSolution {
  figure: Figure
  /** Hardest channel on the board — how much work the puzzle really asks for. */
  tier: number
}

/**
 * Solve the missing cell of a board from its eight visible ones.
 *
 * `cells` may be the full nine — the ninth is ignored, never consulted, which
 * is the whole point: the answer has to be recoverable from the page alone.
 */
export function solveBoard(cells: readonly Figure[]): BoardSolution | null {
  const visible = cells.slice(0, 8)
  if (visible.length !== 8) return null

  const figure: Partial<Figure> = {}
  let tier = 0
  for (const attribute of ATTRIBUTES) {
    const solved = solveChannel(visible.map((cell) => cell[attribute]))
    if (!solved) return null
    Object.assign(figure, { [attribute]: solved.value })
    tier = Math.max(tier, solved.tier)
  }
  return { figure: figure as Figure, tier }
}

/** Channel-by-channel report — used by the tests and by board vetting. */
export function solveChannels(
  cells: readonly Figure[],
): Record<AttributeKey, ChannelSolution | null> {
  const visible = cells.slice(0, 8)
  const out = {} as Record<AttributeKey, ChannelSolution | null>
  for (const attribute of ATTRIBUTES) {
    out[attribute] = solveChannel(visible.map((cell) => cell[attribute]))
  }
  return out
}
