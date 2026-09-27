import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import { STONES_WALKS, stonesLevelSpec, stonesSignText, type StonesBookEntry, type StonesLevel, type StonesWalk } from './content'
import { STONES_PART_KEY, stonesLegendBox, stonesSignBox } from './draw'
import { STONES_DIGIT_MIN, STONES_SIGN_GAP_MIN, STONES_SIGN_MIN, STONES_SIGN_PAD_X, stonesSignSpec, stonesTextWidth, type StonesPlan } from './layout'
import { stonesClueCount, stonesClueRange, stonesEndsApart, stonesLongestRun, stonesSignature, type StonesBuilt } from './puzzle'
import { STONES_BLANK, isStonesSolution, solveStones, stonesAnswerKey, stonesPathOrder, stonesWellFormed } from './solver'

export interface KdpPreflightResult {
  ok: boolean
  errors: string[]
}

function inside(inner: Box, outer: Box): boolean {
  return (
    inner.left >= outer.left - 0.5 &&
    inner.top >= outer.top - 0.5 &&
    inner.left + inner.width <= outer.left + outer.width + 0.5 &&
    inner.top + inner.height <= outer.top + outer.height + 0.5
  )
}

/**
 * The last gate before a Stepping Stones page is accepted.
 *
 * A path with two answers, or one that needs a guess, is a puzzle the reader
 * cannot finish honestly — and they blame themselves. So the path is proven,
 * not trusted: the answer must be one walk through every stone that keeps
 * every printed number, the start and the finish printed a fair way apart, a fair share of
 * numbers on the page; and the level's own steps, used the way a reader
 * would, must finish the path on exactly that walk (which also proves it is
 * the only one) — and the easier steps alone must not, where the level asks
 * for more. Then the page: stones at least the level's floor, numbers at
 * least 16 pt, the walk's name inside its signpost, everything on the
 * printable panel with air between; and not a walk the book already uses
 * while others wait, nor a path the book already prints.
 */
export function runStonesKdpPreflight(options: {
  built: StonesBuilt
  plan: StonesPlan
  level: StonesLevel
  walk: StonesWalk
  panel: Box
  font: string
  book?: readonly StonesBookEntry[]
}): KdpPreflightResult {
  const { built, plan, level, walk, panel, font, book = [] } = options
  const errors: string[] = []
  const spec = stonesLevelSpec(level)
  const { puzzle, values } = built
  const n = puzzle.size
  const N = n * n

  // The path.
  if (n !== spec.size) errors.push(`The path is not ${spec.gridLabel}.`)
  if (!stonesWellFormed(puzzle)) errors.push('The path has a stone that is neither blank nor a number from 1 to the last, or a number twice.')
  else {
    if (!isStonesSolution(puzzle, values)) errors.push('The answer is not one walk through every stone that keeps the printed numbers.')
    else {
      const [fewest, most] = stonesClueRange(spec)
      const count = stonesClueCount(puzzle)
      if (count < fewest || count > most) errors.push('The page prints too few or too many numbers for this level.')
      if (!puzzle.clues.includes(1) || !puzzle.clues.includes(N)) errors.push('The start or the finish is not printed.')
      const order = stonesPathOrder(n, values) ?? []
      if (stonesLongestRun(order) > spec.maxRun) errors.push('The walk runs too long in a straight line.')
      if (stonesEndsApart(n, order) < Math.ceil(n / 2)) errors.push('The start and the finish lie too close together.')
      const solve = solveStones(puzzle, spec.rules)
      if (!solve.solved || stonesAnswerKey(solve.values) !== stonesAnswerKey(values)) errors.push('The path cannot be finished by logic alone to its one answer.')
      else if (spec.beyond && solveStones(puzzle, spec.beyond).solved) errors.push('The path is too easy for this level.')
    }
    if (stonesSignature(puzzle) !== built.signature) errors.push('The path’s fingerprint does not match it.')
  }

  // The page.
  if (plan.size !== spec.size) errors.push('The page was planned for another level.')
  if (plan.cell < Math.ceil(spec.minCell) - 1e-6) errors.push('The stones print smaller than this level allows.')
  if (plan.digitSize < STONES_DIGIT_MIN - 1e-6) errors.push('The numbers print below 16 pt.')
  if (plan.signSize < STONES_SIGN_MIN - 1e-6) errors.push('The signpost prints below 14 pt.')
  const side = spec.size * plan.cell
  if (Math.abs(plan.grid.width - side) > 0.5 || Math.abs(plan.grid.height - side) > 0.5) errors.push('The path is not the level’s size.')
  if (plan.stone + plan.gap !== plan.cell || plan.gap <= 0) errors.push('The stones do not sit on their pitch.')
  const sign = stonesSignBox(plan, walk, font)
  if (stonesTextWidth(stonesSignText(walk, plan.signLines), plan.signSize, stonesSignSpec(font)) > sign.width - STONES_SIGN_PAD_X + 0.5) errors.push(`“${walk.name}” does not fit on its signpost.`)
  const legend = stonesLegendBox(plan, font)
  for (const [box, what] of [
    [sign, 'The signpost'],
    [legend, 'The legend'],
    [plan.grid, 'The path'],
  ] as const) {
    if (!inside(box, panel)) errors.push(`${what} runs past the printable area of this page.`)
  }
  if (sign.top + sign.height + STONES_SIGN_GAP_MIN > plan.grid.top + 0.5) errors.push('The signpost crowds the path.')
  if (legend.top < plan.grid.top + plan.grid.height + 12) errors.push('The legend crowds the path.')

  // The book.
  const used = new Set(book.map((e) => e.walk))
  if (used.has(walk.id) && STONES_WALKS.some((w) => !used.has(w.id))) errors.push(`The book already uses the ${walk.name} while other walks wait.`)
  if (book.some((e) => e.signature === built.signature)) errors.push('The book already prints this path.')

  return { ok: errors.length === 0, errors }
}

