import type { StudioRng } from '../studio-rng'
import { sizeContrast } from './shapes'
import {
  ATTRIBUTES,
  DOMAINS,
  isPrintable,
  withAttribute,
  type AttributeKey,
  type AttributeRule,
  type CountKind,
  type Difficulty,
  type Figure,
} from './types'

interface Variant {
  figure: Figure
  changed: AttributeKey[]
}

/**
 * How much two options may look alike before a reader has to guess between
 * them. Only figures that agree on shape, quantity, paint and mark ever get
 * this far, so the number is a straight width ratio: 0.82 means the smaller of
 * the pair has to print at most four fifths as wide as the larger.
 */
const MAX_TWIN_SIMILARITY = 0.82

/**
 * How many *near misses* — options differing from the answer by a single ruled
 * attribute — a tier is allowed. They are the options a reader has to actually
 * check the rule against, so this is the difficulty dial that matters most.
 */
function nearBudget(difficulty: Difficulty, wanted: number): number {
  if (difficulty === 'easy') return 2
  if (difficulty === 'medium') return 3
  return wanted
}

/**
 * Whether two options are far enough apart to share one strip.
 *
 * A strip that prints the same picture in two boxes has no right answer: a
 * reader who reasons perfectly still has to toss a coin, and whichever box the
 * key names, half of them get marked wrong. Differing on shape, quantity, paint
 * or inner mark always shows at print size; differing on size alone only shows
 * if the two sizes sit far enough apart on the ladder.
 */
export function isDistinguishable(a: Figure, b: Figure): boolean {
  if (a.shape !== b.shape || a.count !== b.count || a.fill !== b.fill || a.mark !== b.mark) {
    return true
  }
  if (a.size === b.size) return false
  return sizeContrast(a.size, b.size) <= MAX_TWIN_SIMILARITY
}

/** Every figure the board can print, in a stable order — the last-resort filler. */
function allFigures(maxCount: CountKind): Figure[] {
  const out: Figure[] = []
  for (const shape of DOMAINS.shape) {
    for (const count of DOMAINS.count) {
      if ((count as CountKind) > maxCount) continue
      for (const fill of DOMAINS.fill) {
        for (const size of DOMAINS.size) {
          for (const mark of DOMAINS.mark) {
            const figure = { shape, count, fill, size, mark } as Figure
            if (isPrintable(figure)) out.push(figure)
          }
        }
      }
    }
  }
  return out
}

/**
 * Deal the candidates out one axis at a time.
 *
 * Taken in bulk, a shuffle happily spends four of the five decoy slots on the
 * same attribute — three wrong quantities and a wrong paint — and the strip
 * stops testing the board's other rules at all. Round-robin over the attribute
 * each candidate changes puts one of every kind on the page before it doubles
 * up on any.
 */
function byAxis(variants: Variant[], rng: StudioRng): Variant[] {
  const lanes = new Map<string, Variant[]>()
  for (const variant of variants) {
    const axis = [...variant.changed].sort().join('+')
    const lane = lanes.get(axis)
    if (lane) lane.push(variant)
    else lanes.set(axis, [variant])
  }

  const dealt = rng.shuffle([...lanes.values()]).map((lane) => rng.shuffle(lane))
  const out: Variant[] = []
  const depth = Math.max(0, ...dealt.map((lane) => lane.length))
  for (let i = 0; i < depth; i++) {
    for (const lane of dealt) {
      const variant = lane[i]
      if (variant) out.push(variant)
    }
  }
  return out
}

/** Values a rule actually printed on the board — the ones a decoy can borrow. */
function ruleValues(rule: AttributeRule): Figure[AttributeKey][] {
  if (rule.values) return rule.values
  if (rule.poles) return rule.poles
  // `sum` prints every quantity the domain has.
  return DOMAINS[rule.attribute]
}

/**
 * Answer plus decoys, shuffled, with the answer's landing index.
 *
 * Decoys are always real figures one or two edits away from the answer, drawn
 * first from the values the board's own rules use — a decoy built from values
 * that appear nowhere on the page is dismissed at a glance and wastes a slot.
 * No two options may print alike; see `isDistinguishable`.
 */
