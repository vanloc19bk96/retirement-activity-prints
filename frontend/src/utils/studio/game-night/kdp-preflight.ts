import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import { GN_NIGHTS, gnClueText, gnLegendEntries, gnLevelSpec, gnSignText, type GnBookEntry, type GnLevel, type GnNight } from './content'
import { GN_PART_KEY, gnLegendBox, gnSignBox, gnWallRuns } from './draw'
import { GN_CLUE_MIN, GN_DIGIT_MIN, GN_SIGN_GAP_MIN, GN_SIGN_MIN, GN_SIGN_PAD_X, gnClueDigitAir, gnClueInk, gnClueRoom, gnSignSpec, gnTextWidth, type GnPlan } from './layout'
import { gnBoxesFit, gnHardSteps, gnSignature, type GnBuilt } from './puzzle'
import { gnValuesText, gnWellFormed, isGnSolution, solveGn } from './solver'

export interface KdpPreflightResult {
  ok: boolean
  errors: string[]
}

/** Air kept between a clue’s foot and the answer’s number below it, px. */
export const GN_CLUE_AIR = 3

function inside(inner: Box, outer: Box): boolean {
  return (
    inner.left >= outer.left - 0.5 &&
    inner.top >= outer.top - 0.5 &&
    inner.left + inner.width <= outer.left + outer.width + 0.5 &&
    inner.top + inner.height <= outer.top + outer.height + 0.5
  )
}

/**
 * The last gate before a Game Night page is accepted.
 *
 * A grid with two answers, or one that needs a guess, is a puzzle the
 * reader cannot finish honestly — and they blame themselves. So the grid is
 * proven, not trusted: the answer must keep every rule (1 to N once in
 * every row and column, every box making its number); every box must be one
 * the level prints (its signs only, no number twice in a box, a product that
 * fits its corner, few enough lone numbers); the level's own steps, used the
 * way a reader would, must finish the grid on exactly that answer (which
 * also proves it is the only one) — and the easier steps alone must not,
 * where the level asks for more. Then the page: squares at least the level's
 * floor, clues at least 12 pt inside their corners, the night's name inside
 * its sign, everything on the printable panel with air between; and not a
 * night or a grid the book already uses.
 */
export function runGnKdpPreflight(options: {
  built: GnBuilt
  plan: GnPlan
  level: GnLevel
  night: GnNight
  panel: Box
  font: string
  book?: readonly GnBookEntry[]
}): KdpPreflightResult {
  const { built, plan, level, night, panel, font, book = [] } = options
  const errors: string[] = []
  const spec = gnLevelSpec(level)
  const { puzzle, values } = built

  // The grid.
  if (puzzle.size !== spec.size) errors.push(`The grid is not ${spec.gridLabel}.`)
  if (!gnWellFormed(puzzle)) errors.push('The grid is not well formed.')
  else if (!isGnSolution(puzzle, values)) errors.push('The answer breaks a rule.')
  else {
    if (!gnBoxesFit(puzzle, values, spec)) errors.push('A box is not one this level prints.')
    const solve = solveGn(puzzle, spec.rules)
    if (!solve.solved || gnValuesText(solve.values) !== gnValuesText(values)) errors.push('The grid cannot be finished by logic alone to its one answer.')
    else if ((spec.beyond && solveGn(puzzle, spec.beyond).solved) || gnHardSteps(solve.tally, spec.rules) < spec.minHard) errors.push('The grid is too easy for this level.')
  }
  if (gnSignature(puzzle) !== built.signature) errors.push('The grid’s fingerprint does not match it.')

  // The page.
  if (plan.size !== spec.size) errors.push('The page was planned for another level.')
  if (plan.cell < Math.ceil(spec.minCell) - 1e-6) errors.push('The squares print smaller than this level allows.')
  if (plan.clueSize < GN_CLUE_MIN - 1e-6) errors.push('The clues print below 12 pt.')
  if (plan.digitSize < GN_DIGIT_MIN - 1e-6) errors.push('The answer’s numbers print below 16 pt.')
  if (plan.signSize < GN_SIGN_MIN - 1e-6) errors.push('The sign prints below 14 pt.')
  const room = gnClueRoom(plan.cell)
  if (puzzle.cages.some((c) => gnClueInk(gnClueText(c), plan.clueSize) > room + 0.5)) errors.push('A clue runs out of its square.')
  if (gnClueDigitAir(plan.cell, plan.clueSize, plan.digitSize) < GN_CLUE_AIR) errors.push('A clue crowds the number under it.')
  const side = spec.size * plan.cell
  if (Math.abs(plan.grid.width - side) > 0.5 || Math.abs(plan.grid.height - side) > 0.5) errors.push('The grid is not the level’s size.')
  const sign = gnSignBox(plan, night, font)
  if (gnTextWidth(gnSignText(night, plan.signLines), plan.signSize, gnSignSpec(font)) > sign.width - GN_SIGN_PAD_X + 0.5) errors.push(`“${night.name}” does not fit on its sign.`)
  const legend = gnLegendBox(plan, level, font)
  for (const [box, what] of [
    [sign, 'The sign'],
    [legend, 'The legend'],
    [plan.grid, 'The grid'],
  ] as const) {
    if (!inside(box, panel)) errors.push(`${what} runs past the printable area of this page.`)
  }
  if (sign.top + sign.height + GN_SIGN_GAP_MIN > plan.grid.top + 0.5) errors.push('The sign crowds the grid.')
  if (legend.top < plan.grid.top + plan.grid.height + 12) errors.push('The legend crowds the grid.')

  // The book.
  const used = new Set(book.map((e) => e.night))
  if (used.has(night.id) && GN_NIGHTS.some((s) => !used.has(s.id))) errors.push(`The book already uses ${night.name} while other nights wait.`)
  if (book.some((e) => e.signature === built.signature)) errors.push('The book already prints this grid.')

  return { ok: errors.length === 0, errors }
}

