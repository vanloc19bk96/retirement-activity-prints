import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import { YS_LEGEND_PAIR, YS_LEGEND_TWINS, YS_SALES, ysLevelSpec, ysSignText, type YsBookEntry, type YsLevel, type YsSale } from './content'
import { YS_PART_KEY, YS_SHADE_FILL, ysLegendBox, ysSignBox } from './draw'
import { YS_DIGIT_MIN, YS_SIGN_GAP_MIN, YS_SIGN_MIN, YS_SIGN_PAD_X, ysDigitSpec, ysSignSpec, ysTextWidth, type YsPlan } from './layout'
import { ysHardSteps, ysShareFits, ysSignature, type YsBuilt } from './puzzle'
import { YS_SHADED, isYsSolution, solveYs, ysShadeText, ysWellFormed } from './solver'

export interface KdpPreflightResult {
  ok: boolean
  errors: string[]
}

/** Air kept round a number inside its square, each side, px. */
export const YS_DIGIT_AIR = 6

function inside(inner: Box, outer: Box): boolean {
  return (
    inner.left >= outer.left - 0.5 &&
    inner.top >= outer.top - 0.5 &&
    inner.left + inner.width <= outer.left + outer.width + 0.5 &&
    inner.top + inner.height <= outer.top + outer.height + 0.5
  )
}

/**
 * The last gate before a Yard Sale page is accepted.
 *
 * A grid with two answers, or one that needs a guess, is a puzzle the
 * reader cannot finish honestly — and they blame themselves. So the grid is
 * proven, not trusted: the answer must keep every rule (no white twins in a
 * line, only repeats shaded, never two shaded side by side, the white
 * squares one piece); the level's own steps, used the way a reader would,
 * must finish the grid on exactly that answer (which also proves it is the
 * only one) — and the easier steps alone must not, where the level asks for
 * more; and the answer shades the level's share. Then the page: squares at
 * least the level's floor, numbers at least 16 pt with air round them, the
 * sale's name inside its sign, everything on the printable panel with air
 * between; and not a sale or a grid the book already uses.
 */
export function runYsKdpPreflight(options: {
  built: YsBuilt
  plan: YsPlan
  level: YsLevel
  sale: YsSale
  panel: Box
  font: string
  book?: readonly YsBookEntry[]
}): KdpPreflightResult {
  const { built, plan, level, sale, panel, font, book = [] } = options
  const errors: string[] = []
  const spec = ysLevelSpec(level)
  const { puzzle, shade } = built

  // The grid.
  if (puzzle.size !== spec.size) errors.push(`The grid is not ${spec.gridLabel}.`)
  if (!ysWellFormed(puzzle)) errors.push('The grid is not well formed.')
  else if (!isYsSolution(puzzle, shade)) errors.push('The answer breaks a rule.')
  else {
    const solve = solveYs(puzzle, spec.rules)
    if (!solve.solved || ysShadeText(solve.state) !== ysShadeText(shade)) errors.push('The grid cannot be finished by logic alone to its one answer.')
    else if ((spec.beyond && solveYs(puzzle, spec.beyond).solved) || ysHardSteps(solve.tally, spec.rules) < spec.minHard) errors.push('The grid is too easy for this level.')
  }
  if (!ysShareFits(spec.size, shade, spec.shaded)) errors.push('The answer does not shade the level’s share of squares.')
  if (ysSignature(puzzle) !== built.signature) errors.push('The grid’s fingerprint does not match it.')

  // The page.
  if (plan.size !== spec.size) errors.push('The page was planned for another level.')
  if (plan.cell < Math.ceil(spec.minCell) - 1e-6) errors.push('The squares print smaller than this level allows.')
  if (plan.digitSize < YS_DIGIT_MIN - 1e-6) errors.push('The numbers print below 16 pt.')
  if (plan.signSize < YS_SIGN_MIN - 1e-6) errors.push('The sign prints below 14 pt.')
  const widestNumber = Math.max(...Array.from({ length: spec.size }, (_, k) => ysTextWidth(String(k + 1), plan.digitSize, ysDigitSpec())))
  if (plan.cell - Math.max(widestNumber, plan.digitSize) < YS_DIGIT_AIR * 2) errors.push('A number crowds its square.')
  const side = spec.size * plan.cell
  if (Math.abs(plan.grid.width - side) > 0.5 || Math.abs(plan.grid.height - side) > 0.5) errors.push('The grid is not the level’s size.')
  const sign = ysSignBox(plan, sale, font)
  if (ysTextWidth(ysSignText(sale, plan.signLines), plan.signSize, ysSignSpec(font)) > sign.width - YS_SIGN_PAD_X + 0.5) errors.push(`“${sale.name}” does not fit on its sign.`)
  const legend = ysLegendBox(plan, font)
  for (const [box, what] of [
    [sign, 'The sign'],
    [legend, 'The legend'],
    [plan.grid, 'The grid'],
  ] as const) {
    if (!inside(box, panel)) errors.push(`${what} runs past the printable area of this page.`)
  }
  if (sign.top + sign.height + YS_SIGN_GAP_MIN > plan.grid.top + 0.5) errors.push('The sign crowds the grid.')
  if (legend.top < plan.grid.top + plan.grid.height + 12) errors.push('The legend crowds the grid.')

  // The book.
  const used = new Set(book.map((e) => e.sale))
  if (used.has(sale.id) && YS_SALES.some((s) => !used.has(s.id))) errors.push(`The book already uses ${sale.name} while other sales wait.`)
  if (book.some((e) => e.signature === built.signature)) errors.push('The book already prints this grid.')

  return { ok: errors.length === 0, errors }
}

