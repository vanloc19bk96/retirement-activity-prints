import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import { IH_CHAINS, ihLevelSpec, ihSignText, type IhBookEntry, type IhChain, type IhLevel } from './content'
import { IH_PART_KEY, ihLegendBox, ihSignBox } from './draw'
import { IH_NUMBER_MIN, IH_SIGN_GAP_MIN, IH_SIGN_MIN, IH_SIGN_PAD_X, ihSignSpec, ihTextWidth, type IhPlan } from './layout'
import { ihSignature, type IhBuilt } from './puzzle'
import { bridgesOf, ihBridgeList, ihNumbers, isIhSolution, solveIh } from './solver'

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
 * The last gate before an Island Hopping page is accepted.
 *
 * A Bridges chart with two answers, or one that needs a guess, is a puzzle
 * the reader cannot finish honestly — and they blame themselves. So the
 * chart is proven, not trusted: the numbers are read again off the answer
 * and must match; the answer must obey every rule; and the level's own
 * steps, used the way a reader would, must finish the chart on exactly that
 * answer (which also proves it is the only one) — and the steps of the level
 * below must not. Then the page: spacing at least the level's floor, numbers
 * at 16 pt or more and inside their islands, the sign's name inside its
 * board, everything on the printable panel; and not a chain the book
 * already visits while others are unused.
 */
export function runIhKdpPreflight(options: {
  built: IhBuilt
  plan: IhPlan
  level: IhLevel
  chain: IhChain
  panel: Box
  font: string
  book?: readonly IhBookEntry[]
}): KdpPreflightResult {
  const { built, plan, level, chain, panel, font, book = [] } = options
  const errors: string[] = []
  const spec = ihLevelSpec(level)
  const { puzzle, bridges } = built

  // The chart.
  if (puzzle.rows !== spec.size || puzzle.cols !== spec.size) errors.push(`The chart is not ${spec.gridLabel}.`)
  const islands = puzzle.islands.length
  if (islands < spec.minIslands || islands > spec.maxIslands) errors.push(`The chart has ${islands} islands; this level has ${spec.minIslands} to ${spec.maxIslands}.`)
  if (puzzle.islands.some((isl) => isl.row < 0 || isl.col < 0 || isl.row >= puzzle.rows || isl.col >= puzzle.cols)) errors.push('An island lies off the chart.')
  if (new Set(puzzle.islands.map((isl) => `${isl.row},${isl.col}`)).size !== islands) errors.push('Two islands share a point.')
  const numbers = ihNumbers(islands, bridges)
  if (puzzle.islands.some((isl, i) => isl.n !== numbers[i] || isl.n < 1 || isl.n > 8)) errors.push('The numbers do not match the answer.')
  if (!isIhSolution(puzzle, bridges)) errors.push('The answer breaks a rule.')
  else {
    const solve = solveIh(puzzle, spec.rules)
    if (!solve.solved || ihBridgeList(bridgesOf(puzzle, solve.state)) !== ihBridgeList(bridges)) errors.push('The chart cannot be finished by logic alone to its one answer.')
    else if (spec.beyond && solveIh(puzzle, spec.beyond).solved) errors.push('The chart is too easy for this level.')
  }
  if (ihSignature(puzzle) !== built.signature) errors.push('The chart’s fingerprint does not match it.')

  // The page.
  if (plan.size !== spec.size) errors.push('The page was planned for another level.')
  if (plan.cell < Math.ceil(spec.minCell) - 1e-6) errors.push('The islands print closer together than this level allows.')
  if (plan.numberSize < IH_NUMBER_MIN - 1e-6) errors.push('The numbers print below 16 pt.')
  if (plan.numberSize > plan.islandRadius * 2 - 1e-6) errors.push('The numbers are too big for their islands.')
  if (plan.signSize < IH_SIGN_MIN - 1e-6) errors.push('The sign prints below 14 pt.')
  const side = spec.size * plan.cell + plan.pad * 2
  if (Math.abs(plan.grid.width - side) > 0.5 || Math.abs(plan.grid.height - side) > 0.5) errors.push('The chart is not the level’s size.')
  const sign = ihSignBox(plan, chain, font)
  if (ihTextWidth(ihSignText(chain, plan.signLines), plan.signSize, ihSignSpec(font)) > sign.width - IH_SIGN_PAD_X + 0.5) errors.push(`“${chain.name}” does not fit on its sign.`)
  const legend = ihLegendBox(plan, islands, font)
  for (const [box, what] of [
    [sign, 'The sign'],
    [legend, 'The legend'],
    [plan.grid, 'The chart'],
  ] as const) {
    if (!inside(box, panel)) errors.push(`${what} runs past the printable area of this page.`)
  }
  if (sign.top + sign.height + IH_SIGN_GAP_MIN > plan.grid.top + 0.5) errors.push('The sign crowds the chart.')
  if (legend.top < plan.grid.top + plan.grid.height + 4) errors.push('The legend crowds the chart.')

  // The book.
  const used = new Set(book.map((e) => e.chain))
  if (used.has(chain.id) && IH_CHAINS.some((c) => !used.has(c.id))) errors.push(`The book already visits ${chain.name} Islands while other chains are unused.`)
  if (book.some((e) => e.signature === built.signature)) errors.push('The book already prints this chart.')

  return { ok: errors.length === 0, errors }
}

