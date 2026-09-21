/**
 * The figure model.
 *
 * Every puzzle is built from independent visual *channels*. A channel is one
 * thing a reader can name out loud — "the shape", "how many", "how it is
 * painted" — and the whole generator rests on them being independent: a rule
 * governs exactly one channel, and the missing cell is solved one channel at a
 * time. See `solver.ts`.
 */
export type ShapeKind =
  | 'circle'
  | 'square'
  | 'triangle'
  | 'diamond'
  | 'hexagon'
  | 'pentagon'
  | 'star'
export type FillKind = 'hollow' | 'shaded' | 'solid'
export type SizeKind = 'small' | 'medium' | 'large'
export type CountKind = 1 | 2 | 3
/** A small glyph struck inside the outline. `x` is two crossed strokes. */
export type MarkKind = 'none' | 'dot' | 'bar' | 'x'

/** One drawn cell: N copies of a shape, at one size, one paint, one inner mark. */
export interface Figure {
  shape: ShapeKind
  count: CountKind
  fill: FillKind
  size: SizeKind
  mark: MarkKind
}

export type AttributeKey = keyof Figure
export type FigureValue = Figure[AttributeKey]

export type Axis = 'row' | 'column'
export type LogicOp = 'xor' | 'and' | 'or'

/**
 * How one channel is spread over the 3×3 board, ordered by how hard the
 * reader has to work — `RULE_TIER` below turns that into a number.
 *
 * - `constant`       — one value everywhere (an unruled channel)
 * - `rowConstant`    — one value per row, so it never changes along a row
 * - `columnConstant` — one value per column
 * - `latin`          — each of three values exactly once per row *and* column
 * - `logic`          — a two-valued channel where the third cell of every line
 *                      is the first two combined: `xor`, `and` or `or`
 * - `sum`            — quantities that add along every line: 1 + 2 → 3
 */
export type RuleKind =
  | 'constant'
  | 'rowConstant'
  | 'columnConstant'
  | 'latin'
  | 'logic'
  | 'sum'

/**
 * Reading difficulty of each rule family, and the search order the solver
 * uses. A reader reaches for the simplest explanation that fits what is on the
 * page, so a board is only sound when its intended rule is *also* the simplest
 * one that fits. Everything in `solver.ts` follows from that.
 */
export const RULE_TIER: Record<RuleKind, number> = {
  constant: 0,
  rowConstant: 1,
  columnConstant: 1,
  latin: 2,
  logic: 3,
  sum: 3,
}

export interface AttributeRule {
  attribute: AttributeKey
  kind: RuleKind
  /** Band/latin families: exactly three values, indexed by the rule's band. */
  values?: FigureValue[]
  /** Value index per cell. Only set (and only meaningful) for `latin`. */
  square?: number[][]
  /** `logic` and `sum`: the line the equation runs along. */
  axis?: Axis
  /** `logic`: how the first two cells of a line combine into the third. */
  op?: LogicOp
  /** `logic`: the channel's two poles, `[off, on]`. */
  poles?: [FigureValue, FigureValue]
}

export interface MatrixItem {
  /** Nine figures, row-major. The last is the one the reader has to supply. */
  cells: Figure[]
  answer: Figure
  options: Figure[]
  correctIndex: number
  rules: AttributeRule[]
  /** Hardest rule family on the board — what the page actually asks for. */
  tier: number
}

export type Difficulty = 'easy' | 'medium' | 'hard'

export const SHAPES: ShapeKind[] = [
  'circle',
  'square',
  'triangle',
  'diamond',
  'hexagon',
  'pentagon',
  'star',
]
export const FILLS: FillKind[] = ['hollow', 'shaded', 'solid']
export const SIZE_STEPS: SizeKind[] = ['small', 'medium', 'large']
export const COUNTS: CountKind[] = [1, 2, 3]
export const MARKS: MarkKind[] = ['none', 'dot', 'bar', 'x']

export const ATTRIBUTES: AttributeKey[] = ['shape', 'count', 'fill', 'size', 'mark']

export const DOMAINS: Record<AttributeKey, FigureValue[]> = {
  shape: SHAPES,
  count: COUNTS,
  fill: FILLS,
  size: SIZE_STEPS,
  mark: MARKS,
}

/**
 * Shapes with enough clear middle to carry an inner mark at print size. A dot
 * inside a small triangle or a five-pointed star is a smudge on paper.
 */
export const ROOMY_SHAPES: ShapeKind[] = ['circle', 'square', 'hexagon', 'pentagon', 'diamond']

/**
 * Whether a figure can be printed as specified.
 *
 * A mark only exists as a *hole* in the ink around it: struck into a solid
 * shape it disappears, and shrunk to a small outline it closes up. Boards that
 * would need one are rejected at the planning stage, not drawn and hoped for.
 */
export function isPrintable(figure: Figure): boolean {
  if (figure.mark === 'none') return true
  if (figure.fill === 'solid') return false
  if (figure.size === 'small') return false
  if (figure.count > 2) return false
  return ROOMY_SHAPES.includes(figure.shape)
}

/** Object spread cannot narrow a union to one key, so the cast lives here. */
export function withAttribute(
  figure: Figure,
  attribute: AttributeKey,
  value: FigureValue,
): Figure {
  return { ...figure, [attribute]: value } as Figure
}

export function figureKey(figure: Figure): string {
  return `${figure.shape}|${figure.count}|${figure.fill}|${figure.size}|${figure.mark}`
}

export function sameFigure(a: Figure, b: Figure): boolean {
  return figureKey(a) === figureKey(b)
}

/** Stable, human-readable name for one rule — the unit of variety tracking. */
export function ruleLabel(rule: AttributeRule): string {
  if (rule.kind === 'logic') return `${rule.attribute}:${rule.op}-${rule.axis}`
  if (rule.kind === 'sum') return `${rule.attribute}:sum-${rule.axis}`
  return `${rule.attribute}:${rule.kind}`
}

/** The board's rule set as one comparable string, order-independent. */
export function planLabel(rules: readonly AttributeRule[]): string {
  return rules.map(ruleLabel).sort().join('+')
}
