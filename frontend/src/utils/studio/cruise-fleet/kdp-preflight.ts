import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import { CF_HARBORS, cfFleetEntries, cfLevelSpec, cfSignText, type CfBookEntry, type CfHarbor, type CfLevel } from './content'
import { CF_PART_KEY, cfLegendBox, cfSignBox } from './draw'
import { CF_COUNT_MIN, CF_SIGN_GAP_MIN, CF_SIGN_MIN, CF_SIGN_PAD_X, cfSignSpec, cfTextWidth, type CfPlan } from './layout'
import { cfSignature, squaresOf, type CfBuilt } from './puzzle'
import { cfCounts, cfFleetList, cfGridOf, cfPieceOf, cfShipSquares, cfSquareList, isCfSolution, solveCf } from './solver'

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
 * The last gate before a Cruise Fleet page is accepted.
 *
 * A harbor with two answers, or one that needs a guess, is a puzzle the
 * reader cannot finish honestly — and they blame themselves. So the harbor
 * is proven, not trusted: the answer must be the level's fleet, keep every
 * rule and match every number and shown square; and the level's own steps,
 * used the way a reader would, must finish the harbor on exactly that
 * answer (which also proves it is the only one) — and the basic steps alone
 * must not, where the level asks for more. Then the page: squares at least
 * the level's floor, numbers at least 16 pt, the harbor's name inside its
 * sign, everything on the printable panel with air between; and not a
 * harbor or fleet the book already uses while others wait.
 */
export function runCfKdpPreflight(options: {
  built: CfBuilt
  plan: CfPlan
  level: CfLevel
  harbor: CfHarbor
  panel: Box
  font: string
  book?: readonly CfBookEntry[]
}): KdpPreflightResult {
  const { built, plan, level, harbor, panel, font, book = [] } = options
  const errors: string[] = []
  const spec = cfLevelSpec(level)
  const { puzzle, ships } = built

  // The harbor.
  if (puzzle.size !== spec.size) errors.push(`The harbor is not ${spec.gridLabel}.`)
  if (cfFleetList(puzzle.fleet) !== cfFleetList(spec.fleet)) errors.push('The fleet is not the level’s fleet.')
  if (!isCfSolution(puzzle, ships)) errors.push('The answer breaks a rule.')
  else {
    const solve = solveCf(puzzle, spec.rules)
    if (!solve.solved || squaresOf(solve.state) !== cfSquareList(ships, puzzle.size)) errors.push('The harbor cannot be finished by logic alone to its one answer.')
    else if ((spec.beyond && solveCf(puzzle, spec.beyond).solved) || solve.tally.fleet < spec.minAdvanced) errors.push('The harbor is too easy for this level.')
  }
  if (puzzle.givens.length < spec.minGivens) errors.push('Too few squares are shown to start from.')
  if (cfSignature(puzzle.size, ships) !== built.signature) errors.push('The harbor’s fingerprint does not match it.')

  // The page.
  if (plan.size !== spec.size) errors.push('The page was planned for another level.')
  if (plan.cell < Math.ceil(spec.minCell) - 1e-6) errors.push('The squares print smaller than this level allows.')
  if (plan.countSize < CF_COUNT_MIN - 1e-6) errors.push('The numbers print below 16 pt.')
  if (plan.signSize < CF_SIGN_MIN - 1e-6) errors.push('The sign prints below 14 pt.')
  const side = spec.size * plan.cell
  if (Math.abs(plan.grid.width - side) > 0.5 || Math.abs(plan.grid.height - side) > 0.5) errors.push('The harbor is not the level’s size.')
  const sign = cfSignBox(plan, harbor, font)
  if (cfTextWidth(cfSignText(harbor, plan.signLines), plan.signSize, cfSignSpec(font)) > sign.width - CF_SIGN_PAD_X + 0.5) errors.push(`“${harbor.name}” does not fit on its sign.`)
  const legend = cfLegendBox(plan)
  const numbers: Box = {
    left: plan.grid.left - plan.countGap - plan.rowCountWidth,
    top: plan.grid.top - plan.countGap - plan.colCountHeight,
    width: plan.grid.width + plan.countGap + plan.rowCountWidth,
    height: plan.grid.height + plan.countGap + plan.colCountHeight,
  }
  for (const [box, what] of [
    [sign, 'The sign'],
    [legend, 'The legend'],
    [numbers, 'The harbor and its numbers'],
  ] as const) {
    if (!inside(box, panel)) errors.push(`${what} runs past the printable area of this page.`)
  }
  if (sign.top + sign.height + CF_SIGN_GAP_MIN > numbers.top + 0.5) errors.push('The sign crowds the harbor.')
  if (legend.top < plan.grid.top + plan.grid.height + 12) errors.push('The legend crowds the harbor.')

  // The book.
  const used = new Set(book.map((e) => e.harbor))
  if (used.has(harbor.id) && CF_HARBORS.some((h) => !used.has(h.id))) errors.push(`The book already uses ${harbor.name} while other harbors wait.`)
  if (book.some((e) => e.signature === built.signature)) errors.push('The book already prints this fleet.')

  return { ok: errors.length === 0, errors }
}