function walk(obj: StudioFabricObject, visit: (o: StudioFabricObject) => void): void {
  visit(obj)
  for (const child of obj.objects ?? []) walk(child, visit)
}

/**
 * The drawn page, checked against the chart it was drawn from: every island
 * drawn once, at its point, with its number printed once inside it; a
 * bridge waiting, hidden, on exactly the answer's lanes, doubled where the
 * answer doubles it; the sign naming the chain; and the legend counting the
 * islands and showing the bridge to draw.
 */
export function checkIhDrawnPage(options: { puzzle: StudioFabricObject; built: IhBuilt; chain: IhChain }): string[] {
  const { puzzle: group, built, chain } = options
  const { puzzle, bridges } = built
  const errors: string[] = []
  const islandAt = new Map<number, StudioFabricObject>()
  const printed = new Map<number, number[]>()
  const drawn = new Map<string, number>()
  let sign: StudioFabricObject | null = null
  let legendCount: number | null = null
  let legendBridge = 0
  walk(group, (o) => {
    const role = o.data?.[IH_PART_KEY]
    if (role === 'island') {
      const i = Number(o.data?.i)
      if (islandAt.has(i)) errors.push('An island is drawn twice.')
      islandAt.set(i, o)
      if (o.visible === false) errors.push('An island is hidden on the puzzle page.')
    } else if (role === 'number') {
      const i = Number(o.data?.i)
      printed.set(i, [...(printed.get(i) ?? []), Number(o.text)])
      if (o.visible === false) errors.push('A number is hidden on the puzzle page.')
    } else if (role === 'bridge') {
      const key = `${o.data?.a}-${o.data?.b}`
      if (drawn.has(key)) errors.push('A lane has two bridge drawings.')
      drawn.set(key, Number(o.data?.count))
      if (o.visible !== false || o.studioRole !== 'answer') errors.push('A bridge shows on the puzzle page.')
    } else if (role === 'sign-text') sign = o
    else if (role === 'legend-text' && o.data?.islands !== undefined) legendCount = Number(o.data.islands)
    else if (role === 'legend-bridge') {
      legendBridge++
      if (o.visible === false) errors.push('The legend’s bridge is hidden.')
    }
  })

  puzzle.islands.forEach((isl, i) => {
    const drawnIsland = islandAt.get(i)
    if (!drawnIsland) errors.push('An island is missing from the chart.')
    else if (Number(drawnIsland.data?.row) !== isl.row || Number(drawnIsland.data?.col) !== isl.col) errors.push('An island is drawn off its point.')
    const got = printed.get(i) ?? []
    if (got.length !== 1 || got[0] !== isl.n) errors.push(`Island ${i + 1} prints ${got.join(' ') || 'nothing'} instead of ${isl.n}.`)
  })
  if (islandAt.size !== puzzle.islands.length || printed.size !== puzzle.islands.length) errors.push('The chart draws a different number of islands.')

  for (const bridge of bridges) {
    const count = drawn.get(`${bridge.a}-${bridge.b}`)
    if (count !== bridge.count) errors.push(count === undefined ? 'The answer is missing a bridge.' : 'The answer draws a bridge single where it is double, or double where it is single.')
  }
  if (drawn.size !== bridges.length) errors.push('The answer draws a bridge the chart does not have.')

  const signed = sign as StudioFabricObject | null
  if (!signed || String(signed.text).replace('\n', ' ') !== ihSignText(chain)) errors.push('The sign does not name the island chain.')
  if (legendCount !== puzzle.islands.length) errors.push('The legend counts the islands wrong.')
  if (legendBridge !== 1) errors.push('The legend does not show the bridge to draw.')
  return [...new Set(errors)]
}
