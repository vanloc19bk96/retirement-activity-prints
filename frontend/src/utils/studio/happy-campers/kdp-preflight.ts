import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import { HC_CAMPGROUNDS, hcLevelSpec, hcSignText, type HcBookEntry, type HcCampground, type HcLevel } from './content'
import { HC_PART_KEY, hcLegendBox, hcSignBox } from './draw'
import { HC_COUNT_MIN, HC_SIGN_MIN, HC_SIGN_PAD_X, hcSignSpec, hcTextWidth, type HcPlan } from './layout'
import { hcSignature, type HcBuilt } from './puzzle'
import { TENT, hcCounts, isHcSolution, solveHc } from './solver'

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
 * The last gate before a Happy Campers page is accepted.
 *
 * A Tents & Trees grid with two answers, or one that needs a guess, is a
 * puzzle the reader cannot finish honestly — and they blame themselves. So
 * the grid is proven, not trusted: the numbers are read again off the
 * answer and must match; the answer must obey every rule; and the level's
 * own steps, used the way a reader would, must finish the grid on exactly
 * that answer (which also proves it is the only one). Then the page:
 * squares at least the level's floor, numbers at 16 pt or more, the sign's
 * name on one line inside its board, everything on the printable panel;
 * and not a campground the book already has while others are unused.
 */
export function runHcKdpPreflight(options: {
  built: HcBuilt
  plan: HcPlan
  level: HcLevel
  campground: HcCampground
  panel: Box
  font: string
  book?: readonly HcBookEntry[]
}): KdpPreflightResult {
  const { built, plan, level, campground, panel, font, book = [] } = options
  const errors: string[] = []
  const spec = hcLevelSpec(level)
  const { puzzle, tents } = built

  // The grid.
  if (puzzle.rows !== spec.size || puzzle.cols !== spec.size) errors.push(`The grid is not ${spec.gridLabel}.`)
  const trees = puzzle.trees.filter(Boolean).length
  if (trees < spec.minTents || trees > spec.maxTents) errors.push(`The grid has ${trees} trees; this level plants ${spec.minTents} to ${spec.maxTents}.`)
  const counts = hcCounts(puzzle.rows, puzzle.cols, tents)
  if (counts.rowCounts.join(',') !== puzzle.rowCounts.join(',') || counts.colCounts.join(',') !== puzzle.colCounts.join(',')) {
    errors.push('The numbers do not match the answer.')
  }
  if (!isHcSolution(puzzle, tents)) errors.push('The answer breaks a rule.')
  else {
    const solve = solveHc(puzzle, spec.rules)
    if (!solve.solved || solve.state.some((v, i) => (v === TENT) !== tents[i])) errors.push('The grid cannot be finished by logic alone to its one answer.')
    else if (spec.beyondBasic && solveHc(puzzle, 'basic').solved) errors.push('The grid is too easy for this level.')
  }
  if (hcSignature(puzzle, tents) !== built.signature) errors.push('The grid’s fingerprint does not match it.')

  // The page.
  if (plan.size !== spec.size) errors.push('The page was planned for another level.')
  if (plan.cell < Math.ceil(spec.minCell) - 1e-6) errors.push('The squares print below this level’s size.')
  if (plan.countSize < HC_COUNT_MIN - 1e-6) errors.push('The numbers print below 16 pt.')
  if (plan.signSize < HC_SIGN_MIN - 1e-6) errors.push('The sign prints below 14 pt.')
  if (Math.abs(plan.grid.width - spec.size * plan.cell) > 0.5 || Math.abs(plan.grid.height - spec.size * plan.cell) > 0.5) errors.push('The grid is not the level’s size.')
  const sign = hcSignBox(plan, campground, font)
  if (hcTextWidth(hcSignText(campground, plan.signLines), plan.signSize, hcSignSpec(font)) > sign.width - HC_SIGN_PAD_X + 0.5) errors.push(`“${campground.name}” does not fit on its sign.`)
  const legend = hcLegendBox(plan, trees, font)
  for (const [box, what] of [
    [sign, 'The sign'],
    [legend, 'The legend'],
    [plan.grid, 'The grid'],
    [{ left: plan.grid.left - plan.countGap - plan.rowCountWidth, top: plan.grid.top - plan.countGap - plan.colCountHeight, width: plan.rowCountWidth, height: plan.colCountHeight }, 'The numbers'],
  ] as const) {
    if (!inside(box, panel)) errors.push(`${what} runs past the printable area of this page.`)
  }
  if (sign.top + sign.height > plan.grid.top - plan.countGap - plan.colCountHeight + 0.5) errors.push('The sign crowds the numbers.')
  if (legend.top < plan.grid.top + plan.grid.height + 4) errors.push('The legend crowds the grid.')

  // The book.
  const used = new Set(book.map((e) => e.campground))
  if (used.has(campground.id) && HC_CAMPGROUNDS.some((c) => !used.has(c.id))) errors.push(`The book already visits ${campground.name} while other campgrounds are unused.`)
  if (book.some((e) => e.signature === built.signature)) errors.push('The book already prints this grid.')

  return { ok: errors.length === 0, errors }
}