function walk(obj: StudioFabricObject, visit: (o: StudioFabricObject) => void): void {
  visit(obj)
  for (const child of obj.objects ?? []) walk(child, visit)
}

/**
 * The drawn page, checked against the harbor it was drawn from: every row
 * and column number right, the frame, every shown square showing its piece
 * and no other square shown, the whole fleet waiting, hidden, on exactly
 * the answer's squares, the sign naming the harbor, and the legend listing
 * the fleet and open water.
 */
export function checkCfDrawnPage(options: { puzzle: StudioFabricObject; built: CfBuilt; harbor: CfHarbor; plan: CfPlan }): string[] {
  const { puzzle: group, built, harbor, plan } = options
  const { puzzle, ships } = built
  const n = puzzle.size
  const errors: string[] = []
  const counts = new Map<string, number>()
  let frame = 0
  const shown = new Map<number, string>()
  const hulls: string[] = []
  let sign: StudioFabricObject | null = null
  const legendWords: string[] = []
  let legendShips = 0
  let legendWater = 0
  walk(group, (o) => {
    const role = o.data?.[CF_PART_KEY]
    if (role === 'count') counts.set(String(o.data?.line), Number(o.text))
    else if (role === 'frame') frame++
    else if (role === 'given') {
      const at = Number(o.data?.row) * n + Number(o.data?.col)
      if (shown.has(at)) errors.push('A shown square is drawn twice.')
      shown.set(at, String(o.data?.piece))
      if (o.visible === false || o.studioRole === 'answer') errors.push('A shown square is hidden on the puzzle page.')
    } else if (role === 'ship') {
      hulls.push(String(o.data?.squares))
      if (o.visible !== false || o.studioRole !== 'answer') errors.push('A ship shows on the puzzle page.')
    } else if (role === 'sign-text') sign = o
    else if (role === 'legend-text') legendWords.push(String(o.text))
    else if (role === 'legend-ship') legendShips++
    else if (role === 'legend-water') legendWater++
  })

  const { rows, cols } = cfCounts(ships, n)
  for (let k = 0; k < n; k++) {
    if (counts.get(`r${k}`) !== rows[k] || rows[k] !== puzzle.rows[k]) errors.push(`Row ${k + 1}’s number is wrong.`)
    if (counts.get(`c${k}`) !== cols[k] || cols[k] !== puzzle.cols[k]) errors.push(`Column ${k + 1}’s number is wrong.`)
  }
  if (counts.size !== 2 * n) errors.push('A number is missing or extra.')
  if (frame !== 4) errors.push('The harbor’s frame is not drawn.')

  const grid = cfGridOf(ships, n)
  if (shown.size !== puzzle.givens.length) errors.push('The shown squares are not the puzzle’s.')
  for (const g of puzzle.givens) {
    if (shown.get(g.at) !== g.piece || cfPieceOf(grid, n, g.at) !== g.piece) errors.push('A shown square does not show its piece.')
  }

  const expected = ships.map((s) => cfShipSquares(s, n).join('.')).sort()
  if (hulls.sort().join(' ') !== expected.join(' ')) errors.push('The answer’s ships are off their squares.')

  const signed = sign as StudioFabricObject | null
  if (!signed || String(signed.text).replace('\n', ' ') !== cfSignText(harbor)) errors.push('The sign does not name the harbor.')
  const fleet = cfFleetEntries(puzzle.fleet)
  const listed = plan.legend.entries
  if (legendWords.join('|') !== listed.map((e) => e.words).join('|')) errors.push('The legend does not list the fleet.')
  if (listed.filter((e) => e.kind === 'ship').map((e) => `${e.length}x${e.count}`).join(' ') !== fleet.map((e) => `${e.length}x${e.count}`).join(' ')) errors.push('The legend does not count the fleet.')
  if (legendShips !== fleet.length || legendWater !== 1) errors.push('The legend does not draw the fleet.')
  return [...new Set(errors)]
}