function walk(obj: StudioFabricObject, visit: (o: StudioFabricObject) => void): void {
  visit(obj)
  for (const child of obj.objects ?? []) walk(child, visit)
}

/**
 * The drawn page, checked against the grid it was drawn from: every box's
 * clue in the corner of its first square, the answer's own number waiting
 * hidden in every square, every wall, line and the frame drawn, the sign
 * naming the night, and the legend working one box for every sign the
 * level prints.
 */
export function checkGnDrawnPage(options: { puzzle: StudioFabricObject; built: GnBuilt; night: GnNight; level: GnLevel }): string[] {
  const { puzzle: group, built, night, level } = options
  const { puzzle, values } = built
  const n = puzzle.size
  const errors: string[] = []
  const answers = new Map<number, number>()
  const clues = new Map<number, string>()
  let rules = 0
  let walls = 0
  let frame = 0
  let sign: StudioFabricObject | null = null
  const legend = new Map<string, string[]>()
  walk(group, (o) => {
    const role = String(o.data?.[GN_PART_KEY] ?? '')
    const at = Number(o.data?.row) * n + Number(o.data?.col)
    if (role === 'answer') {
      if (answers.has(at)) errors.push('A square holds two answers.')
      answers.set(at, Number(o.text))
      if (o.visible !== false || o.studioRole !== 'answer') errors.push('The answer shows on the puzzle page.')
    } else if (role === 'clue') {
      if (clues.has(at)) errors.push('A square holds two clues.')
      clues.set(at, String(o.text))
      if (o.visible === false || o.studioRole !== 'prompt') errors.push('A clue is hidden.')
    } else if (role === 'rule') rules++
    else if (role === 'wall') walls++
    else if (role === 'frame') frame++
    else if (role === 'sign-text') sign = o
    else if (role.startsWith('legend-') && o.data?.entry) {
      const entry = String(o.data.entry)
      const item = role === 'legend-number' ? `number:${o.data?.k}:${o.text}` : role === 'legend-clue' || role === 'legend-text' ? `${role}:${o.text}` : role
      legend.set(entry, [...(legend.get(entry) ?? []), item])
    }
  })

  for (let i = 0; i < n * n; i++) if (answers.get(i) !== values[i]) errors.push('A square’s answer is missing or wrong.')
  if (answers.size !== n * n) errors.push('An answer is drawn outside the grid.')
  for (const cage of puzzle.cages) if (clues.get(cage.cells[0]!) !== gnClueText(cage)) errors.push('A box’s clue is missing or wrong.')
  if (clues.size !== puzzle.cages.length) errors.push('A clue is drawn where no box starts.')
  if (rules !== 2 * (n + 1)) errors.push('The lines between squares are not all drawn.')
  if (walls !== gnWallRuns(puzzle).length) errors.push('The walls between boxes are not all drawn.')
  if (frame !== 4) errors.push('The grid’s frame is not drawn.')

  const signed = sign as StudioFabricObject | null
  if (!signed || String(signed.text).replace('\n', ' ') !== gnSignText(night)) errors.push('The sign does not name the night.')
  const entries = gnLegendEntries(level)
  if (legend.size !== entries.length) errors.push('The legend does not show every sign this level prints.')
  for (const e of entries) {
    const items = legend.get(e.op) ?? []
    const shows =
      items.includes(`legend-clue:${gnClueText(e)}`) &&
      items.includes(`legend-text:${e.words}`) &&
      e.values.every((v, k) => items.includes(`number:${k}:${v}`)) &&
      items.filter((p) => p === 'legend-frame').length === 4
    if (!shows) errors.push(`The legend does not work a ${gnClueText(e)} box.`)
  }
  return [...new Set(errors)]
}