function walkTree(obj: StudioFabricObject, visit: (o: StudioFabricObject) => void): void {
  visit(obj)
  for (const child of obj.objects ?? []) walkTree(child, visit)
}

/**
 * The drawn page, checked against the path it was drawn from: every stone,
 * row by row; every printed number bold on its stone, and no other; every
 * other number waiting, hidden, on its own stone; the trail waiting, hidden,
 * along exactly the answer's walk; the start and finish ringed; the
 * signpost naming the walk; and the legend showing the pair and the start.
 */
export function checkStonesDrawnPage(options: { puzzle: StudioFabricObject; built: StonesBuilt; walk: StonesWalk }): string[] {
  const { puzzle: group, built, walk } = options
  const { puzzle, values } = built
  const n = puzzle.size
  const N = n * n
  const errors: string[] = []
  const givens = new Map<number, number>()
  const answers = new Map<number, number>()
  const stoneRows = new Map<number, number>()
  const trails: string[] = []
  const ends = new Map<number, number>()
  let sign: StudioFabricObject | null = null
  const legendWords: string[] = []
  let legendNumbers = 0
  walkTree(group, (o) => {
    const role = String(o.data?.[STONES_PART_KEY] ?? '')
    const at = Number(o.data?.row) * n + Number(o.data?.col)
    if (role === 'given') {
      if (givens.has(at)) errors.push('A number is drawn twice.')
      givens.set(at, Number(o.text))
      if (o.visible === false) errors.push('A printed number is hidden on the puzzle page.')
      if (Number(o.fontWeight) !== 700) errors.push('A printed number is not bold.')
    } else if (role === 'answer') {
      if (answers.has(at)) errors.push('An answer is drawn twice.')
      answers.set(at, Number(o.text))
      if (o.visible !== false || o.studioRole !== 'answer') errors.push('An answer shows on the puzzle page.')
    } else if (role === 'stones') {
      stoneRows.set(Number(o.data?.row), Number(o.data?.stones))
      if (o.visible === false) errors.push('A stone is hidden on the puzzle page.')
    } else if (role === 'trail') {
      if (o.visible !== false || o.studioRole !== 'answer') errors.push('The trail shows on the puzzle page.')
      trails.push(String(o.data?.walk))
    } else if (role === 'end') {
      if (o.data?.ring === 'outer') ends.set(Number(o.data?.n), at)
    } else if (role === 'sign-text') sign = o
    else if (role === 'legend-text') legendWords.push(String(o.data?.entry))
    else if (role === 'legend-number') legendNumbers++
  })

  const expected = new Map(puzzle.clues.flatMap((v, s) => (v === STONES_BLANK ? [] : [[s, v] as const])))
  if (givens.size !== expected.size || [...expected].some(([s, v]) => givens.get(s) !== v)) errors.push('The printed numbers do not match the path.')
  const blanks = puzzle.clues.flatMap((v, s) => (v === STONES_BLANK ? [s] : []))
  if (answers.size !== blanks.length || blanks.some((s) => answers.get(s) !== values[s])) errors.push('The written-in numbers do not match the answer.')
  if (stoneRows.size !== n || [...stoneRows.values()].some((k) => k !== n)) errors.push('The stones are not all drawn.')

  const order = stonesPathOrder(n, values) ?? []
  if (trails.length !== 1 || trails[0] !== order.join(',')) errors.push('The trail does not follow the answer’s walk.')
  if (ends.size !== 2 || ends.get(1) !== order[0] || ends.get(N) !== order[N - 1]) errors.push('The start and finish are not ringed.')

  const labelled = sign as StudioFabricObject | null
  if (!labelled || String(labelled.text).replace('\n', ' ') !== stonesSignText(walk)) errors.push('The signpost does not name the walk.')
  if (legendWords.sort().join(',') !== 'ends,next' || legendNumbers !== 3) errors.push('The legend does not show the pair of stones and the start.')
  return [...new Set(errors)]
}
