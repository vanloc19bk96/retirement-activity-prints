import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import { DRIVE_ROUTES, driveLevelSpec, driveSignText, type DriveBookEntry, type DriveLevel, type DriveRoute } from './content'
import { DRIVE_PART_KEY, driveLegendBox, driveSignBox } from './draw'
import {
  DRIVE_DIGIT_MIN,
  DRIVE_LINE_STROKE,
  DRIVE_SIGN_GAP_MIN,
  DRIVE_SIGN_MIN,
  DRIVE_SIGN_PAD_X,
  DRIVE_TOTAL_MIN,
  driveSignSpec,
  driveTextWidth,
  driveTotalFits,
  driveTotalInkWidth,
  type DrivePlan,
} from './layout'
import { driveShapeFits, driveSignature, type DriveBuilt } from './puzzle'
import { DRIVE_BLANK, driveAnswerKey, driveKeepsRules, driveRuns, driveWellFormed, solveDrive } from './solver'

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

/** True when the gray squares inside the grid mirror each other through its centre. */
export function driveBalanced(n: number, open: readonly boolean[]): boolean {
  for (let r = 1; r < n; r++) for (let c = 1; c < n; c++) if (open[r * n + c] !== open[(n - r) * n + (n - c)]) return false
  return true
}

/**
 * The last gate before a Scenic Drive page is accepted.
 *
 * A grid with two answers, or one that needs a guess, is a puzzle the reader
 * cannot finish honestly — and they blame themselves. So the grid is proven,
 * not trusted: its gray squares must make a proper, balanced grid (every
 * white square in a run across and a run down of two squares or more, none
 * longer than the level allows, the white squares one piece, the gray ones
 * mirrored through the centre); a total must stand before every run and no
 * run may hold a digit twice or miss its total in the answer; and the
 * level's own steps, used the way a reader would, must finish the grid on
 * exactly that answer (which also proves it is the only one) — and the
 * easier steps alone must not, where the level asks for more. Then the
 * page: squares at least the level's floor, digits at least 16 pt and
 * totals at least 12 pt, every total clear of its diagonal, the route's name
 * inside its sign, everything on the printable panel with air between; and
 * not a route the book already uses while others wait, nor a grid the book
 * already prints.
 */
export function runDriveKdpPreflight(options: {
  built: DriveBuilt
  plan: DrivePlan
  level: DriveLevel
  route: DriveRoute
  panel: Box
  font: string
  book?: readonly DriveBookEntry[]
}): KdpPreflightResult {
  const { built, plan, level, route, panel, font, book = [] } = options
  const errors: string[] = []
  const spec = driveLevelSpec(level)
  const { puzzle, values } = built
  const n = puzzle.size

  // The grid.
  if (n !== spec.size) errors.push(`The grid is not ${spec.gridLabel}.`)
  if (!driveWellFormed(puzzle)) errors.push('The grid has a run shorter than two squares, a white square cut off, or a total missing or out of reach.')
  else {
    if (!driveShapeFits(n, puzzle.open, spec)) errors.push('The grid has runs too long, or too many or too few gray squares, for this level.')
    if (!driveBalanced(n, puzzle.open)) errors.push('The gray squares are not balanced about the centre.')
    if (!driveKeepsRules(puzzle, values)) errors.push('The answer does not add up to every total with no digit twice in a run.')
    else {
      const solve = solveDrive(puzzle, spec.rules)
      if (!solve.solved || driveAnswerKey(solve.values) !== driveAnswerKey(values)) errors.push('The grid cannot be finished by logic alone to its one answer.')
      else if (spec.beyond && solveDrive(puzzle, spec.beyond).solved) errors.push('The grid is too easy for this level.')
    }
    if (driveSignature(puzzle) !== built.signature) errors.push('The grid’s fingerprint does not match it.')
  }

  // The page.
  if (plan.size !== spec.size) errors.push('The page was planned for another level.')
  if (plan.cell < Math.ceil(spec.minCell) - 1e-6) errors.push('The squares print smaller than this level allows.')
  if (plan.digitSize < DRIVE_DIGIT_MIN - 1e-6) errors.push('The digits print below 16 pt.')
  if (plan.digitSize * 1.3 > plan.cell - DRIVE_LINE_STROKE * 2) errors.push('The digits crowd their squares.')
  if (plan.totalSize < DRIVE_TOTAL_MIN - 1e-6) errors.push('The totals print below 12 pt.')
  const totals = [...puzzle.across, ...puzzle.down].filter((t) => t !== DRIVE_BLANK)
  if (totals.some((t) => !driveTotalFits(plan.cell, plan.totalSize, driveTotalInkWidth(t, plan.totalSize)))) errors.push('A total crowds the diagonal of its square.')
  if (plan.signSize < DRIVE_SIGN_MIN - 1e-6) errors.push('The sign prints below 14 pt.')
  const side = spec.size * plan.cell
  if (Math.abs(plan.grid.width - side) > 0.5 || Math.abs(plan.grid.height - side) > 0.5) errors.push('The grid is not the level’s size.')
  const sign = driveSignBox(plan, route, font)
  if (driveTextWidth(driveSignText(route, plan.signLines), plan.signSize, driveSignSpec(font)) > sign.width - DRIVE_SIGN_PAD_X + 0.5) errors.push(`“${route.name}” does not fit on its sign.`)
  const legend = driveLegendBox(plan, font)
  for (const [box, what] of [
    [sign, 'The sign'],
    [legend, 'The legend'],
    [plan.grid, 'The grid'],
  ] as const) {
    if (!inside(box, panel)) errors.push(`${what} runs past the printable area of this page.`)
  }
  if (sign.top + sign.height + DRIVE_SIGN_GAP_MIN > plan.grid.top + 0.5) errors.push('The sign crowds the grid.')
  if (legend.top < plan.grid.top + plan.grid.height + 12) errors.push('The legend crowds the grid.')

  // The book.
  const used = new Set(book.map((e) => e.route))
  if (used.has(route.id) && DRIVE_ROUTES.some((w) => !used.has(w.id))) errors.push(`The book already uses ${route.name} while other routes wait.`)
  if (book.some((e) => e.signature === built.signature)) errors.push('The book already prints this grid.')

  return { ok: errors.length === 0, errors }
}

