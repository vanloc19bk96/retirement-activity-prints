import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import { TT_LINES, ttLevelSpec, ttSignText, type TtBookEntry, type TtLevel, type TtLine } from './content'
import { TT_PART_KEY, ttLegendBox, ttSignBox } from './draw'
import { TT_COUNT_MIN, TT_SIGN_GAP_MIN, TT_SIGN_MIN, TT_SIGN_PAD_X, ttSignSpec, ttTextWidth, type TtPlan } from './layout'
import { ttSignature, type TtBuilt } from './puzzle'
import { TT_PIECES, isTtSolution, solveTt, ttCounts, ttRouteKey, ttRoutePieces } from './solver'

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
 * The last gate before a Train Tracks page is accepted.
 *
 * A board with two answers, or one that needs a guess, is a puzzle the
 * reader cannot finish honestly — and they blame themselves. So the board
 * is proven, not trusted: the answer must be one line from end to end that
 * matches every number and printed piece; and the level's own steps, used
 * the way a reader would, must finish the board on exactly that line (which
 * also proves it is the only one) — and the easier steps alone must not,
 * where the level asks for more. Then the page: squares at least the
 * level's floor, numbers at least 16 pt, the line's name inside its sign,
 * everything on the printable panel with air between; and not a line or
 * board the book already uses while others wait.
 */
export function runTtKdpPreflight(options: {
  built: TtBuilt
  plan: TtPlan
  level: TtLevel
  line: TtLine
  panel: Box
  font: string
  book?: readonly TtBookEntry[]
}): KdpPreflightResult {
  const { built, plan, level, line, panel, font, book = [] } = options
  const errors: string[] = []
  const spec = ttLevelSpec(level)
  const { puzzle, route } = built
  const advanced = (tally: { loop: number; probe: number }) => (spec.rules === 'probe' ? tally.probe : tally.loop)

  // The board.
  if (puzzle.size !== spec.size) errors.push(`The board is not ${spec.gridLabel}.`)
  if (!isTtSolution(puzzle, route)) errors.push('The answer breaks a rule.')
  else {
    const solve = solveTt(puzzle, spec.rules)
    if (!solve.solved || ttRouteKey(solve.route) !== ttRouteKey(route)) errors.push('The board cannot be finished by logic alone to its one answer.')
    else if ((spec.beyond && solveTt(puzzle, spec.beyond).solved) || advanced(solve.tally) < spec.minAdvanced) errors.push('The board is too easy for this level.')
  }
  const printed = new Set(puzzle.givens.map((g) => g.at))
  if (!printed.has(puzzle.portals[0].at) || !printed.has(puzzle.portals[1].at)) errors.push('Where the line enters or leaves is not shown.')
  if (puzzle.givens.length < spec.givens[0]) errors.push('Too few pieces are shown to start from.')
  if (puzzle.givens.length > spec.givens[1]) errors.push('Too many pieces are shown for this level.')
  if (ttSignature(puzzle.size, route, puzzle.portals) !== built.signature) errors.push('The board’s fingerprint does not match it.')

  // The page.
  if (plan.size !== spec.size) errors.push('The page was planned for another level.')
  if (plan.cell < Math.ceil(spec.minCell) - 1e-6) errors.push('The squares print smaller than this level allows.')
  if (plan.countSize < TT_COUNT_MIN - 1e-6) errors.push('The numbers print below 16 pt.')
  if (plan.signSize < TT_SIGN_MIN - 1e-6) errors.push('The sign prints below 14 pt.')
  const side = spec.size * plan.cell
  if (Math.abs(plan.grid.width - side) > 0.5 || Math.abs(plan.grid.height - side) > 0.5) errors.push('The board is not the level’s size.')
  const sign = ttSignBox(plan, line, font)
  if (ttTextWidth(ttSignText(line, plan.signLines), plan.signSize, ttSignSpec(font)) > sign.width - TT_SIGN_PAD_X + 0.5) errors.push(`“${line.name}” does not fit on its sign.`)
  const legend = ttLegendBox(plan)
  const numbers: Box = {
    left: plan.grid.left,
    top: plan.grid.top - plan.countGap - plan.colCountHeight,
    width: plan.grid.width + plan.countGap + plan.rowCountWidth,
    height: plan.grid.height + plan.countGap + plan.colCountHeight,
  }
  for (const [box, what] of [
    [sign, 'The sign'],
    [legend, 'The legend'],
    [numbers, 'The board and its numbers'],
  ] as const) {
    if (!inside(box, panel)) errors.push(`${what} runs past the printable area of this page.`)
  }
  if (sign.top + sign.height + TT_SIGN_GAP_MIN > numbers.top + 0.5) errors.push('The sign crowds the board.')
  if (legend.top < plan.grid.top + plan.grid.height + 12) errors.push('The legend crowds the board.')

  // The book.
  const used = new Set(book.map((e) => e.line))
  if (used.has(line.id) && TT_LINES.some((l) => !used.has(l.id))) errors.push(`The book already uses ${line.name} while other lines wait.`)
  if (book.some((e) => e.signature === built.signature)) errors.push('The book already prints this board.')

  return { ok: errors.length === 0, errors }
}

