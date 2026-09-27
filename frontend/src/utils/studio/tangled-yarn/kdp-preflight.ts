import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import { TY_PROJECTS, tyLetter, tyLevelSpec, tySignText, type TyBookEntry, type TyLevel, type TyProject } from './content'
import { TY_PART_KEY, tyLegendBox, tySignBox } from './draw'
import { TY_LETTER_MIN, TY_SIGN_GAP_MIN, TY_SIGN_MIN, TY_SIGN_PAD_X, TY_LETTER_ROOM, tyLetterReach, tySignSpec, tyTextWidth, type TyPlan } from './layout'
import { TY_MIN_STRAND, tySignature, type TyBuilt } from './puzzle'
import { isTySolution, pathsOf, solveTy, tyNeighbours, tyPathList } from './solver'

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
 * The last gate before a Tangled Yarn page is accepted.
 *
 * A Numberlink grid with two answers, or one that needs a guess, is a
 * puzzle the reader cannot finish honestly — and they blame themselves. So
 * the grid is proven, not trusted: the balls are read again off the answer
 * and must match; the answer must obey every rule; and the level's own
 * steps, used the way a reader would, must finish the grid on exactly that
 * answer (which also proves it is the only one) — and the steps of the level
 * below must not. Then the page: squares at least the level's floor, letters
 * at 16 pt or more with clear white round them inside their balls, the project's
 * name inside its tag, everything on the printable panel with air between;
 * and not a project the book already uses while others wait.
 */
export function runTyKdpPreflight(options: {
  built: TyBuilt
  plan: TyPlan
  level: TyLevel
  project: TyProject
  panel: Box
  font: string
  book?: readonly TyBookEntry[]
}): KdpPreflightResult {
  const { built, plan, level, project, panel, font, book = [] } = options
  const errors: string[] = []
  const spec = tyLevelSpec(level)
  const { puzzle, paths } = built

  // The grid.
  if (puzzle.rows !== spec.size || puzzle.cols !== spec.size) errors.push(`The grid is not ${spec.gridLabel}.`)
  const pairs = paths.length
  if (pairs < spec.minPairs || pairs > spec.maxPairs) errors.push(`The grid has ${pairs} pairs; this level has ${spec.minPairs} to ${spec.maxPairs}.`)
  const ends = new Array<number>(puzzle.rows * puzzle.cols).fill(0)
  paths.forEach((path, i) => {
    if (path.length === 0) return
    ends[path[0]!] = i + 1
    ends[path[path.length - 1]!] = i + 1
  })
  if (ends.length !== puzzle.ends.length || ends.some((k, i) => k !== puzzle.ends[i])) errors.push('The yarn balls do not match the answer.')
  if (paths.some((path) => path.length < TY_MIN_STRAND || tyNeighbours(path[0]!, path[path.length - 1]!, puzzle.cols))) errors.push('A pair’s balls sit side by side.')
  if (!isTySolution(puzzle, paths)) errors.push('The answer breaks a rule.')
  else {
    const solve = solveTy(puzzle, spec.rules)
    if (!solve.solved || tyPathList(pathsOf(puzzle, solve.state)) !== tyPathList(paths)) errors.push('The grid cannot be finished by logic alone to its one answer.')
    else if (spec.beyond && solveTy(puzzle, spec.beyond).solved) errors.push('The grid is too easy for this level.')
  }
  if (tySignature(puzzle) !== built.signature) errors.push('The grid’s fingerprint does not match it.')

  // The page.
  if (plan.size !== spec.size) errors.push('The page was planned for another level.')
  if (plan.cell < Math.ceil(spec.minCell) - 1e-6) errors.push('The squares print smaller than this level allows.')
  if (plan.letterSize < TY_LETTER_MIN - 1e-6) errors.push('The letters print below 16 pt.')
  if (tyLetterReach(plan.letterSize) > plan.ballRadius * TY_LETTER_ROOM + 1e-6) errors.push('The letters are too big for their yarn balls.')
  if (plan.ballRadius * 2 > plan.cell - 1e-6) errors.push('The yarn balls overfill their squares.')
  if (plan.signSize < TY_SIGN_MIN - 1e-6) errors.push('The tag prints below 14 pt.')
  const side = spec.size * plan.cell
  if (Math.abs(plan.grid.width - side) > 0.5 || Math.abs(plan.grid.height - side) > 0.5) errors.push('The grid is not the level’s size.')
  const sign = tySignBox(plan, project, font)
  if (tyTextWidth(tySignText(project, plan.signLines), plan.signSize, tySignSpec(font)) > sign.width - TY_SIGN_PAD_X + 0.5) errors.push(`“${project.name}” does not fit on its tag.`)
  const legend = tyLegendBox(plan, pairs, font)
  for (const [box, what] of [
    [sign, 'The tag'],
    [legend, 'The legend'],
    [plan.grid, 'The grid'],
  ] as const) {
    if (!inside(box, panel)) errors.push(`${what} runs past the printable area of this page.`)
  }
  if (sign.top + sign.height + TY_SIGN_GAP_MIN > plan.grid.top + 0.5) errors.push('The tag crowds the grid.')
  if (legend.top < plan.grid.top + plan.grid.height + 12) errors.push('The legend crowds the grid.')

  // The book.
  const used = new Set(book.map((e) => e.project))
  if (used.has(project.id) && TY_PROJECTS.some((p) => !used.has(p.id))) errors.push(`The book already uses the ${project.name} while other projects wait.`)
  if (book.some((e) => e.signature === built.signature)) errors.push('The book already prints this grid.')

  return { ok: errors.length === 0, errors }
}