function walk(obj: StudioFabricObject, visit: (o: StudioFabricObject) => void): void {
  visit(obj)
  for (const child of obj.objects ?? []) walk(child, visit)
}

/**
 * The drawn page, checked against the grid it was drawn from: every number
 * printed once, in its line; a tree drawn on exactly the tree squares; a
 * tent waiting, hidden, on exactly the answer's squares; the sign naming
 * the campground; and the legend counting the tents to pitch.
 */
export function checkHcDrawnPage(options: { puzzle: StudioFabricObject; built: HcBuilt; campground: HcCampground }): string[] {
  const { puzzle: group, built, campground } = options
  const { puzzle, tents } = built
  const errors: string[] = []
  const printed = new Map<string, number[]>()
  const treeAt = new Set<number>()
  const tentAt = new Set<number>()
  let sign: StudioFabricObject | null = null
  let legendCount: number | null = null
  let legendTent = 0
  walk(group, (o) => {
    const role = o.data?.[HC_PART_KEY]
    if (role === 'count') {
      const line = String(o.data?.line)
      printed.set(line, [...(printed.get(line) ?? []), Number(o.text)])
    } else if (role === 'tree') {
      const i = Number(o.data?.row) * puzzle.cols + Number(o.data?.col)
      if (treeAt.has(i)) errors.push('A square has two trees.')
      treeAt.add(i)
      if (o.visible === false) errors.push('A tree is hidden on the puzzle page.')
    } else if (role === 'tent') {
      const i = Number(o.data?.row) * puzzle.cols + Number(o.data?.col)
      if (tentAt.has(i)) errors.push('A square has two tents.')
      tentAt.add(i)
      if (o.visible !== false || o.studioRole !== 'answer') errors.push('A tent shows on the puzzle page.')
    } else if (role === 'sign-text') sign = o
    else if (role === 'legend-text' && o.data?.tents !== undefined) legendCount = Number(o.data.tents)
    else if (role === 'legend-tent') {
      legendTent++
      if (o.visible === false) errors.push('The legend’s tent is hidden.')
    }
  })

  const expect = (line: string, n: number) => {
    const got = printed.get(line) ?? []
    if (got.length !== 1 || got[0] !== n) errors.push(`Line ${line} prints ${got.join(' ') || 'nothing'} instead of ${n}.`)
  }
  puzzle.rowCounts.forEach((n, r) => expect(`r${r}`, n))
  puzzle.colCounts.forEach((n, c) => expect(`c${c}`, n))
  if (printed.size !== puzzle.rows + puzzle.cols) errors.push('The page prints numbers for lines the grid does not have.')

  puzzle.trees.forEach((t, i) => {
    if (t !== treeAt.has(i)) errors.push(t ? 'A tree is missing from the grid.' : 'A tree stands where the grid has none.')
    if (tents[i] !== tentAt.has(i)) errors.push(tents[i] ? 'The answer is missing a tent.' : 'The answer pitches a tent the grid does not.')
  })
  if (treeAt.size !== puzzle.trees.filter(Boolean).length) errors.push('The grid draws a different number of trees.')

  const signed = sign as StudioFabricObject | null
  if (!signed || String(signed.text).replace('\n', ' ') !== hcSignText(campground)) errors.push('The sign does not name the campground.')
  if (legendCount !== tents.filter(Boolean).length) errors.push('The legend counts the tents wrong.')
  if (legendTent !== 1) errors.push('The legend does not show the tent to draw.')
  return [...new Set(errors)]
}