function walk(obj: StudioFabricObject, visit: (o: StudioFabricObject) => void): void {
  visit(obj)
  for (const child of obj.objects ?? []) walk(child, visit)
}

/**
 * The drawn page, checked against the board it was drawn from: every row
 * and column number right, the frame, every printed piece showing its piece
 * and no other square printed, the whole line waiting, hidden, on exactly
 * the answer's squares, the sign naming the line, and the legend showing
 * all six pieces.
 */
export function checkTtDrawnPage(options: { puzzle: StudioFabricObject; built: TtBuilt; line: TtLine }): string[] {
  const { puzzle: group, built, line } = options
  const { puzzle, route } = built
  const n = puzzle.size
  const errors: string[] = []
  const counts = new Map<string, number>()
  let frame = 0
  const shown = new Map<number, string>()
  const laid: StudioFabricObject[] = []
  let sign: StudioFabricObject | null = null
  const legendPieces: string[] = []
  walk(group, (o) => {
    const role = o.data?.[TT_PART_KEY]
    if (role === 'count') counts.set(String(o.data?.line), Number(o.text))
    else if (role === 'frame') frame++
    else if (role === 'given') {
      const at = Number(o.data?.row) * n + Number(o.data?.col)
      if (shown.has(at)) errors.push('A printed piece is drawn twice.')
      shown.set(at, String(o.data?.piece))
      if (o.visible === false || o.studioRole === 'answer') errors.push('A printed piece is hidden on the puzzle page.')
    } else if (role === 'line') {
      laid.push(o)
      if (o.visible !== false || o.studioRole !== 'answer') errors.push('The answer shows on the puzzle page.')
    } else if (role === 'sign-text') sign = o
    else if (role === 'legend-piece') legendPieces.push(String(o.data?.piece))
  })

  const { rows, cols } = ttCounts(n, route)
  for (let k = 0; k < n; k++) {
    if (counts.get(`r${k}`) !== rows[k] || rows[k] !== puzzle.rows[k]) errors.push(`Row ${k + 1}’s number is wrong.`)
    if (counts.get(`c${k}`) !== cols[k] || cols[k] !== puzzle.cols[k]) errors.push(`Column ${k + 1}’s number is wrong.`)
  }
  if (counts.size !== 2 * n) errors.push('A number is missing or extra.')
  if (frame !== 4) errors.push('The board’s frame is not drawn.')

  const pieces = ttRoutePieces(n, route, puzzle.portals)
  if (shown.size !== puzzle.givens.length) errors.push('The printed pieces are not the puzzle’s.')
  for (const g of puzzle.givens) {
    if (shown.get(g.at) !== g.piece || pieces.get(g.at) !== g.piece) errors.push('A printed piece does not show its piece.')
  }

  if (laid.length !== 1 || laid[0]!.data?.route !== ttRouteKey(route)) errors.push('The answer’s line is not the board’s.')

  const signed = sign as StudioFabricObject | null
  if (!signed || String(signed.text).replace('\n', ' ') !== ttSignText(line)) errors.push('The sign does not name the line.')
  if (legendPieces.join(' ') !== TT_PIECES.join(' ')) errors.push('The legend does not show the six pieces.')
  return [...new Set(errors)]
}