function walk(obj: StudioFabricObject, visit: (o: StudioFabricObject) => void): void {
  visit(obj)
  for (const child of obj.objects ?? []) walk(child, visit)
}

/**
 * The drawn page, checked against the grid it was drawn from: every yarn
 * ball drawn once, in its square, with its pair's letter printed once on
 * it; a strand waiting, hidden, for every pair on exactly the answer's
 * squares; the tag naming the project; and the legend counting the pairs
 * and showing the strand to draw.
 */
export function checkTyDrawnPage(options: { puzzle: StudioFabricObject; built: TyBuilt; project: TyProject }): string[] {
  const { puzzle: group, built, project } = options
  const { puzzle, paths } = built
  const errors: string[] = []
  const balls = new Map<string, StudioFabricObject>()
  const letters = new Map<string, string[]>()
  const strands = new Map<number, string>()
  let sign: StudioFabricObject | null = null
  let legendCount: number | null = null
  let legendStrand = 0
  walk(group, (o) => {
    const role = o.data?.[TY_PART_KEY]
    const at = `${o.data?.row},${o.data?.col}`
    if (role === 'ball') {
      if (balls.has(at)) errors.push('A yarn ball is drawn twice.')
      balls.set(at, o)
      if (o.visible === false) errors.push('A yarn ball is hidden on the puzzle page.')
    } else if (role === 'ball-letter') {
      letters.set(at, [...(letters.get(at) ?? []), String(o.text)])
      if (o.visible === false) errors.push('A letter is hidden on the puzzle page.')
    } else if (role === 'strand') {
      const k = Number(o.data?.k)
      if (strands.has(k)) errors.push('A pair has two strand drawings.')
      strands.set(k, String(o.data?.cells))
      if (o.visible !== false || o.studioRole !== 'answer') errors.push('A strand shows on the puzzle page.')
    } else if (role === 'sign-text') sign = o
    else if (role === 'legend-text' && o.data?.pairs !== undefined) legendCount = Number(o.data.pairs)
    else if (role === 'legend-strand') {
      legendStrand++
      if (o.visible === false) errors.push('The legend’s strand is hidden.')
    }
  })

  let expected = 0
  puzzle.ends.forEach((k, i) => {
    if (k === 0) return
    expected++
    const at = `${Math.floor(i / puzzle.cols)},${i % puzzle.cols}`
    const ball = balls.get(at)
    if (!ball) errors.push('A yarn ball is missing from the grid.')
    else if (Number(ball.data?.k) !== k) errors.push('A yarn ball is drawn for the wrong pair.')
    const got = letters.get(at) ?? []
    if (got.length !== 1 || got[0] !== tyLetter(k)) errors.push(`The ball at row ${Math.floor(i / puzzle.cols) + 1}, column ${(i % puzzle.cols) + 1} prints ${got.join(' ') || 'nothing'} instead of ${tyLetter(k)}.`)
  })
  if (balls.size !== expected || letters.size !== expected) errors.push('The grid draws a different number of yarn balls.')

  paths.forEach((path, i) => {
    const drawn = strands.get(i + 1)
    if (drawn === undefined) errors.push('The answer is missing a strand.')
    else if (drawn !== path.join('.')) errors.push('The answer draws a strand off its squares.')
  })
  if (strands.size !== paths.length) errors.push('The answer draws a strand the grid does not have.')

  const signed = sign as StudioFabricObject | null
  if (!signed || String(signed.text).replace('\n', ' ') !== tySignText(project)) errors.push('The tag does not name the project.')
  if (legendCount !== paths.length) errors.push('The legend counts the pairs wrong.')
  if (legendStrand !== 1) errors.push('The legend does not show the strand to draw.')
  return [...new Set(errors)]
}