function walk(obj: StudioFabricObject, visit: (o: StudioFabricObject) => void): void {
  visit(obj)
  for (const child of obj.objects ?? []) walk(child, visit)
}

/**
 * The drawn page, checked against the grid it was drawn from: its own
 * number in every square and showing, the answer's shading waiting hidden
 * on exactly its shaded squares, the lines and the frame whole, the sign
 * naming the sale, and the legend showing 4 4 with one 4 shaded and two
 * shaded squares side by side crossed out.
 */
export function checkYsDrawnPage(options: { puzzle: StudioFabricObject; built: YsBuilt; sale: YsSale }): string[] {
  const { puzzle: group, built, sale } = options
  const { puzzle, shade } = built
  const n = puzzle.size
  const errors: string[] = []
  const numbers = new Map<number, number>()
  const shaded = new Set<number>()
  let rules = 0
  let frame = 0
  let sign: StudioFabricObject | null = null
  const legend = new Map<string, string[]>()
  walk(group, (o) => {
    const role = String(o.data?.[YS_PART_KEY] ?? '')
    const at = Number(o.data?.row) * n + Number(o.data?.col)
    if (role === 'number') {
      if (numbers.has(at)) errors.push('A square holds two numbers.')
      numbers.set(at, Number(o.text))
      if (o.visible === false || o.studioRole !== 'prompt') errors.push('A number is hidden.')
    } else if (role === 'answer-shade') {
      if (shaded.has(at)) errors.push('A square is shaded twice.')
      shaded.add(at)
      if (o.visible !== false || o.studioRole !== 'answer') errors.push('The answer shows on the puzzle page.')
      if (o.fill !== YS_SHADE_FILL) errors.push('A shaded square is not gray.')
    } else if (role === 'rule') rules++
    else if (role === 'frame') frame++
    else if (role === 'sign-text') sign = o
    else if (role.startsWith('legend-') && o.data?.entry) {
      const entry = String(o.data.entry)
      const item = role === 'legend-number' ? `number:${o.data?.k}:${o.text}` : role === 'legend-shade' ? `shade:${o.data?.k}` : role
      legend.set(entry, [...(legend.get(entry) ?? []), item])
    }
  })

  for (let i = 0; i < n * n; i++) {
    if (numbers.get(i) !== puzzle.numbers[i]) errors.push('A square shows the wrong number.')
    if ((shade[i] === YS_SHADED) !== shaded.has(i)) errors.push('The answer’s shading is missing or wrong.')
  }
  if (numbers.size !== n * n) errors.push('A number is drawn outside the grid.')
  if (rules !== 2 * (n + 1)) errors.push('The lines between squares are not all drawn.')
  if (frame !== 4) errors.push('The grid’s frame is not drawn.')

  const signed = sign as StudioFabricObject | null
  if (!signed || String(signed.text).replace('\n', ' ') !== ysSignText(sale)) errors.push('The sign does not name the sale.')
  const repeat = legend.get('repeat') ?? []
  const touch = legend.get('touch') ?? []
  const shows = (items: string[], values: readonly (number | null)[], shades: number[]) =>
    values.every((v, k) => (v === null ? !items.some((p) => p.startsWith(`number:${k}:`)) : items.includes(`number:${k}:${v}`))) && items.filter((p) => p.startsWith('shade:')).sort().join() === shades.map((k) => `shade:${k}`).join()
  if (!shows(repeat, YS_LEGEND_PAIR, [0])) errors.push('The legend does not show a repeat with one shaded.')
  if (!shows(touch, YS_LEGEND_TWINS, [0, 1]) || !touch.includes('legend-cross')) errors.push('The legend does not cross out two shaded squares side by side.')
  return [...new Set(errors)]
}
