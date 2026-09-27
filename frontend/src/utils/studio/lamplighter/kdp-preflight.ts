import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import { LAMP_HOMES, lampLevelSpec, lampSignText, type LampBookEntry, type LampHome, type LampLevel } from './content'
import { LAMP_PART_KEY, lampArms, lampLegendBox, lampSignBox } from './draw'
import { LAMP_NUMBER_MIN, LAMP_SIGN_GAP_MIN, LAMP_SIGN_MIN, LAMP_SIGN_PAD_X, lampSignSpec, lampTextWidth, type LampPlan } from './layout'
import { lampFloorConnected, lampSignature, lampWallBlock, type LampBuilt } from './puzzle'
import { LAMP_FLOOR, isLampNumber, isLampSolution, lampAnswerKey, lampWellFormed, solveLamp } from './solver'

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
 * The last gate before a Lamplighter page is accepted.
 *
 * A house with two answers, or one that needs a guess, is a puzzle the
 * reader cannot finish honestly — and they blame themselves. So the house
 * is proven, not trusted: the walls mirror through the centre, never four
 * in a block, and never wall off a room; the answer must obey every rule;
 * and the level's own steps, used the way a reader would, must finish the
 * house on exactly that answer (which also proves it is the only one) — and
 * the easier steps alone must not, where the level asks for more. Then the
 * page: squares at least the level's floor, numbers at least 16 pt, the
 * home's name inside its board, everything on the printable panel with air
 * between; and not a home the book already uses while others wait, nor a
 * house the book already prints.
 */
export function runLampKdpPreflight(options: {
  built: LampBuilt
  plan: LampPlan
  level: LampLevel
  home: LampHome
  panel: Box
  font: string
  book?: readonly LampBookEntry[]
}): KdpPreflightResult {
  const { built, plan, level, home, panel, font, book = [] } = options
  const errors: string[] = []
  const spec = lampLevelSpec(level)
  const { puzzle, lamps } = built
  const n = puzzle.size

  // The house.
  if (n !== spec.size) errors.push(`The house is not ${spec.gridLabel}.`)
  if (!lampWellFormed(puzzle)) errors.push('The house has a square that is neither floor nor wall.')
  else {
    const wall = puzzle.cells.map((v) => (v === LAMP_FLOOR ? 0 : 1))
    if (wall.some((w, i) => w !== wall[n * n - 1 - i])) errors.push('The walls do not mirror through the centre.')
    if (lampWallBlock(n, wall)) errors.push('Four walls stand in a block.')
    if (!lampFloorConnected(n, wall)) errors.push('A room is walled off.')
    if (puzzle.cells.filter(isLampNumber).length < spec.minNumbers) errors.push('The house has too few numbers for this level.')
    if (!isLampSolution(puzzle, lamps)) errors.push('The answer breaks a rule.')
    else {
      const solve = solveLamp(puzzle, spec.rules)
      if (!solve.solved || lampAnswerKey(solve.lamps) !== lampAnswerKey(lamps)) errors.push('The house cannot be finished by logic alone to its one answer.')
      else if (spec.beyond && solveLamp(puzzle, spec.beyond).solved) errors.push('The house is too easy for this level.')
    }
    if (lampSignature(puzzle) !== built.signature) errors.push('The house’s fingerprint does not match it.')
  }

  // The page.
  if (plan.size !== spec.size) errors.push('The page was planned for another level.')
  if (plan.cell < Math.ceil(spec.minCell) - 1e-6) errors.push('The squares print smaller than this level allows.')
  if (plan.numberSize < LAMP_NUMBER_MIN - 1e-6) errors.push('The numbers print below 16 pt.')
  if (plan.signSize < LAMP_SIGN_MIN - 1e-6) errors.push('The name board prints below 14 pt.')
  const side = spec.size * plan.cell
  if (Math.abs(plan.grid.width - side) > 0.5 || Math.abs(plan.grid.height - side) > 0.5) errors.push('The house is not the level’s size.')
  const sign = lampSignBox(plan, home, font)
  if (lampTextWidth(lampSignText(home, plan.signLines), plan.signSize, lampSignSpec(font)) > sign.width - LAMP_SIGN_PAD_X + 0.5) errors.push(`“${home.name}” does not fit on its board.`)
  const legend = lampLegendBox(plan, font)
  for (const [box, what] of [
    [sign, 'The name board'],
    [legend, 'The legend'],
    [plan.grid, 'The house'],
  ] as const) {
    if (!inside(box, panel)) errors.push(`${what} runs past the printable area of this page.`)
  }
  if (sign.top + sign.height + LAMP_SIGN_GAP_MIN > plan.grid.top + 0.5) errors.push('The name board crowds the house.')
  if (legend.top < plan.grid.top + plan.grid.height + 12) errors.push('The legend crowds the house.')

  // The book.
  const used = new Set(book.map((e) => e.home))
  if (used.has(home.id) && LAMP_HOMES.some((h) => !used.has(h.id))) errors.push(`The book already uses the ${home.name} while other homes wait.`)
  if (book.some((e) => e.signature === built.signature)) errors.push('The book already prints this house.')

  return { ok: errors.length === 0, errors }
}