export function buildOptions(options: {
  answer: Figure
  /** The nine drawn cells — they fix the scale every option is printed at. */
  cells: Figure[]
  rules: AttributeRule[]
  optionCount: number
  difficulty: Difficulty
  rng: StudioRng
}): { options: Figure[]; correctIndex: number } {
  const { answer, cells, rules, optionCount, difficulty, rng } = options
  const wanted = Math.max(1, optionCount - 1)
  const ruled = new Set(rules.map((rule) => rule.attribute))
  /**
   * Every figure on the puzzle is scaled to fit the busiest cell, so an option
   * carrying more shapes than any cell does would shrink the whole page around
   * itself. Holding the filler to what the board already prints keeps the scale
   * a property of the grid.
   */
  const maxCount = Math.max(...cells.map((cell) => cell.count)) as CountKind

  /**
   * The board hands its rules over exactly as it drew them: the attributes in
   * shuffled order, and each rule's values in band order — and a latin band
   * reaches the same nine cells from any of six value orderings. Everything
   * below feeds a shuffle, so either would leak into the finished strip and
   * give one grid two different sets of choices. The batch duplicate check
   * compares whole pages, so it would wave the second one through. Sorting both
   * makes the strip a function of the grid alone.
   */
  const orderedRules = [...rules]
    .sort((a, b) => ATTRIBUTES.indexOf(a.attribute) - ATTRIBUTES.indexOf(b.attribute))
    .map((rule) => ({
      rule,
      values: [...ruleValues(rule)].sort(
        (a, b) => DOMAINS[rule.attribute].indexOf(a) - DOMAINS[rule.attribute].indexOf(b),
      ),
    }))

  const near: Variant[] = []
  for (const { rule, values } of orderedRules) {
    for (const value of values) {
      if (value === answer[rule.attribute]) continue
      near.push({
        figure: withAttribute(answer, rule.attribute, value),
        changed: [rule.attribute],
      })
    }
  }

  const wide: Variant[] = []
  for (const attribute of ATTRIBUTES) {
    if (ruled.has(attribute)) continue
    /**
     * Quantity is off limits here. Every figure on the puzzle is scaled to fit
     * the busiest cell, so a lone three-shape decoy on a board that otherwise
     * prints one shape per cell would shrink the entire page to a third size.
     *
     * Size used to be off limits too, and for a real reason: while the answer
     * boxes were drawn smaller than the grid cells, nothing on the page let a
     * reader compare a figure in the grid with a figure in a box, so a decoy
     * that differed by size alone was a second right answer. Boxes and cells
     * are now one size (see `itemMetrics`), so a constant size is as readable
     * as a constant shape, and a wrong one is as plainly wrong.
     */
    if (attribute === 'count') continue
    for (const value of DOMAINS[attribute]) {
      if (value === answer[attribute]) continue
      wide.push({ figure: withAttribute(answer, attribute, value), changed: [attribute] })
    }
  }

  // Two edits at once: unmistakably wrong, and what fills an easy tier's page.
  const far: Variant[] = []
  for (const a of near) {
    for (const b of [...near, ...wide]) {
      if (a.changed[0] === b.changed[0]) continue
      far.push({
        figure: withAttribute(a.figure, b.changed[0]!, b.figure[b.changed[0]!]),
        changed: [a.changed[0]!, b.changed[0]!],
      })
    }
  }

  const budget = nearBudget(difficulty, wanted)
  const nearDealt = byAxis(near, rng)
  const ordered: Variant[] = [
    ...nearDealt.slice(0, budget),
    ...byAxis(wide, rng),
    ...byAxis(far, rng),
    ...nearDealt.slice(budget),
  ]

  /**
   * How many decoys may hang off one axis.
   *
   * A rule the grid states can carry as many near misses as the tier allows —
   * checking them against the rule is the exercise. A channel the grid holds
   * constant cannot: three choices that differ from the key by nothing but
   * their size turn a strip about shapes into a strip about size, and the
   * reader has to keep glancing back to a grid that never mentioned it. One
   * such reminder is a fair distractor; three is a different puzzle.
   */
  const laneKey = (changed: AttributeKey[]): string => [...changed].sort().join('+')
  const laneCap = (changed: AttributeKey[]): number =>
    changed.length === 1 && !ruled.has(changed[0]!) ? 1 : Number.POSITIVE_INFINITY
  const lanes = new Map<string, number>()

  const changedFrom = (figure: Figure): AttributeKey[] =>
    ATTRIBUTES.filter((attribute) => figure[attribute] !== answer[attribute])

  const filler: Variant[] = rng
    .shuffle(allFigures(maxCount))
    .map((figure) => ({ figure, changed: changedFrom(figure) }))

  const kept: Figure[] = [answer]
  const decoys: Figure[] = []
  for (const { figure, changed } of [...ordered, ...filler]) {
    if (decoys.length >= wanted) break
    if (figure.count > maxCount) continue
    // A decoy the printer cannot render honestly — a mark lost inside a solid
    // shape — would reach the page as a duplicate of some other choice.
    if (!isPrintable(figure)) continue
    const key = laneKey(changed)
    if ((lanes.get(key) ?? 0) >= laneCap(changed)) continue
    if (!kept.every((seen) => isDistinguishable(seen, figure))) continue
    lanes.set(key, (lanes.get(key) ?? 0) + 1)
    kept.push(figure)
    decoys.push(figure)
  }

  // A strip has to be full before it is balanced: if the caps above starved it
  // — a board with almost nothing to vary — take whatever still prints apart.
  if (decoys.length < wanted) {
    for (const { figure } of [...ordered, ...filler]) {
      if (decoys.length >= wanted) break
      if (figure.count > maxCount || !isPrintable(figure)) continue
      if (!kept.every((seen) => isDistinguishable(seen, figure))) continue
      kept.push(figure)
      decoys.push(figure)
    }
  }

  const correctIndex = rng.int(0, decoys.length)
  const list = [...decoys]
  list.splice(correctIndex, 0, answer)
  return { options: list, correctIndex }
}