function walkTree(obj: StudioFabricObject, visit: (o: StudioFabricObject) => void): void {
  visit(obj)
  for (const child of obj.objects ?? []) walkTree(child, visit)
}

/**
 * The drawn page, checked against the grid it was drawn from: every gray
 * square filled and every square ruled, a diagonal in every gray square that
 * carries a total; every total bold in its square, and no other; every digit
 * waiting, hidden, in its own white square; the frame whole; the sign naming
 * the route; and the legend showing the sample run and the repeated digit.
 */
export function checkDriveDrawnPage(options: { puzzle: StudioFabricObject; built: DriveBuilt; route: DriveRoute }): string[] {
  const { puzzle: group, built, route } = options
  const { puzzle, values } = built
  const n = puzzle.size
  const errors: string[] = []
  const totals = { across: new Map<number, number>(), down: new Map<number, number>() }
  const answers = new Map<number, number>()
  const grays: StudioFabricObject[] = []
  let lines = 0
  let diagonals = -1
  let frame = 0
  let sign: StudioFabricObject | null = null
  const legendWords: string[] = []
  let legendNumbers = 0
  let legendTotals = 0
  let legendCross = 0
  walkTree(group, (o) => {
    const role = String(o.data?.[DRIVE_PART_KEY] ?? '')
    const at = Number(o.data?.row) * n + Number(o.data?.col)
    if (role === 'across-total' || role === 'down-total') {
      const map = totals[role === 'across-total' ? 'across' : 'down']
      if (map.has(at)) errors.push('A total is drawn twice.')
      map.set(at, Number(o.text))
      if (o.visible === false) errors.push('A total is hidden on the puzzle page.')
      if (Number(o.fontWeight) !== 700) errors.push('A total is not bold.')
    } else if (role === 'answer') {
      if (answers.has(at)) errors.push('An answer is drawn twice.')
      answers.set(at, Number(o.text))
      if (o.visible !== false || o.studioRole !== 'answer') errors.push('An answer shows on the puzzle page.')
    } else if (role === 'grays') {
      grays.push(o)
      if (o.visible === false) errors.push('The gray squares are hidden on the puzzle page.')
    } else if (role === 'lines') {
      lines++
      if (o.visible === false || Number(o.data?.count) !== 2 * (n - 1)) errors.push('The lines between squares are not all drawn.')
    } else if (role === 'diagonals') diagonals = Number(o.data?.count)
    else if (role === 'frame') frame++
    else if (role === 'sign-text') sign = o
    else if (role === 'legend-text') legendWords.push(String(o.data?.entry))
    else if (role === 'legend-number') legendNumbers++
    else if (role === 'legend-total') legendTotals++
    else if (role === 'legend-cross') legendCross++
  })

  for (const dir of ['across', 'down'] as const) {
    const expected = new Map(puzzle[dir].flatMap((t, s) => (t === DRIVE_BLANK ? [] : [[s, t] as const])))
    const drawn = totals[dir]
    if (drawn.size !== expected.size || [...expected].some(([s, t]) => drawn.get(s) !== t)) errors.push(`The totals ${dir} do not match the grid.`)
  }
  const whites = puzzle.open.flatMap((o, s) => (o ? [s] : []))
  if (answers.size !== whites.length || whites.some((s) => answers.get(s) !== values[s])) errors.push('The written-in digits do not match the answer.')

  const grayCount = puzzle.open.filter((o) => !o).length
  const open = puzzle.open.map((o) => (o ? 1 : 0)).join('')
  if (grays.length !== 1 || grays[0]!.data?.open !== open || Number(grays[0]!.data?.count) !== grayCount) errors.push('The gray squares are not drawn as the grid has them.')
  if (lines !== 1) errors.push('The lines between squares are not all drawn.')
  const split = puzzle.across.filter((t, s) => t !== DRIVE_BLANK || puzzle.down[s] !== DRIVE_BLANK).length
  if (diagonals !== split || split !== new Set(driveRuns(puzzle).map((r) => r.clue)).size) errors.push('The diagonals are not drawn in every square with a total.')
  if (frame !== 4) errors.push('The grid’s frame is not whole.')

  const labelled = sign as StudioFabricObject | null
  if (!labelled || String(labelled.text).replace('\n', ' ') !== driveSignText(route)) errors.push('The sign does not name the route.')
  if (legendWords.sort().join(',') !== 'sum,twice' || legendNumbers !== 4 || legendTotals !== 1 || legendCross !== 1) errors.push('The legend does not show the sample run and the repeated digit.')
  return [...new Set(errors)]
}