function walk(obj: StudioFabricObject, visit: (o: StudioFabricObject) => void): void {
  visit(obj)
  for (const child of obj.objects ?? []) walk(child, visit)
}

const hiddenAnswer = (o: StudioFabricObject) => o.visible === false && o.studioRole === 'answer'

/**
 * The drawn page, checked against the house it was drawn from: every wall
 * on its square and no other, every number on its wall, the frame, the lit
 * house waiting, hidden, with a lamp (bulb, base, rays and halo) on exactly
 * every square of the answer and a beam for every stretch of light each
 * lamp throws, the board naming the home, and the legend counting the lamps.
 */
export function checkLampDrawnPage(options: { puzzle: StudioFabricObject; built: LampBuilt; home: LampHome }): string[] {
  const { puzzle: group, built, home } = options
  const { puzzle, lamps } = built
  const n = puzzle.size
  const errors: string[] = []
  const walls = new Set<number>()
  const numbers = new Map<number, number>()
  const bulbs = new Set<number>()
  const pieces = new Map<string, number>()
  const beams: string[] = []
  let frame = 0
  let sign: StudioFabricObject | null = null
  let legendLamps: number | null = null
  let legendSample = 0
  walk(group, (o) => {
    const role = String(o.data?.[LAMP_PART_KEY] ?? '')
    const at = Number(o.data?.row) * n + Number(o.data?.col)
    if (role === 'wall') {
      if (walls.has(at)) errors.push('A wall is drawn twice.')
      walls.add(at)
    } else if (role === 'number') {
      if (numbers.has(at)) errors.push('A number is drawn twice.')
      numbers.set(at, Number(o.text))
      if (o.visible === false) errors.push('A number is hidden on the puzzle page.')
    } else if (role === 'frame') frame++
    else if (role === 'lamp' || role === 'lamp-base' || role === 'lamp-rays' || role === 'halo' || role === 'beam') {
      if (!hiddenAnswer(o)) errors.push('The lit house shows on the puzzle page.')
      if (role === 'lamp') bulbs.add(at)
      if (role === 'beam') beams.push(`${at}:${o.data?.dir}:${o.data?.reach}`)
      else pieces.set(role, (pieces.get(role) ?? 0) + 1)
    } else if (role === 'sign-text') sign = o
    else if (role === 'legend-text' && o.data?.lamps !== undefined) legendLamps = Number(o.data.lamps)
    else if (role === 'legend-number') legendSample++
  })

  const wallsWanted = puzzle.cells.flatMap((v, i) => (v === LAMP_FLOOR ? [] : [i]))
  if (walls.size !== wallsWanted.length || wallsWanted.some((i) => !walls.has(i))) errors.push('The walls do not match the house.')
  const expected = new Map(puzzle.cells.flatMap((v, i) => (isLampNumber(v) ? [[i, v] as const] : [])))
  if (numbers.size !== expected.size || [...expected].some(([at, v]) => numbers.get(at) !== v)) errors.push('The numbers do not match the house.')
  if (frame !== 4) errors.push('The house’s frame is not drawn.')

  if (bulbs.size !== lamps.length || lamps.some((i) => !bulbs.has(i))) errors.push('The answer’s lamps are not where the answer puts them.')
  for (const piece of ['lamp', 'lamp-base', 'lamp-rays', 'halo']) if (pieces.get(piece) !== lamps.length) errors.push('A lamp on the answer page is not drawn whole.')
  const beamsWanted = lampArms(puzzle, lamps).map((a) => `${a.at}:${a.dir}:${a.reach}`)
  if (beams.sort().join(' ') !== beamsWanted.sort().join(' ')) errors.push('The beams do not follow the lamps’ light.')

  const labelled = sign as StudioFabricObject | null
  if (!labelled || String(labelled.text).replace('\n', ' ') !== lampSignText(home)) errors.push('The board does not name the home.')
  if (legendLamps !== lamps.length) errors.push('The legend counts the lamps wrong.')
  if (legendSample !== 1) errors.push('The legend does not show a sample wall.')
  return [...new Set(errors)]
}
